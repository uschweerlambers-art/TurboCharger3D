import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: false, defaultViewport: null, protocolTimeout: 900000,
  args: ['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--ignore-gpu-blocklist','--window-size=1280,860'] });
const pg = await b.newPage();
pg.on('pageerror', e => console.log('[err]', e.message));
await pg.goto('http://localhost:8080/dist/index.html?debug&nopt', { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,2000));
await pg.evaluate(() => { const i=document.querySelector('input[value=light]'); i.checked=true; i.dispatchEvent(new Event('change')); });
await pg.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 });
await pg.type('#pl-pass', 'Falsch'); await pg.click('#pl-start'); await new Promise(r=>setTimeout(r,250));
await pg.screenshot({ path: 'shots/g_wrong.png' });
console.log('app after wrong:', await pg.evaluate(()=>!!window.__app));
await pg.evaluate(()=>{ document.querySelector('#pl-pass').value=''; }); await pg.type('#pl-pass', 'Turbo'); await pg.keyboard.press('Enter'); await new Promise(r=>setTimeout(r,1500)); console.log('after ok:', await pg.evaluate(()=>[document.querySelector('#pl-pass').value, document.querySelector('#pl-pass-msg').textContent, document.querySelector('#pl-start').textContent, document.querySelector('#pl-gate').className]));
await pg.waitForFunction('window.__app', { timeout: 300000 });
await new Promise(r=>setTimeout(r,20000));
await pg.screenshot({ path: 'shots/g_ok.png' });
await pg.reload({ waitUntil: 'load' }); await new Promise(r=>setTimeout(r,3000));
console.log('gate open after reload:', await pg.evaluate(()=>document.querySelector('#pl-gate').classList.contains('open')));
await b.close();
