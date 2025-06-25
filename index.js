const express = require('express');
const cors = require('cors');
const puppeteerCore = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

const app = express();
app.use(express.json());
app.use(cors()); // Allow cross-origin requests

async function checkFlyerID(flyerId, firstName, lastName) {
  // Determine if running locally or on Render (or another AWS-compatible env)
  const isDev = !process.env.AWS_REGION;

  const browser = await (isDev
    ? puppeteerCore.launch({ headless: true }) // local Puppeteer (make sure puppeteer is installed locally if you use this)
    : chromium.puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      }));

  const page = await browser.newPage();

  try {
    await page.goto('https://register-drones.caa.co.uk/check-a-registration', { waitUntil: 'networkidle2' });

    await page.waitForSelector('#start-button', { visible: true, timeout: 10000 });
    await Promise.all([
      page.click('#start-button'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    await page.waitForSelector('input[name="RegistrationNumber"]', { visible: true });
    await page.type('input[name="RegistrationNumber"]', flyerId);

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    await page.waitForSelector('input[name="GivenName"]', { visible: true });
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
