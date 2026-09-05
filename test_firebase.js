const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: 'new',
        executablePath: 'C:\\Users\\VIKI\\.cache\\puppeteer\\chrome\\win64-152.0.7977.54\\chrome-win64\\chrome.exe'
    });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error(`[BROWSER EXCEPTION] ${err.message}`);
    });

    const fileUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/index.html';
    console.log(`Navigating to ${fileUrl}`);
    
    await page.goto(fileUrl, { waitUntil: 'networkidle2' });
    
    console.log('Waiting 8 seconds for diagnostics to run...');
    await new Promise(r => setTimeout(r, 8000));
    
    await browser.close();
})();
