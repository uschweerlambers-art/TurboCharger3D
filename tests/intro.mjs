import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: false, defaultViewport: null, protocolTimeout: 900000,
  args: ['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--ignore-gpu-blocklist','--window-size=1280,860'] });
const pg = await b.newPage();
pg.on('pageerror', e => console.log('[err]', e.message));
pg.on('console', m => { const t=m.text(); if(/rror|LOST/.test(t) && !/createBuffer|favicon/.test(t)) console.log('[c]', t.slice(0,300)); });
await pg.goto('http://localhost:8080/dist/index.html?debug&nopt', { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,2500));
await pg.evaluate(() => { const i=document.querySelector('input[value=light]'); i.checked=true; i.dispatchEvent(new Event('change')); });
if (process.env.PASS !== undefined) { await pg.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 }); await pg.type('#pl-pass', process.env.PASS); }
await pg.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 });
await pg.mouse.move(640, 300); await new Promise(r=>setTimeout(r,600));
await pg.screenshot({ path: 'shots/i0_pre.png' });
await pg.click('#pl-start');
await pg.waitForFunction('window.__app', { timeout: 300000 });
const shots = (process.env.SHOTS || '1000,2500,4500,8000').split(',').map(Number);
let t0 = Date.now();
for (const [i, t] of shots.entries()) { const w = t - (Date.now() - t0); if (w > 0) await new Promise(r=>setTimeout(r,w)); await pg.screenshot({ path: `shots/i${i+1}.png` }); console.log('shot', i+1, 'front', await pg.evaluate(()=>window.__app.state.intro ? 'intro' : 'done')); }
const steps = (process.env.STEPS || '').split(',').filter(Boolean);
for (const s of steps) {
  const [mode, ms] = s.split(':');
  if (mode !== 'wait') await pg.evaluate(m => window.__app.setMode(m), mode);
  await new Promise(r=>setTimeout(r, +ms));
  await pg.screenshot({ path: `shots/s_${s.replace(':','_')}.png` });
}
await b.close();
