const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('CAA Checker API is live'));

async function checkFlyerID(flyerId, firstName, lastName) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  // ... (navigation and scraping logic as before) ...
  await browser.close();
  return { name, flyerId, status, expiry };
}

app.post('/check', async (req, res) => {
  const { flyerId, firstName, lastName } = req.body;
  if (!flyerId || !firstName || !lastName) {
    return res.status(400).json({ error: 'Missing flyerId, firstName or lastName' });
  }
  try {
    const result = await checkFlyerID(flyerId, firstName, lastName);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
