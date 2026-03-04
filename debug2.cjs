const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
        else console.log('LOG:', msg.text());
    });

    page.on('pageerror', error => console.log('PAGE EXCEPTION:', error.message));

    await page.goto('http://localhost:5173/');
    await new Promise(r => setTimeout(r, 2000));

    // Set session storage and reload
    await page.evaluate(() => {
        sessionStorage.setItem('ab_quiz_current_app', 'portal_lobby');
        // MOCK login maybe?
    });

    await page.reload();
    await new Promise(r => setTimeout(r, 2000));

    await browser.close();
})();
