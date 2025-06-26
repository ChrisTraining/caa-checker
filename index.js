const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const isProduction = process.env.AWS_REGION || process.env.NODE_ENV === 'production';

async function getBrowser() {
  if (isProduction) {
    const chromium = require('chrome-aws-lambda');
    const puppeteer = require('puppeteer-core');
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
  } else {
    const puppeteer = require('puppeteer');
    return puppeteer.launch({ headless: true });
  }
}

async function checkFlyerID(flyerId, firstName, lastName) {
  const browser = await getBrowser();
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
        const label = row.querySelector('.govuk-summary-card__row__field-label');
        const valueDiv = row.querySelector('.govuk-summary-card__row__field-value');
        const key = label?.innerText.trim();
        const value = valueDiv?.innerText.trim();
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
    return data;
  } catch (error) {
    await browser.close();
    console.error('[ERROR]', error.message);
    throw error;
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
    res.status(500).json({ error: error.message || 'Failed to fetch data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
