import puppeteer from 'puppeteer-core';
const [,,tier='light', steps='photo'] = process.argv;
const b = await puppeteer.launch({ headless: false, defaultViewport: null, executablePath: '/usr/bin/google-chrome', protocolTimeout: 600000,
  args: ['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--ignore-gpu-blocklist','--window-size=1280,860'] });
const pg = await b.newPage();
await pg.setViewport({ width: 1280, height: 760 });
pg.on('console', m => { const t=m.text(); if(!/GPU stall|Failed to load resource.*favicon/.test(t)) console.log('[c]', t.slice(0,400)); });
pg.on('pageerror', e => console.log('[err]', e.message));
await pg.goto('http://localhost:8080/dist/index.html'+(process.env.Q||''), { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
await pg.mouse.move(380, 560); await new Promise(r=>setTimeout(r,800)); await pg.screenshot({ path: 'shots/00_pre.png' });
await pg.click(`input[value=${tier}]`).catch(()=>{});
await new Promise(r=>setTimeout(r,2500)); await pg.evaluate(t => { const i=document.querySelector(`input[value=${t}]`); i.checked=true; i.dispatchEvent(new Event('change')); }, tier);
await pg.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 });
await pg.screenshot({ path: 'shots/01_ready.png' });
await pg.click('#pl-start');
const t0=Date.now();
await pg.waitForFunction('!document.querySelector("#preloader")', { timeout: 300000 }).catch(e=>console.log('preloader still there'));
console.log('started after', Date.now()-t0);
await new Promise(r => setTimeout(r, 6000));
await pg.screenshot({ path: 'shots/02_main.png' });
for (const s of steps.split(',')) {
  if (s==='photo') continue;
  if (s.startsWith('key')) { await pg.keyboard.press(s.slice(3)); await new Promise(r=>setTimeout(r,9000)); await pg.screenshot({ path: `shots/03_${s}.png` }); continue; }
  if (s.startsWith('wait')) { await new Promise(r=>setTimeout(r, +s.slice(4)*1000)); await pg.screenshot({ path: `shots/03_${s}.png` }); continue; }
  await pg.click(`[data-mode=${s}]`);
  await new Promise(r => setTimeout(r, 8000));
  await pg.screenshot({ path: `shots/03_${s}.png` });
}
console.log(await pg.evaluate(() => document.querySelector('#rt-pill')?.innerText));
await b.close();
