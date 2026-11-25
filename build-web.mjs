// Builds the hosted variant (Claude artifact / any static host that refuses binary
// files): binaries are shipped as base64 JSON and decoded by a small fetch shim.
// Usage: node build.mjs dist && node build-web.mjs dist web
import fs from 'fs';
import path from 'path';
const [src = 'dist', out = 'web'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
const copy = (a, b = a) => { fs.mkdirSync(path.dirname(path.join(out, b)), { recursive: true }); fs.copyFileSync(path.join(src, a), path.join(out, b)); };
const b64 = (a) => { const t = path.join(out, a + '.json'); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, JSON.stringify(fs.readFileSync(path.join(src, a)).toString('base64'))); };
for (const f of ['styles.css', 'app.js', 'generateMeshBVH.worker.js', 'fonts/inter-var.woff2', 'assets/flow_paths.json']) copy(f);
for (const f of ['assets/turbo_hi.glb', 'assets/turbo_lo.glb']) b64(f);
const shim = `<script>
// Binary model files are shipped as base64 JSON in this hosted version.
(()=>{const f=window.fetch.bind(window);window.fetch=async(u,o)=>{const s=typeof u==='string'?u:(u&&u.url)||String(u);if(/assets\\/[^?#]+\\.(glb|bin|wasm|task)$/.test(s)){if(o&&o.method==='HEAD')return f(s+'.json',o);const r=await f(s+'.json',o);if(!r.ok)return r;const b=atob(await r.json());const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const type=s.endsWith('.wasm')?'application/wasm':'application/octet-stream';return new Response(a,{headers:{'content-length':String(a.length),'content-type':type}});}return f(u,o);};})();
</script>
`;
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8').replace('<script type="module" src="app.js"></script>', shim + '<script type="module" src="app.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('built hosted variant', out);
