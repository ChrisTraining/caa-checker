import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { flyerId, firstName, lastName } = req.body;

  if (!flyerId || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing flyerId, firstName or lastName' });
  }

  try {
    const result = await checkFlyerID(flyerId, firstName, lastName);
    return res.status(200).json({ result });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch data' });
  }
}

async function checkFlyerID(flyerId, firstName, lastName) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    await page.goto('https://register-drones.caa.co.uk/check-a-registration', { waitUntil: 'networkidle2' });

    await page.waitForSelector('#start-button', { visible: true });
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
  } catch (err) {
    await browser.close();
    throw err;
  }
}
