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

    // Fill login form
    // find input with type email
    await page.type('input[type="email"]', 'hrac2@test.sk');
    await page.type('input[type="password"]', 'heslo123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 3000));

    // Now reload 
    await page.evaluate(() => {
        sessionStorage.setItem('ab_quiz_current_app', 'portal_lobby');
    });

    await page.reload();
    await new Promise(r => setTimeout(r, 3000));

    // Output all text to see what rendered
    const text = await page.evaluate(() => document.body.innerText);
    console.log('BODY TEXT:\\n', text);

    await browser.close();
})();
