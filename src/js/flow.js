import * as THREE from 'three/webgpu';
import {
	Fn, If, instancedArray, attributeArray, instanceIndex, uniform, float, int, uint, vec3, vec4,
	mix, smoothstep, clamp, uv, length, select, fract, floor, sin, cos, min,
} from 'three/tsl';

// ---------------------------------------------------------------------------
// Flow visualisation along guided streamlines.
// The volute centre lines are extracted from the CAD housings (flow_paths.json):
// for every angle around the shaft the free cross-section of each scroll housing
// is found and its most central point recorded. From these, a bundle of
// streamlines is built per side, so every particle travels through the real
// passages. The geometry is traced from the upper housing ("comp" table) and the
// lower one ("turb" table) and then played in the actual flow direction:
//  - lower housing with the V-band pipe = COMPRESSOR: air enters axially through
//    the bore, is flung into the scroll and leaves through the clamped pipe;
//  - upper housing with the straight pipe = TURBINE: exhaust enters through the
//    pipe, spirals inwards over the wheel and leaves axially.
// All coordinates are in model space (shaft = +Y, compressor on top).
// ---------------------------------------------------------------------------

const ROUTES = 96;      // streamlines per side
const AIR_GAS_SPLIT = 0.22;
const SAMPLES = 160;    // points per streamline
const TAU = Math.PI * 2;
const COMP_RING = new THREE.Vector3(-0.38, 0.32, -0.53);      // compressor outlet opening (centre of the flange)
const COMP_AXIS = new THREE.Vector3(0, 0, -1);                // discharge duct axis: measured from the duct walls (z slices)
const COMP_DUCT_START = new THREE.Vector3(-0.38, 0.32, -0.12); // where the duct leaves the scroll
const TURB_FLANGE = new THREE.Vector3(0.86, -0.305, 0.432);  // turbine inlet flange centre

export async function loadFlowPaths(base) {
	return (await fetch(base + 'flow_paths.json')).json();
}

// periodic lookup of a centre-line table (2° steps) at angle a (radians, any range)
function lookup(tab, a) {
	const deg = ((THREE.MathUtils.radToDeg(a) % 360) + 360) % 360;
	const f = deg / 2, i0 = Math.floor(f) % tab.r.length, i1 = (i0 + 1) % tab.r.length, t = f - Math.floor(f);
	return { r: tab.r[i0] * (1 - t) + tab.r[i1] * t, y: tab.y[i0] * (1 - t) + tab.y[i1] * t, rad: tab.rad[i0] * (1 - t) + tab.rad[i1] * t };
}
const cyl = (r, a, y) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function rng(seed) {
	let s = seed >>> 0;
	return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// offset a point on the scroll centre line inside its cross-section
function inScroll(tab, a, ox, oy, scale = 0.55) {
	const c = lookup(tab, a);
	const rr = c.r + ox * c.rad * scale;
	const yy = c.y + oy * c.rad * scale;
	return cyl(rr, a, yy);
}

function compressorRoute(tab, R) {
	const pts = [];
	const r0 = 0.025 + Math.sqrt(R()) * 0.12;
	let a = R() * TAU;
	const ox = (R() * 2 - 1), oy = (R() * 2 - 1) * 0.8;
	// 1. fresh air falls into the inlet bore
	for (let i = 0; i <= 14; i++) {
		const t = i / 14;
		pts.push(cyl(r0 * (1 + (1 - t) * 0.9), a + t * 0.25, lerp(1.05, 0.38, t)));
	}
	a += 0.25;
	// 2. through the wheel: turned outwards and spun
	const aWheel = a, spin = 1.3 + R() * 0.5;
	for (let i = 1; i <= 16; i++) {
		const t = ease(i / 16);
		pts.push(cyl(lerp(r0, 0.235, t), aWheel + spin * t, lerp(0.38, 0.27, Math.pow(t, 0.7))));
	}
	a = aWheel + spin;
	// 3. diffuser into the scroll
	const entry = inScroll(tab, a + 0.35, ox, oy);
	const p0 = pts[pts.length - 1];
	for (let i = 1; i <= 8; i++) {
		const t = ease(i / 8);
		const p = cyl(lerp(0.235, Math.hypot(entry.x, entry.z), t), a + 0.35 * t, lerp(p0.y, entry.y, t));
		pts.push(p);
	}
	a += 0.35;
	// 4. around the scroll (angle increases) up to the outlet at 222°
	const outA = THREE.MathUtils.degToRad(196);
	let end = outA; while (end < a + 0.15) end += TAU;
	const n = Math.max(6, Math.round((end - a) / 0.05));
	for (let i = 1; i <= n; i++) pts.push(inScroll(tab, lerp(a, end, i / n), ox, oy));
	// 5. discharge duct: onto the duct axis, straight through the flange and out
	const last = pts[pts.length - 1];
	const off = new THREE.Vector3(ox * 0.075, oy * 0.075, 0);
	const ductStart = COMP_DUCT_START.clone().add(off);
	const ring = COMP_RING.clone().add(off);
	for (let i = 1; i <= 8; i++) pts.push(last.clone().lerp(ductStart, ease(i / 8)));
	for (let i = 1; i <= 12; i++) pts.push(ductStart.clone().lerp(ring, i / 12));
	for (let i = 1; i <= 16; i++) pts.push(ring.clone().addScaledVector(COMP_AXIS, 0.05 * i).addScaledVector(off, i * 0.035));
	return pts;
}

function turbineRoute(tab, R) {
	const pts = [];
	const ox = (R() * 2 - 1), oy = (R() * 2 - 1) * 0.8;
	// 1. exhaust enters through the inlet flange (tangential duct, flowing -x)
	const fl = TURB_FLANGE.clone().add(new THREE.Vector3(0, oy * 0.07, ox * 0.07));
	for (let i = 0; i <= 14; i++) { const t = 1 - i / 14; pts.push(fl.clone().add(new THREE.Vector3(0.75 * t, (fl.y - TURB_FLANGE.y) * t * 2.2, (fl.z - TURB_FLANGE.z) * t * 2.2))); }
	const startA = THREE.MathUtils.degToRad(48);
	const s0 = inScroll(tab, startA, ox, oy);
	for (let i = 1; i <= 10; i++) pts.push(fl.clone().lerp(s0, ease(i / 10)));
	// 2. around the scroll, leaving it somewhere along the way
	const leaveA = startA + 0.4 + R() * (TAU - 1.0);
	const n = Math.max(4, Math.round((leaveA - startA) / 0.05));
	for (let i = 1; i <= n; i++) pts.push(inScroll(tab, lerp(startA, leaveA, i / n), ox, oy));
	// 3. radially inwards onto the wheel
	let a = leaveA;
	const p0 = pts[pts.length - 1];
	const rIn = 0.27;
	for (let i = 1; i <= 10; i++) {
		const t = ease(i / 10);
		pts.push(cyl(lerp(Math.hypot(p0.x, p0.z), rIn, t), a + 0.35 * t, lerp(p0.y, -0.22, t)));
	}
	a += 0.35;
	// 4. through the wheel: turned downwards
	const rOut = 0.04 + Math.sqrt(R()) * 0.15;
	for (let i = 1; i <= 14; i++) {
		const t = ease(i / 14);
		pts.push(cyl(lerp(rIn, rOut, t), a + 0.9 * t, lerp(-0.22, -0.46, t)));
	}
	a += 0.9;
	// 5. out of the exducer
	for (let i = 1; i <= 12; i++) {
		const t = i / 12;
		pts.push(cyl(rOut * (1 + t * 0.35), a + 0.5 * t * (1 - t * 0.5), lerp(-0.46, -1.02, t)));
	}
	return pts;
}

// resample a polyline to SAMPLES points evenly by arc length
function resample(pts) {
	const L = [0];
	for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
	const total = L[L.length - 1];
	const out = new Array(SAMPLES);
	let j = 0;
	for (let s = 0; s < SAMPLES; s++) {
		const d = (s / (SAMPLES - 1)) * total;
		while (j < pts.length - 2 && L[j + 1] < d) j++;
		const t = (d - L[j]) / Math.max(1e-6, L[j + 1] - L[j]);
		out[s] = pts[j].clone().lerp(pts[j + 1], t);
	}
	return { pts: out, length: total };
}

export class Flow {
	constructor({ renderer, count, paths }) {
		this.renderer = renderer;
		this.count = count;
		this.uDt = uniform(0.016);
		this.uTime = uniform(0);
		this.uRpm = uniform(0.6);
		this.uOpacity = uniform(0);
		this.uSize = uniform(count > 250000 ? 0.0034 : count > 100000 ? 0.0044 : 0.0064);
		this.timeScale = 1;

		// ---------------- build streamlines on the CPU
		const R = rng(1337);
		const routeData = new Float32Array(2 * ROUTES * SAMPLES * 4);
		const lengths = new Float32Array(2 * ROUTES);
		for (let side = 0; side < 2; side++) {
			for (let k = 0; k < ROUTES; k++) {
				const pts = side === 0 ? compressorRoute(paths.comp, R) : turbineRoute(paths.turb, R);
				const { pts: rs, length: L } = resample(pts.reverse());
				const base = (side * ROUTES + k) * SAMPLES;
				rs.forEach((p, i) => { routeData.set([p.x, p.y, p.z, 0], (base + i) * 4); });
				lengths[side * ROUTES + k] = L;
			}
		}
		const routes = attributeArray(routeData, 'vec4');
		const routeLen = attributeArray(lengths, 'float');

		const N = count;
		const pos = instancedArray(N, 'vec4');    // xyz, progress u
		const state = instancedArray(N, 'vec4');  // route index, jitter seed, speed factor, type
		this.pos = pos;

		const hash = (n) => fract(sin(n.mul(12.9898)).mul(43758.5453));

		this.initKernel = Fn(() => {
			const S = state.element(instanceIndex);
			const P = pos.element(instanceIndex);
			const i = float(instanceIndex);
			// ~22 % exhaust (type 0), ~78 % fresh air (type 1), interleaved so any visible count keeps the mix
			const type = select(hash(i.add(23.7)).lessThan(AIR_GAS_SPLIT), float(0), float(1));
			const route = floor(hash(i.add(0.17)).mul(ROUTES)).add(type.mul(ROUTES));
			S.assign(vec4(route, hash(i.add(3.1)).mul(1000), hash(i.add(7.7)).mul(0.5).add(0.75), type));
			P.w.assign(hash(i.add(11.3)));
		})().compute(N);

		this.updateKernel = Fn(() => {
			const S = state.element(instanceIndex);
			const P = pos.element(instanceIndex);
			const route = int(S.x);
			const speed = this.uRpm.mul(2.9).add(0.16).mul(S.z);   // scene units per second (~1.9 at 120k rpm)
			const L = routeLen.element(route);
			const u = fract(P.w.add(this.uDt.mul(speed).div(L)));
			const fi = u.mul(SAMPLES - 1);
			const i0 = int(floor(fi));
			const i1 = min(i0.add(1), int(SAMPLES - 1));
			const base = route.mul(SAMPLES);
			const a = routes.element(base.add(i0)).xyz;
			const b = routes.element(base.add(i1)).xyz;
			const p = mix(a, b, fract(fi));
			// small living wobble so the streams read as volume, not wires
			const seed = S.y;
			const t = this.uTime;
			const w = vec3(sin(t.mul(3.1).add(seed)), sin(t.mul(2.3).add(seed.mul(1.7))), sin(t.mul(2.7).add(seed.mul(2.3)))).mul(0.009);
			const j = vec3(hash(seed.add(1)).sub(0.5), hash(seed.add(2)).sub(0.5), hash(seed.add(3)).sub(0.5)).mul(0.03);
			P.assign(vec4(p.add(w).add(j), u));
		})().compute(N);

		// ---------------- render
		const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
		const pA = pos.toAttribute();
		const sA = state.toAttribute();
		mat.positionNode = pA.xyz;
		mat.scaleNode = this.uSize;
		const u = pA.w;
		const air = mix(vec3(0.3, 0.6, 1.0), vec3(0.88, 0.96, 1.0), smoothstep(0.15, 0.85, u));
		const gas = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 0.28, 0.05), smoothstep(0.1, 0.9, u));
		const col = select(sA.w.lessThan(0.5), gas, air);
		const dc = length(uv().sub(0.5));
		const fade = smoothstep(0.0, 0.06, u).mul(smoothstep(1.0, 0.9, u)).mul(smoothstep(0.5, 0.12, dc));
		const intensity = select(sA.w.lessThan(0.5), float(0.75), float(0.6));
		mat.colorNode = vec4(col.mul(intensity), fade.mul(this.uOpacity));
		this.material = mat;
		const sprite = new THREE.Sprite(mat);
		sprite.count = N;
		sprite.frustumCulled = false;
		sprite.renderOrder = 10;
		sprite.visible = false;
		this.object = sprite;
		this.ready = false;
	}

	async init() {
		await this.renderer.computeAsync(this.initKernel);
		this.ready = true;
	}

	setRpm(rpm) { this.uRpm.value = rpm / 200000; }

	// number of particles drawn (the buffers hold the tier maximum)
	setVisibleCount(n) { this.object.count = Math.max(1000, Math.min(this.count, Math.round(n))); }

	update(dt) {
		if (!this.ready || !this.object.visible) return;
		const step = Math.min(dt, 1 / 20) * this.timeScale;
		this.uDt.value = step;
		this.uTime.value += step;
		this.renderer.compute(this.updateKernel);
	}
}
