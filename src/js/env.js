// Procedural HDR studio environment (equirectangular, linear float).
// Used identically by the raster renderer and the path tracer so the
// hand-over between both looks seamless.
import * as THREE from 'three/webgpu';

const W = 1024, H = 512;

function dirFromLonLat(lon, lat) {
	return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
}

// rectangular soft box: center lon/lat (deg), size w/h (deg), softness (deg), rgb intensity
const BOXES = [
	{ lon: 20, lat: 52, w: 74, h: 34, soft: 9, c: [6.2, 6.2, 6.35] },     // key: large overhead softbox
	{ lon: 112, lat: 8, w: 13, h: 72, soft: 4, c: [9, 9, 9.3] },          // strip left
	{ lon: -58, lat: 14, w: 10, h: 70, soft: 3, c: [11, 11, 11.5] },      // rim strip right/back
	{ lon: 180, lat: 30, w: 40, h: 26, soft: 10, c: [1.6, 1.65, 1.8] },   // back fill
	{ lon: 60, lat: 88, w: 60, h: 40, soft: 18, c: [1.2, 1.2, 1.25] },    // zenith
	{ lon: -150, lat: -4, w: 26, h: 8, soft: 4, c: [3.2, 1.5, 0.55] },    // warm kicker (brand warmth)
];

export function createStudioEnvironment() {
	const data = new Float32Array(W * H * 4);
	const boxes = BOXES.map(b => {
		const c = dirFromLonLat(THREE.MathUtils.degToRad(b.lon), THREE.MathUtils.degToRad(b.lat));
		const up0 = Math.abs(c.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
		const right = new THREE.Vector3().crossVectors(up0, c).normalize();
		const up = new THREE.Vector3().crossVectors(c, right).normalize();
		return { ...b, c3: c, right, up };
	});
	const d = new THREE.Vector3();
	for (let j = 0; j < H; j++) {
		const v = (j + 0.5) / H;
		const lat = (v - 0.5) * Math.PI;
		for (let i = 0; i < W; i++) {
			const u = (i + 0.5) / W;
			const lon = (u - 0.5) * Math.PI * 2;
			d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
			// base: deep graphite gradient, darker below
			const t = d.y * 0.5 + 0.5;
			let r = 0.006 + 0.03 * Math.pow(t, 1.6);
			let g = r, b = r * 1.08;
			// faint horizon band
			const hb = Math.exp(-Math.pow(d.y / 0.08, 2)) * 0.05;
			r += hb; g += hb; b += hb * 1.05;
			for (const bx of boxes) {
				const z = d.dot(bx.c3);
				if (z <= 0.05) continue;
				const ax = THREE.MathUtils.radToDeg(Math.atan2(d.dot(bx.right), z));
				const ay = THREE.MathUtils.radToDeg(Math.atan2(d.dot(bx.up), z));
				const fx = 1 - smooth(bx.w / 2 - bx.soft, bx.w / 2 + bx.soft * 0.2, Math.abs(ax));
				const fy = 1 - smooth(bx.h / 2 - bx.soft, bx.h / 2 + bx.soft * 0.2, Math.abs(ay));
				const f = fx * fy;
				if (f > 0) { r += bx.c[0] * f; g += bx.c[1] * f; b += bx.c[2] * f; }
			}
			const k = (j * W + i) * 4;
			data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 1;
		}
	}
	const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
	tex.mapping = THREE.EquirectangularReflectionMapping;
	tex.colorSpace = THREE.LinearSRGBColorSpace;
	tex.minFilter = THREE.LinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.generateMipmaps = false;
	tex.needsUpdate = true;
	return tex;
}

function smooth(a, b, x) {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
}

// 1x1 fully transparent texture: lets the path tracer write alpha 0 for background pixels
export function createTransparentBackground() {
	const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
	t.needsUpdate = true;
	return t;
}
