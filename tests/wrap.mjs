import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: false, defaultViewport: null, protocolTimeout: 900000,
  args: ['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--ignore-gpu-blocklist','--window-size=1440,900'] });
const pg = await b.newPage();
pg.on('pageerror', e => console.log('[err]', e.message));
await pg.goto('http://localhost:8081/index.html', { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,8000));
await pg.screenshot({ path: 'shots/w_pre.png' });
const fr = pg.frames().find(f => f.url().includes('praesentation'));
await fr.evaluate(() => { const i=document.querySelector('input[value=light]'); i.checked=true; i.dispatchEvent(new Event('change')); });
await fr.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 });
await fr.type('#pl-pass', 'Turbo'); await fr.click('#pl-start');
await new Promise(r=>setTimeout(r,1000));
await pg.screenshot({ path: 'shots/w_run.png' });
await b.close();
