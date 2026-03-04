const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('pageerror', error => console.log('CRASH:', error.message));

    await page.goto('http://localhost:5173/');
    await new Promise(r => setTimeout(r, 2000));

    await page.type('input[type="email"]', 'hrac1@test.sk');
    await page.type('input[type="password"]', 'heslo123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => {
        sessionStorage.setItem('ab_quiz_current_app', 'portal_lobby');
    });

    await page.reload();
    await new Promise(r => setTimeout(r, 2000));

    const html = await page.evaluate(() => document.body.innerHTML);
    if (html.includes('Zavrieť Lobby')) {
        console.log("RENDERED SUCCESSFULLY");
        console.log(html);
    } else {
        console.log("NOT RENDERED OR CRASH");
        console.log(html);
    }

    await browser.close();
})();
