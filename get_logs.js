const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}`);
  });
  
  await page.goto('http://localhost:5174/');
  await page.waitForTimeout(3000);
  console.log("--- End of logs ---");
  await browser.close();
})();
