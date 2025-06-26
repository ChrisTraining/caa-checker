const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running');
});

async function checkFlyerID(flyerId, firstName, lastName) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // 1. Load the initial "Check a registration" page
    await page.goto('https://register-drones.caa.co.uk/check-a-registration', { waitUntil: 'networkidle' });

    // 2. Click the "Start now" button
    await page.waitForSelector('#start-button', { state: 'visible', timeout: 10000 });
    await Promise.all([
      page.click('#start-button'),
      page.waitForNavigation({ waitUntil: 'networkidle' }),
    ]);

    // 3. Wait for and enter the registration number
    await page.waitForSelector('input[name="RegistrationNumber"]', { state: 'visible' });
    await page.fill('input[name="RegistrationNumber"]', flyerId);

    // 4. Submit the registration number
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' }),
    ]);

    // 5. Wait for and enter the name fields
    await page.waitForSelector('input[name="GivenName"]', { state: 'visible' });
    await page.fill('input[name="GivenName"]', firstName);
    await page.fill('input[name="FamilyName"]', lastName);

    // 6. Submit the name form
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle' }),
    ]);

    // 7. Check for error summary
    const errorMessage = await page.$('.govuk-error-summary');
    if (errorMessage) {
      const text = await errorMessage.innerText();
      throw new Error('Validation failed: ' + text.trim());
    }

    // 8. Extract confirmation data
    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('.govuk-summary-card__row');
      const details = {};
      rows.forEach(row => {
        const labels = row.querySelectorAll('.govuk-summary-card__row__field-label');
        const valueDiv = row.querySelector('.govuk-summary-card__row__field-value');

        let key = labels[0]?.innerText.trim();
        let value = valueDiv ? valueDiv.innerText.trim() : labels[1]?.innerText.trim();

        if (key && value) {
          details[key] = value;
        }
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

  } catch (error) {
    await browser.close();
    console.error('[ERROR]', error.message);
    throw error;
  }
}

app.post('/api/check', async (req, res) => {
  const { flyerId, firstName, lastName } = req.body;

  if (!flyerId || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing flyerId, firstName or lastName' });
  }

  try {
    const result = await checkFlyerID(flyerId, firstName, lastName);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
