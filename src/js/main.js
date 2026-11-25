import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, screenUV, vec2, vec3, vec4, float, mix, smoothstep, length, builtinAOContext, uniform, positionWorld, abs, fract, fwidth, min, max } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { acceleratedRaycast } from 'three-mesh-bvh';

import { createStudioEnvironment } from './env.js';
import { loadModel, cut, xray, reveal, useGhostMaterials } from './model.js';
import { startPreloaderBackdrop, splitReveal } from './preloader-bg.js';
import { CameraRig } from './rig.js';
import { Assembly } from './assembly.js';
import { Flow, loadFlowPaths } from './flow.js';
import { PathTrace } from './pathtrace.js';
import { Sound } from './audio.js';
import { Look, PRESETS, formatLook } from './look.js';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const PRODUCT_NAME = 'Turbo Charger';
const ASSETS = 'assets/';

const TIERS = {
	ultra: { model: 'turbo_hi.glb', particles: 900000, dpr: 2, ao: true, bloom: true, msaa: 4, ptSamples: 1024, ptScale: 0.85, ptBounces: 8, ptFadeAt: 3 },
	balanced: { model: 'turbo_hi.glb', particles: 450000, dpr: 1.5, ao: false, bloom: true, msaa: 4, ptSamples: 1024, ptScale: 0.65, ptBounces: 6, ptFadeAt: 2 },
	light: { model: 'turbo_lo.glb', particles: 140000, dpr: 1.5, ao: false, bloom: false, msaa: 1, ptSamples: 1024, ptScale: 0.5, ptBounces: 4, ptFadeAt: 2 },
};

const DBG = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = new Intl.NumberFormat('de-DE');
const fmtMB = n => (n / 1048576).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

$$('[data-product-name]').forEach(e => { e.textContent = PRODUCT_NAME; });
$$('.reveal').forEach(splitReveal);
const stopBackdrop = startPreloaderBackdrop($('#pl-bg'), { reducedMotion });

// ===========================================================================
// Preloader: device choice + determinate loading
// ===========================================================================
const state = {
	tier: null, hasWebGPU: false, mode: 'photo', started: false,
	modelPromise: null, modelTierFile: null, model: null, sdf: null,
	lastInteraction: performance.now(), rpm: 120000, spin: 0, spinAngle: 0, view: 'cut', cutOpen: 1, density: 0.6, labelsOn: true, ghost: false, rtArmed: false, rtPrep: 0,
};

const progressUI = {
	set(frac, text) {
		const pct = Math.round(frac * 100);
		$('.pl-progress .bar i').style.width = pct + '%';
		$('.pl-progress').setAttribute('aria-valuenow', pct);
		if (text) $('#pl-status').textContent = text;
	},
};

async function detectTier() {
	const ua = navigator.userAgent;
	const mobile = /Android|iPhone|iPod/i.test(ua) || (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	let adapter = null;
	try { adapter = navigator.gpu ? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null; } catch { /* no webgpu */ }
	state.hasWebGPU = !!adapter;
	const info = adapter?.info || {};
	const vendor = (info.vendor || '').toLowerCase();
	const arch = (info.architecture || '').toLowerCase();
	const cores = navigator.hardwareConcurrency || 4;
	let tier = 'balanced';
	if (mobile) tier = 'light';
	else if (/nvidia|amd|ati/.test(vendor) && !/integrated/.test(arch)) tier = 'ultra';
	else if (vendor === 'apple' && cores >= 10) tier = 'ultra';
	if (!adapter) tier = mobile ? 'light' : 'balanced';
	return { tier, adapterName: [info.vendor, info.architecture].filter(Boolean).join(' ') };
}

function selectTier(tier, recommended) {
	state.tier = tier;
	const input = $(`input[name=tier][value=${tier}]`);
	input.checked = true;
	if (recommended) $$('.device').forEach(d => { d.querySelector('.badge').hidden = d.dataset.tier !== tier; });
	ensureModel();
}

let modelAbort = null;
function ensureModel() {
	const file = TIERS[state.tier].model;
	if (state.modelTierFile === file) return;
	modelAbort?.abort();
	modelAbort = new AbortController();
	state.modelTierFile = file;
	state.model = null;
	const myFile = file;
	$('#pl-start').disabled = true;
	state.modelPromise = (async () => {
		progressUI.set(0, 'Modell wird geladen');
		const model = await loadModel(ASSETS + file, (l, t) => {
			if (state.modelTierFile !== myFile) return;
			const f = t ? l / t : 0;
			progressUI.set(f * 0.8, t ? `Modell wird geladen · ${fmtMB(l)} von ${fmtMB(t)} MB` : 'Modell wird geladen');
		});
		if (state.modelTierFile !== myFile) return null;
		progressUI.set(0.86, 'Strömungspfade werden geladen');
		state.paths ||= await loadFlowPaths(ASSETS);
		progressUI.set(0.9, 'Bereit');
		state.model = model;
		progressUI.set(1, 'Bereit');
		$('#pl-start').disabled = false;
		return model;
	})();
	state.modelPromise.catch(err => {
		console.error(err);
		progressUI.set(0, 'Das Modell konnte nicht geladen werden. Bitte die Seite über den mitgelieferten Starter öffnen.');
	});
}

(async () => {
	const { tier, adapterName } = await detectTier();
	selectTier(tier, true);
	const note = $('#pl-device-note');
	if (!state.hasWebGPU) note.textContent = 'WebGPU ist in diesem Browser nicht verfügbar. Raytracing und Strömung benötigen Chrome oder Edge in aktueller Version.';
	else if (adapterName) note.textContent = 'Erkannte Grafik: ' + adapterName;
	$$('input[name=tier]').forEach(i => i.addEventListener('change', () => selectTier(i.value, false)));
})();

// password gate: keeps casual visitors out (no real protection – the files are public)
const PASS_HASH = 'c3449cd99d19554da590a1d8a779f7c583577738f0bc8af1956d5f74bd51194a';
const passOk = (() => { try { return sessionStorage.getItem('tc-pass') === PASS_HASH; } catch { return false; } })();
if (passOk) $('#pl-gate').classList.add('open');
async function checkPass(v) {
	v = v.trim().toLowerCase();
	if (!crypto.subtle) return v === 'tur' + 'bo';
	const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
	return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') === PASS_HASH;
}
$('#pl-pass').addEventListener('input', () => { $('#pl-pass-msg').textContent = ''; $('.pl-pass').classList.remove('wrong'); });
$('#pl-gate').addEventListener('submit', async e => {
	e.preventDefault();
	const btn = $('#pl-start');
	if (btn.disabled) return;
	if (!$('#pl-gate').classList.contains('open')) {
		const field = $('.pl-pass');
		if (!(await checkPass($('#pl-pass').value))) {
			field.classList.remove('wrong'); void field.offsetWidth; field.classList.add('wrong');
			$('#pl-pass-msg').textContent = $('#pl-pass').value ? 'Das Passwort stimmt nicht.' : 'Bitte das Passwort eingeben.';
			$('#pl-pass').focus(); $('#pl-pass').select();
			return;
		}
		try { sessionStorage.setItem('tc-pass', PASS_HASH); } catch {}
		$('#pl-pass-msg').textContent = '';
	}
	btn.disabled = true; btn.textContent = 'Wird vorbereitet …';
	try {
		await state.modelPromise;
		await start();
	} catch (err) {
		console.error(err);
		btn.textContent = 'Erneut versuchen'; btn.disabled = false;
		progressUI.set(0, 'Start fehlgeschlagen: ' + (err.message || err));
	}
});

// ===========================================================================
// Main
// ===========================================================================
const bgAspect = uniform(1);
let look;
let renderer, scene, camera, rig, assembly, flow, pathTrace, pipeline, sound, model, grid, labels = [];

async function start() {
	const tier = TIERS[state.tier];
	const canvas = $('#stage');
	renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', trackTimestamp: true });
	await renderer.init();
	renderer.onDeviceLost = info => console.error('DEVICE LOST', info?.message, info?.reason);
	renderer.setPixelRatio(Math.min(devicePixelRatio, tier.dpr));
	renderer.setSize(innerWidth, innerHeight, false);
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = 1.0;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const isWebGPU = !!renderer.backend?.isWebGPUBackend;

	scene = new THREE.Scene();
	const env = createStudioEnvironment();
	scene.environment = env;
	// background: a quiet graphite glow behind the product (content layer)
	const aspect = bgAspect;
	const bgD = length(screenUV.sub(vec2(0.5, 0.18)).mul(vec2(aspect, 1.0)));
	scene.backgroundNode = mix(vec3(0.016, 0.016, 0.019), vec3(0.0, 0.0, 0.0), smoothstep(0.0, 0.95, bgD));

	camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.05, 60);

	model = state.model;
	// installed orientation: shaft horizontal, compressor inlet facing the viewer
	// (shaft along the view axis, turbine side and its inlet pipe towards the viewer, pipe opening to the right)
	model.root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
	model.root.updateMatrixWorld(true);
	scene.add(model.root);

	rig = new CameraRig(camera, canvas, { reducedMotion });
	rig.onUserInput = () => { state.lastInteraction = performance.now(); };
	assembly = new Assembly({ groups: model.groups, meshes: model.meshes, camera, dom: canvas, reducedMotion });
	assembly.addEventListener('snap', e => { sound.click(e.detail.userData.mass); navigator.vibrate?.(8); });
	assembly.addEventListener('grab', () => { state.lastInteraction = performance.now(); });

	sound = new Sound();

	// flow particles
	if (isWebGPU && !DBG.has('noflow')) {
		try {
			flow = new Flow({ renderer, count: tier.particles, paths: state.paths });
			model.root.add(flow.object);
			await flow.init();
			flow.setRpm(state.rpm);
			flow.setVisibleCount(tier.particles * state.density);
			if (DBG.has('simfast')) flow.timeScale = +DBG.get('simfast') || 6;
		} catch (err) { console.warn('Strömung nicht verfügbar', err); flow = null; }
	}
	if (!flow) $('[data-mode=flow]').disabled = true;

	// path tracer (prepared in the background after the intro)
	pathTrace = new PathTrace({ renderer, camera, env, tier });

	// ---------------- post pipeline
	pipeline = new THREE.RenderPipeline(renderer);
	const scenePass = pass(scene, camera, { samples: tier.msaa });
	if (tier.ao && isWebGPU && !DBG.has('noao')) {
		const pre = pass(scene, camera);
		pre.setMRT(mrt({ output: normalView }));
		const aoPass = ao(pre.getTextureNode('depth'), pre.getTextureNode(), camera);
		aoPass.resolutionScale = 0.5;
		aoPass.radius.value = 0.12;
		aoPass.thickness.value = 0.6;
		scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
	}
	const raster = scenePass.getTextureNode('output');
	const pt = pathTrace.colorNode();
	const over = pt.rgb.add(raster.rgb.mul(float(1).sub(pt.a)));
	const comp = mix(raster.rgb, over, pathTrace.fade);
	look = new Look();
	look.u.aspect = bgAspect;
	const graded = look.build(comp, tier.bloom ? c => bloom(vec4(c, 1), 0.22, 0.3, 0.92) : null);
	pipeline.outputNode = vec4(graded, 1);
	look.apply(renderer, pipeline);

	// labels
	const labelLayer = $('#labels');
	for (const g of Object.values(model.groups)) {
		if (!g.userData.label) continue;
		const el = document.createElement('div');
		el.className = 'plabel' + (g.userData.side === 'left' ? ' left' : '');
		el.textContent = g.userData.label;
		labelLayer.appendChild(el);
		labels.push({ g, el });
	}

	// warm up: compile materials before revealing
	await renderer.compileAsync(scene, camera);

	// perspective floor grid, well below the product (presentation view only)
	grid = makeFloorGrid();
	scene.add(grid.mesh);

	bindUI();
	onResize();
	addEventListener('resize', onResize);

	// intro: the start screen fades away, the turbo turns into its home pose while
	// an orange wireframe scan sweeps across and reveals the surface
	if (!reducedMotion) {
		rig.az = rig.goal.az = rig.home.az - 1.15;
		rig.pol = rig.goal.pol = 1.52;
		rig.dist = rig.goal.dist = 7.4;
		rig.update(0);
		rig.animateTo({ az: rig.home.az, pol: rig.home.pol, dist: rig.home.dist, target: rig.home.target }, 2.8);
		state.intro = { t: -0.35, dur: 5.4 };
		reveal.front.value = -1.7;
	} else {
		reveal.front.value = 50;
	}
	state.started = true;
	if (DBG.has('debug')) window.__app = { flow, renderer, scene, camera, rig, assembly, pathTrace, model, state, setMode, setView, xray, cut };
	renderer.setAnimationLoop(loop);

	$('#preloader').classList.add('leaving');
	setTimeout(() => stopBackdrop(), 1700);
	$('#ui').hidden = false;
	requestAnimationFrame(() => $('#ui').classList.add('on'));
	setTimeout(() => $('#preloader').remove(), 1700);
	positionThumb();

	// raytracing preparation in the background
	// raytracing: prepared in the background, started only on request
	if (isWebGPU && !DBG.has('nopt')) {
		setTimeout(() => {
			pathTrace.prepare(model.root, p => { state.rtPrep = p; if (state.rtArmed) rtUI(); })
				.then(() => rtUI())
				.catch(err => { console.warn('Raytracing nicht verfügbar', err); pathTrace.enabled = false; rtUI(); });
		}, 900);
		pathTrace.addEventListener('start', () => rtUI());
		pathTrace.addEventListener('stop', () => rtUI());
		pathTrace.addEventListener('progress', () => rtUI());
	} else {
		pathTrace.enabled = false;
	}
	rtUI();
}

// ===========================================================================
// Frame loop
// ===========================================================================
let last = performance.now();
// linear move of a value towards its goal in `dur` seconds (used for all 2 s mode transitions)
const approach = (cur, goal, dt, dur) => reducedMotion ? goal : cur + Math.sign(goal - cur) * Math.min(Math.abs(goal - cur), dt / dur);
const ease = t => t * t * (3 - 2 * t);
function loop() {
	const now = performance.now();
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;

	// intro reveal sweep
	if (state.intro) {
		state.intro.t += dt;
		const k = Math.min(1, Math.max(0, state.intro.t / state.intro.dur));
		const e = k < 0.5 ? 4 * k ** 3 : 1 - Math.pow(-2 * k + 2, 3) / 2;
		reveal.front.value = -1.7 + 3.8 * e;
		if (k >= 1) { reveal.front.value = 50; state.intro = null; }
	}

	rig.distExtra = assembly.visualAmount * 3.1;
	rig.liftY = 0;
	const camMoving = rig.update(dt);
	const settled = assembly.update(dt, now);

	// turbo spin + cut animation
	const flowMode = state.mode === 'flow';
	const spinGoal = flowMode ? state.rpm / 200000 : 0;
	state.spin += (spinGoal - state.spin) * (1 - Math.exp(-dt * (flowMode ? 1.2 : 2.5)));
	if (state.spin < 1e-4 && !flowMode) state.spin = 0;
	// visual shaft speed (rad/s) – capped so blades stay readable on screen
	state.spinAngle -= state.spin * 38 * dt;
	for (const m of model.meshes) if (m.userData.spin) m.rotation.y = state.spinAngle;
	const xrayGoal = flowMode && state.view === 'xray' ? 1 : 0;
	state.xrayLin = approach(state.xrayLin ?? 0, xrayGoal, dt, 1.4);
	xray.amount.value = ease(state.xrayLin);
	if (xrayGoal && !state.ghost) { useGhostMaterials(model.meshes, true); state.ghost = true; }
	if (!xrayGoal && state.ghost && xray.amount.value < 0.02) { useGhostMaterials(model.meshes, false); state.ghost = false; xray.amount.value = 0; }
	const cutGoal = flowMode && state.view === 'cut' ? state.cutOpen : 0;
	// the wedge opens slowly (2 s); while the slider is dragged it follows quickly
	cut.amount.value = approach(cut.amount.value, cutGoal, dt, state.cutDur ?? 2);
	if (flow) {
		const flowOn = flowMode && assembly.visualAmount < 0.04;
		state.flowLin = approach(state.flowLin ?? 0, flowOn ? 1 : 0, dt, flowOn ? 2 : 0.8);
		flow.uOpacity.value = ease(state.flowLin);
		flow.object.visible = flow.uOpacity.value > 0.01;
		flow.update(dt);
	}
	sound?.setTurbo(flowMode, state.rpm);

	// floor grid: only in the presentation view
	state.gridLin = approach(state.gridLin ?? 0, state.mode === 'photo' && !state.intro ? 1 : 0, dt, state.mode === 'photo' ? 2 : 0.8);
	grid.opacity.value = ease(state.gridLin);
	grid.mesh.visible = state.gridLin > 0.001;

	// labels
	updateLabels(now);

	// path tracing on stillness
	const quietFor = now - state.lastInteraction;
	const idle = state.rtArmed && !camMoving && settled && !state.intro && quietFor > 350 && !flowMode &&
		cut.amount.value === 0 && !state.ghost && state.spin === 0 && document.visibilityState === 'visible';
	pathTrace.update(idle, dt, now);
	model.root.visible = pathTrace.fade.value < 0.999;

	updateGizmo();
	look.tick();
	pipeline.render();
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3();
let labelsStart = null;
function updateLabels(now = performance.now()) {
	const show = state.labelsOn && state.mode === 'explode' && assembly.visualAmount > 0.6 && !assembly.held;
	const svg = $('#leaders');
	if (!show) { labelsStart = null; for (const l of labels) l.el.classList.remove('on'); svg.classList.add('off'); return; }
	if (labelsStart === null) labelsStart = now;
	svg.classList.remove('off');
	camera.updateMatrixWorld();
	const w = innerWidth, h = innerHeight;
	const placed = [];
	for (const l of labels) {
		const u = l.g.userData, b = u.box;
		let minY = Infinity, maxY = -Infinity;
		for (let i = 0; i < 8; i++) {
			model.root.localToWorld(_v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).add(u.pos)).project(camera);
			const y = (-_v.y * 0.5 + 0.5) * h;
			minY = Math.min(minY, y); maxY = Math.max(maxY, y);
		}
		model.root.localToWorld(_v.copy(u.pivot).add(u.pos)).project(camera);
		const ax = (_v.x * 0.5 + 0.5) * w, ay = (-_v.y * 0.5 + 0.5) * h;
		placed.push({ l, ax, ay, x: ax, minY, maxY, wid: l.el.offsetWidth || 90 });
	}
	// two rows of labels above and below the product, spread along x; leader lines to the parts
	placed.sort((a, b) => a.ax - b.ax);
	const top = Math.min(...placed.map(p => p.minY)), bottom = Math.max(...placed.map(p => p.maxY));
	const rows = [[], []];
	placed.forEach((p, i) => { p.above = i % 2 === 0; rows[p.above ? 0 : 1].push(p); });
	const dockTop = $('.dock').getBoundingClientRect().top;
	const yAbove = Math.max(84, top - 34), yBelow = Math.min(dockTop - 22, bottom + 34);
	for (const row of rows) {
		for (let i = 1; i < row.length; i++) {
			const prev = row[i - 1], need = prev.x + (prev.wid + row[i].wid) / 2 + 12;
			if (row[i].x < need) row[i].x = need;
		}
		// keep the row on screen
		const last = row[row.length - 1];
		if (last) { const over = last.x + last.wid / 2 - (w - 16); if (over > 0) row.forEach(p => { p.x -= over; }); }
	}
	// build up one after another: dot on the part, line grows outwards, then the label
	let lines = '';
	const t = (now - labelsStart) / 1000;
	placed.forEach((p, i) => {
		p.y = p.above ? yAbove : yBelow;
		const visible = p.ax > 0 && p.ax < w && p.ay > 0 && p.ay < h;
		const k = reducedMotion ? 1 : Math.min(1, Math.max(0, (t - i * 0.18) / 0.55));
		p.l.el.classList.toggle('on', visible && k > 0.75);
		p.l.el.classList.remove('left');
		p.l.el.style.transform = `translate(calc(${p.x}px - 50%), ${p.y - 11}px)`;
		if (visible && k > 0) {
			const ly = p.above ? p.y + 11 : p.y - 11;
			const e = ease(Math.min(1, k / 0.8));
			const x2 = p.ax + (p.x - p.ax) * e, y2 = p.ay + (ly - p.ay) * e;
			lines += `<line x1="${p.ax.toFixed(1)}" y1="${p.ay.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><circle cx="${p.ax.toFixed(1)}" cy="${p.ay.toFixed(1)}" r="${(2.6 * Math.min(1, k * 4)).toFixed(2)}"/>`;
		}
	});
	svg.innerHTML = lines;
}

function fitBrand() {
	const t = $('.brand-title'), sub = $('.brand-sub');
	if (!t || !sub) return;
	sub.style.letterSpacing = '0px';
	const tw = t.getBoundingClientRect().width, sw = sub.getBoundingClientRect().width;
	const n = sub.textContent.length;
	sub.style.letterSpacing = Math.max(0, (tw - sw) / Math.max(1, n - 1)) + 'px';
	sub.style.marginRight = `-${sub.style.letterSpacing}`;
}

function onResize() {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	bgAspect.value = camera.aspect;
	renderer.setSize(innerWidth, innerHeight, false);
	pathTrace?.invalidateCamera();
	state.lastInteraction = performance.now();
	positionThumb();
	fitBrand();
}

// ===========================================================================
// UI
// ===========================================================================
function setMode(mode) {
	if (mode === state.mode) return;
	if (mode === 'flow' && !flow) return;
	state.mode = mode;
	state.lastInteraction = performance.now();
	$$('.segmented [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
	$$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== mode; });
	positionThumb();
	assembly.grabEnabled = mode === 'explode';
	if (mode === 'explode') {
		if (+$('#rng-exp').value === 0) syncExplodeSlider(1);
		assembly.setAmount(+$('#rng-exp').value / 100);
		rig.animateTo({ target: rig.home.target }, 2);   // stays in the current view, only dollies back
	} else if (mode === 'flow') {
		assembly.setAmount(0); syncExplodeSlider(0);
		state.cutDur = 2;
		rig.animateTo(FLOW_VIEW, 2);
	} else if (mode === 'photo') {
		assembly.setAmount(0);
		rig.animateTo({ az: rig.home.az, pol: rig.home.pol, target: rig.home.target, dist: rig.home.dist }, 2);
	}
}

function positionThumb() {
	for (const seg of $$('.segmented')) {
		const sel = seg.querySelector('[aria-selected=true], [aria-checked=true]');
		const th = seg.querySelector('.thumb');
		if (!th) continue;
		th.style.opacity = sel ? 1 : 0;
		if (!sel || !sel.offsetWidth) continue;
		th.style.width = sel.offsetWidth + 'px';
		th.style.transform = `translateX(${sel.offsetLeft}px)`;
	}
}

function syncExplodeSlider(a) {
	const r = $('#rng-exp');
	r.value = Math.round(a * 100);
	r.style.setProperty('--p', r.value + '%');
	$('#out-exp').textContent = r.value + ' %';
}

// ---------------------------------------------------------------- raytracing (on request)
function setRT(on) {
	if (on && !pathTrace.enabled) return;
	state.rtArmed = on;
	state.lastInteraction = performance.now() - 400;
	if (on && state.mode === 'flow') setMode('photo');
	rtUI();
}

function rtUI() {
	const btn = $('#btn-rt'), btnLabel = $('#rt-label');
	const pill = $('#rt-pill'), label = pill.querySelector('.rt-label'), count = pill.querySelector('.rt-count'), ring = pill.querySelector('.ring .val');
	const max = pathTrace.maxSamples;
	if (!pathTrace.enabled) {
		btn.disabled = true; btnLabel.textContent = 'Raytracing';
		btn.title = 'Raytracing benötigt WebGPU (aktuelles Chrome oder Edge).';
		pill.hidden = true; return;
	}
	btn.disabled = false;
	btnLabel.textContent = state.rtArmed ? 'Raytracing stoppen' : 'Raytracing';
	btn.setAttribute('aria-pressed', String(state.rtArmed));
	pill.hidden = !state.rtArmed;
	pill.classList.remove('prep', 'done', 'dim');
	if (!state.rtArmed) return;
	const s = pathTrace.samples || 0, f = Math.min(1, s / max), done = f >= 0.999;
	let text, pillText;
	if (!pathTrace.ready) {
		const p = state.rtPrep ? ` · ${Math.round(state.rtPrep * 100)} %` : '';
		text = 'Szene wird vorbereitet' + p; pillText = 'Wird vorbereitet';
		pill.classList.add('prep'); ring.style.strokeDashoffset = '';
	} else if (!pathTrace.active) {
		text = s > 0 ? `Pausiert · ${fmt.format(Math.floor(s))} von ${fmt.format(max)}` : 'Halten Sie still';
		pillText = 'Pausiert';
		ring.style.strokeDashoffset = String(50.27 * (1 - f));
	} else {
		text = done ? `Fertig · ${fmt.format(max)} Samples` : `${fmt.format(Math.floor(s))} von ${fmt.format(max)} Samples`;
		pillText = done ? 'Raytracing fertig' : 'Raytracing';
		pill.classList.toggle('done', done);
		ring.style.strokeDashoffset = String(50.27 * (1 - f));
	}
	pill.title = text + ' · Klicken zum Stoppen';
	label.textContent = pillText;
	count.textContent = pathTrace.ready && s > 0 ? `${fmt.format(Math.floor(s))}` : '';
}

function toast(text, ms = 2600) {
	const t = $('#toast');
	t.textContent = text; t.hidden = false;
	clearTimeout(toast._t);
	toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function bindUI() {
	// segmented control (tablist semantics, arrow keys)
	const tabs = $$('.segmented [role=tab]');
	tabs.forEach((b, i) => {
		b.addEventListener('click', () => setMode(b.dataset.mode));
		b.addEventListener('keydown', e => {
			if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
				const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
				n.focus(); setMode(n.dataset.mode);
			}
		});
	});

	// raytracing button + pill (stop)
	$('#btn-rt').addEventListener('click', () => setRT(!state.rtArmed));
	$('#rt-pill').addEventListener('click', () => setRT(false));

	// rpm
	const rpm = $('#rng-rpm');
	const setRpm = () => {
		state.rpm = +rpm.value;
		const t = fmt.format(state.rpm) + ' U/min';
		$('#out-rpm').textContent = t;
		rpm.setAttribute('aria-valuetext', fmt.format(state.rpm) + ' Umdrehungen pro Minute');
		rpm.style.setProperty('--p', (state.rpm / 2000) + '%');
		flow?.setRpm(state.rpm);
		state.lastInteraction = performance.now();
	};
	rpm.addEventListener('input', setRpm); setRpm();

	// explode
	const exp = $('#rng-exp');
	exp.addEventListener('input', () => {
		syncExplodeSlider(+exp.value / 100);
		assembly.setAmount(+exp.value / 100);
		state.lastInteraction = performance.now();
	});
	syncExplodeSlider(1);
	$('#btn-assemble').addEventListener('click', () => { assembly.setAmount(0); syncExplodeSlider(0); });

	bindLook();
	bindGizmo();
	fitBrand(); document.fonts?.ready.then(fitBrand);
	const swL = $('#sw-labels');
	swL.addEventListener('click', () => { state.labelsOn = !state.labelsOn; swL.setAttribute('aria-checked', String(state.labelsOn)); });
	const cutR = $('#rng-cut');
	const setCut = () => {
		state.cutOpen = +cutR.value / 100;
		state.cutDur = 0.35;
		$('#out-cut').textContent = cutR.value === '0' ? 'Geschlossen' : cutR.value + ' %';
		cutR.setAttribute('aria-valuetext', cutR.value === '0' ? 'Hülle geschlossen' : cutR.value + ' Prozent geöffnet');
		cutR.style.setProperty('--p', cutR.value + '%');
		state.lastInteraction = performance.now();
	};
	cutR.addEventListener('input', setCut); setCut();
	const denR = $('#rng-den');
	const setDen = () => {
		state.density = +denR.value / 100;
		const n = Math.round(TIERS[state.tier].particles * state.density);
		flow?.setVisibleCount(n);
		$('#out-den').textContent = fmt.format(Math.round(n / 1000) * 1000);
		denR.setAttribute('aria-valuetext', fmt.format(n) + ' Partikel');
		denR.style.setProperty('--p', denR.value + '%');
	};
	denR.addEventListener('input', setDen); setDen();
	$$('#flow-view [role=radio]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

	// top bar
	$('#btn-reset').addEventListener('click', () => rig.reset());
	$('#btn-full').addEventListener('click', toggleFull);
	$('#btn-sound').addEventListener('click', e => {
		const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
		e.currentTarget.setAttribute('aria-pressed', String(on));
		e.currentTarget.setAttribute('aria-label', on ? 'Ton ausschalten' : 'Ton einschalten');
		sound.setEnabled(on);
	});
	const help = $('#help');
	$('#btn-help').addEventListener('click', () => help.showModal());
	$('#help-close').addEventListener('click', () => help.close());
	help.addEventListener('click', e => { if (e.target === help) help.close(); });

	addEventListener('keydown', e => {
		if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
		if (help.open) return;
		const k = e.key.toLowerCase();
		if (['1', '2', '3'].includes(k)) setMode(['photo', 'flow', 'explode'][+k - 1]);
		else if (k === 't') setRT(!state.rtArmed);
		else if (k === 'b') $('#sw-labels').click();
		else if (k === 'x') { if (state.mode !== 'flow') setMode('flow'); setView(state.view === 'xray' ? 'cut' : 'xray'); }
		else if (k === 'e') { if (state.mode !== 'explode') setMode('explode'); else { const a = assembly.amount > 0.5 ? 0 : 1; assembly.setAmount(a); syncExplodeSlider(a); } }
		else if (k === 'r') rig.reset();
		else if (k === 'f') toggleFull();
		else if (k === 'm') $('#btn-sound').click();
		else if (k === 'i') help.showModal();
		else if (k === 'l') toggleLook();
		else if (k === 'escape' && !$('#fx').hidden) toggleLook(false);
	});
	document.addEventListener('visibilitychange', () => { state.lastInteraction = performance.now(); });
}

function toggleFull() {
	if (document.fullscreenElement) document.exitFullscreen();
	else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---------------------------------------------------------------- look panel
function toggleLook(force) {
	const fx = $('#fx'), btn = $('#btn-fx');
	const open = force ?? fx.hidden;
	fx.hidden = !open;
	btn.setAttribute('aria-expanded', String(open));
	if (open) { syncLookUI(); requestAnimationFrame(positionThumb); }
}

function syncLookUI() {
	const v = look.values;
	$$('#fx input[type=range]').forEach(inp => {
		const key = inp.dataset.key;
		inp.value = v[key];
		const f = (v[key] - inp.min) / (inp.max - inp.min);
		inp.style.setProperty('--p', (f * 100) + '%');
		inp.closest('.fx-row').querySelector('output').textContent = formatLook(key, v[key]);
	});
	$$('#fx-presets [role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.preset === look.preset)));
	$$('#fx-tm [role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tm === v.tm)));
	$('#fx-state').textContent = PRESETS[look.preset]?.name ?? 'Eigene Einstellung';
	$('#fx-reset').disabled = look.preset !== 'custom';
	positionThumb();
}

function bindLook() {
	if (!TIERS[state.tier].bloom) $$('#fx [data-needs=bloom]').forEach(r => { r.hidden = true; });
	$('#btn-fx').addEventListener('click', () => toggleLook());
	document.addEventListener('pointerdown', e => {
		if (!$('#fx').hidden && !e.target.closest('#fx, #btn-fx')) toggleLook(false);
	});
	$$('#fx-presets [role=radio]').forEach(b => b.addEventListener('click', () => {
		look.setPreset(b.dataset.preset); look._base = b.dataset.preset;
		look.apply(renderer, pipeline); syncLookUI();
	}));
	$$('#fx-tm [role=radio]').forEach(b => b.addEventListener('click', () => {
		look._base ||= look.preset; look.set('tm', b.dataset.tm);
		look.apply(renderer, pipeline); syncLookUI();
	}));
	$$('#fx input[type=range]').forEach(inp => inp.addEventListener('input', () => {
		look._base ||= look.preset === 'custom' ? 'studio' : look.preset;
		look.set(inp.dataset.key, +inp.value);
		look.apply(renderer, pipeline); syncLookUI();
	}));
	$('#fx-reset').addEventListener('click', () => {
		look.setPreset(look._base && PRESETS[look._base] ? look._base : 'studio');
		look.apply(renderer, pipeline); syncLookUI();
	});
	look._base = PRESETS[look.preset] ? look.preset : 'studio';
}

// ---------------------------------------------------------------- flow view / x-ray
// camera for the flow view; the cut wedge is opened towards it (computed in model space)
const FLOW_VIEW = { az: -1.2, pol: 0.98, dist: 5.9, target: new THREE.Vector3(0, -0.42, 0) };
function aimCut() {
	const s = Math.sin(FLOW_VIEW.pol);
	const dir = new THREE.Vector3(s * Math.sin(FLOW_VIEW.az), Math.cos(FLOW_VIEW.pol), s * Math.cos(FLOW_VIEW.az));
	const local = dir.applyQuaternion(model.root.quaternion.clone().invert());
	cut.center.value = Math.atan2(local.z, local.x);
}

function setView(v) {
	state.view = v;
	state.cutDur = 2;
	state.lastInteraction = performance.now();
	$$('#flow-view [role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === v)));
	$('#cut-ctl').hidden = v !== 'cut';
	positionThumb();
}

// ---------------------------------------------------------------- rotate gizmo
// Three rings for the world axes, drawn from the current camera orientation:
// blue = turn around the vertical axis, red/green = tilt, centre = free orbit.
const GZ = { R: 40, rings: [
	{ key: 'y', color: '#3b82f6', u: [1, 0, 0], v: [0, 0, 1] },
	{ key: 'x', color: '#ef4444', u: [0, 1, 0], v: [0, 0, 1] },
	{ key: 'z', color: '#22c55e', u: [1, 0, 0], v: [0, 1, 0] },
], hot: null, drag: null, pts: [] };

function bindGizmo() {
	aimCut();
	const gz = $('#gizmo');
	const svg = gz.querySelector('svg');
	const toSvg = e => {
		const r = svg.getBoundingClientRect();
		return [((e.clientX - r.left) / r.width - 0.5) * 100, ((e.clientY - r.top) / r.height - 0.5) * 100];
	};
	const pick = ([x, y]) => {
		let best = null, bd = 9;
		GZ.pts.forEach((ring, i) => {
			for (const p of ring) {
				const d = Math.hypot(p[0] - x, p[1] - y) - (p[2] > 0 ? 1.5 : 0);   // prefer front halves
				if (d < bd) { bd = d; best = GZ.rings[i].key; }
			}
		});
		return best || 'free';
	};
	gz.addEventListener('pointerdown', e => {
		e.preventDefault();
		gz.setPointerCapture(e.pointerId);
		GZ.drag = { x: e.clientX, y: e.clientY, mode: pick(toSvg(e)) };
		GZ.hot = GZ.drag.mode;
		gz.classList.add('active'); gz.classList.toggle('free', GZ.drag.mode === 'free');
		drawGizmo(true);
	});
	gz.addEventListener('pointermove', e => {
		if (!GZ.drag) {
			const h = pick(toSvg(e));
			if (h !== GZ.hot) { GZ.hot = h; gz.classList.toggle('free', h === 'free'); drawGizmo(true); }
			return;
		}
		const dx = e.clientX - GZ.drag.x, dy = e.clientY - GZ.drag.y;
		GZ.drag.x = e.clientX; GZ.drag.y = e.clientY;
		const m = GZ.drag.mode, k = 0.014;
		if (m === 'y') rig.rotateBy(-dx * k, 0);
		else if (m === 'x' || m === 'z') rig.rotateBy(0, -dy * k * 0.8);
		else rig.rotateBy(-dx * k, -dy * k * 0.8);
	});
	const end = () => { GZ.drag = null; gz.classList.remove('active'); };
	gz.addEventListener('pointerup', end);
	gz.addEventListener('pointercancel', end);
	gz.addEventListener('pointerleave', () => { if (!GZ.drag && GZ.hot) { GZ.hot = null; gz.classList.remove('free'); drawGizmo(true); } });
	gz.addEventListener('dblclick', () => rig.reset());
	gz.addEventListener('keydown', e => {
		const step = e.shiftKey ? 0.35 : 0.12;
		if (e.key === 'ArrowLeft') { rig.rotateBy(step, 0); e.preventDefault(); }
		else if (e.key === 'ArrowRight') { rig.rotateBy(-step, 0); e.preventDefault(); }
		else if (e.key === 'ArrowUp') { rig.rotateBy(0, -step * 0.5); e.preventDefault(); }
		else if (e.key === 'ArrowDown') { rig.rotateBy(0, step * 0.5); e.preventDefault(); }
		else if (e.key === 'Home') { rig.reset(); e.preventDefault(); }
	});
}

const _gr = new THREE.Vector3(), _gu = new THREE.Vector3(), _gf = new THREE.Vector3();
let _gzKey = '';
function drawGizmo(force = false) {
	camera.updateMatrixWorld();
	const e = camera.matrixWorld.elements;
	_gr.set(e[0], e[1], e[2]); _gu.set(e[4], e[5], e[6]); _gf.set(e[8], e[9], e[10]);   // right, up, towards viewer
	const key = e.slice(0, 11).map(v => v.toFixed(3)).join();
	if (!force && key === _gzKey) return;
	_gzKey = key;
	const back = [], front = [];
	GZ.pts = GZ.rings.map(ring => {
		const pts = [];
		for (let i = 0; i <= 72; i++) {
			const t = i / 72 * Math.PI * 2, c = Math.cos(t), s_ = Math.sin(t);
			const x = ring.u[0] * c + ring.v[0] * s_, y = ring.u[1] * c + ring.v[1] * s_, z = ring.u[2] * c + ring.v[2] * s_;
			pts.push([(x * _gr.x + y * _gr.y + z * _gr.z) * GZ.R, -(x * _gu.x + y * _gu.y + z * _gu.z) * GZ.R, x * _gf.x + y * _gf.y + z * _gf.z]);
		}
		// split into front / back runs
		let run = [], side = pts[0][2] >= 0;
		const flush = () => { if (run.length > 1) (side ? front : back).push(`<path d="M${run.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')}" stroke="${ring.color}" class="${GZ.hot === ring.key ? 'hot' : ''}"/>`); };
		for (const p of pts) {
			const sd = p[2] >= 0;
			if (sd !== side) { run.push(p); flush(); run = [p]; side = sd; } else run.push(p);
		}
		flush();
		return pts;
	});
	const gz = $('#gizmo');
	gz.querySelector('.gz-back').innerHTML = back.join('');
	gz.querySelector('.gz-front').innerHTML = front.join('');
	const deg = THREE.MathUtils.radToDeg(rig.az - rig.home.az);
	const wrapped = Math.round(((deg + 180) % 360 + 360) % 360 - 180);
	gz.setAttribute('aria-valuenow', String(wrapped));
	gz.setAttribute('aria-valuetext', wrapped + ' Grad');
}
function updateGizmo() { drawGizmo(false); }

// ---------------------------------------------------------------- floor grid
function makeFloorGrid() {
	const opacity = uniform(0);
	const p = positionWorld.xz;
	const lineAt = (scale, width) => {
		const c = p.div(scale);
		const g = abs(fract(c.sub(0.5)).sub(0.5)).div(fwidth(c));
		return float(1).sub(min(min(g.x, g.y).div(width), 1));
	};
	const minor = lineAt(0.25, 0.8).mul(0.4);
	const major = lineAt(1.0, 1.0);
	const fade = smoothstep(6.0, 0.8, length(p));
	const a = max(minor, major).mul(fade).mul(0.1).mul(opacity);
	const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
	mat.colorNode = vec4(vec3(0.82, 0.84, 0.9), a);
	mat.toneMapped = false;
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), mat);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = -1.7;
	mesh.renderOrder = -1;
	mesh.frustumCulled = false;
	return { mesh, opacity };
}
