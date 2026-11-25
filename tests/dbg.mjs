import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: false, defaultViewport: null, protocolTimeout: 600000,
  args: ['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--ignore-gpu-blocklist','--window-size=1280,860'] });
const pg = await b.newPage();
pg.on('console', m => { const t=m.text(); if(!/GPU stall|ClusteredBVH|favicon|404/.test(t)) console.log('[c]', t.slice(0,600)); });
pg.on('pageerror', e => console.log('[err]', e.message));
await pg.goto('http://localhost:8080/dist/index.html?debug&nopt&simfast=4'+(process.env.Q||''), { waitUntil: 'load' });
await new Promise(r=>setTimeout(r,2500)); await pg.evaluate(() => { const i=document.querySelector('input[value=light]'); i.checked=true; i.dispatchEvent(new Event('change')); });
await pg.waitForFunction('!document.querySelector("#pl-start").disabled', { timeout: 120000 });
await pg.click('#pl-start');
await pg.waitForFunction('window.__app', { timeout: 300000 });
await new Promise(r=>setTimeout(r,2000));
const script = process.argv[2];
const res = await pg.evaluate(new Function('return (async()=>{'+script+'})()'));
console.log(JSON.stringify(res).slice(0,3000));
if (process.argv[3]) { await new Promise(r=>setTimeout(r,+process.argv[4]||5000)); await pg.screenshot({path: process.argv[3]}); }
await b.close();
