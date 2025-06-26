const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('CAA Checker API is running.'));

app.post('/check', async (req, res) => {
  const { flyerId, firstName, lastName } = req.body;

  if (!flyerId || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing flyerId, firstName or lastName' });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://register-drones.caa.co.uk/check-a-registration', { waitUntil: 'networkidle' });

    await page.click('#start-button');
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    await page.type('input[name="RegistrationNumber"]', flyerId);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' }),
    ]);

    await page.type('input[name="GivenName"]', firstName);
    await page.type('input[name="FamilyName"]', lastName);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' }),
    ]);

    const errorMessage = await page.$('.govuk-error-summary');
    if (errorMessage) {
      const text = await page.evaluate(el => el.innerText, errorMessage);
      throw new Error('Validation failed: ' + text.trim());
    }

    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('.govuk-summary-card__row');
      const details = {};
      rows.forEach(row => {
        const key = row.querySelector('.govuk-summary-card__row__field-label')?.innerText.trim();
        const value = row.querySelector('.govuk-summary-card__row__field-value')?.innerText.trim();
        if (key && value) details[key] = value;
      });
      return {
        name: details['Name'] || null,
        flyerId: details['Flyer ID'] || null,
        status: details['Status'] || null,
        expiry: details['Expiry date'] || null,
      };
    });

    await browser.close();
    res.json({ result: data });

  } catch (error) {
    await browser.close();
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
