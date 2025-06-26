const express = require('express');
const puppeteer = require('puppeteer-core');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('CAA Checker is up');
});

async function checkFlyerID(flyerId, firstName, lastName) {
  const browserFetcher = chromium;
  const browser = await puppeteer.launch({
    executablePath: browserFetcher.executablePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://register-drones.caa.co.uk/check-a-registration', { waitUntil: 'networkidle2' });

    await page.click('#start-button');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await page.type('input[name="RegistrationNumber"]', flyerId);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    await page.type('input[name="GivenName"]', firstName);
    await page.type('input[name="FamilyName"]', lastName);
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
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
        const label = row.querySelector('.govuk-summary-card__row__field-label')?.innerText.trim();
        const value = row.querySelector('.govuk-summary-card__row__field-value')?.innerText.trim();
        if (label && value) details[label] = value;
      });

      return {
        name: details['Name'] || null,
        flyerId: details['Flyer ID'] || null,
        status: details['Status'] || null,
        expiry: details['Expiry date'] || null,
      };
    });

    await browser.close();
    return data;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

app.post('/check', async (req, res) => {
  const { flyerId, firstName, lastName } = req.body;
  if (!flyerId || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing flyerId, firstName or lastName' });
  }

  try {
    const result = await checkFlyerID(flyerId, firstName, lastName);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
