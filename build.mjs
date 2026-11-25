import * as esbuild from 'esbuild';
import fs from 'fs';
const out = process.argv[2] || 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out + '/assets', { recursive: true });
fs.mkdirSync(out + '/fonts', { recursive: true });
const common = { bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'none', logLevel: 'warning' };
await esbuild.build({ ...common, entryPoints: ['src/js/main.js'], outfile: out + '/app.js' });
await esbuild.build({ ...common, entryPoints: ['node_modules/three-mesh-bvh/src/workers/generateMeshBVH.worker.js'], outfile: out + '/generateMeshBVH.worker.js' });
fs.copyFileSync('src/index.html', out + '/index.html');
fs.copyFileSync('src/styles.css', out + '/styles.css');
fs.copyFileSync('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', out + '/fonts/inter-var.woff2');
for (const f of ['turbo_hi.glb', 'turbo_lo.glb', 'flow_paths.json']) fs.copyFileSync('assets/' + f, out + '/assets/' + f);
// GitHub Pages build (--pages): no local starters
if (!process.argv.includes('--pages')) for (const f of ['Praesentation starten.bat', 'server.ps1', 'Praesentation starten (Mac).command']) if (fs.existsSync('extra/' + f)) fs.copyFileSync('extra/' + f, out + '/' + f);
console.log('built', out);
