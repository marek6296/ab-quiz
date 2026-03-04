const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text()); });
    page.on('pageerror', error => console.log('PAGE EXCEPTION:', error.message));

    await page.goto('http://localhost:5173/');
    await new Promise(r => setTimeout(r, 2000));

    // Switch to register tab
    await page.evaluate(() => {
        document.querySelector('.text-button').click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Register a totally random user
    const randomUser = 'test' + Date.now() + '@test.sk';
    await page.type('input[placeholder="Zadaj prezývku"]', 'Tester' + Math.floor(Math.random() * 1000));
    await page.type('input[type="email"]', randomUser);
    await page.type('input[type="password"]', 'heslo123');
    await page.click('button[type="submit"]');

    await new Promise(r => setTimeout(r, 4000));

    // Now we should be logged in and at the portal
    await page.evaluate(() => {
        sessionStorage.setItem('ab_quiz_current_app', 'portal_lobby');
    });

    await page.reload();
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.evaluate(() => document.body.innerHTML);
    if (html.includes('Zavrieť Lobby')) {
        console.log("RENDERED SUCCESSFULLY");
    } else {
        console.log("CRASH HTML:", html);
    }

    await browser.close();
})();
