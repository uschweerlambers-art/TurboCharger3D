import * as THREE from 'three/webgpu';
import { uniform, vec2, vec3, float, mix, dot, smoothstep, length, screenUV, screenCoordinate, hash, uint } from 'three/tsl';

// Post look: exposure, glow, vignette, grain, white balance, saturation, tone curve.
// Applied in linear light before the renderer's output transform, so the
// raster image and the path traced image are graded identically.

export const PRESETS = {
	studio: { name: 'Studio', exposure: 0, bloom: 0.22, vignette: 0.25, grain: 0, temp: 0, sat: 1, tm: 'neutral' },
	cinema: { name: 'Kino', exposure: 0.2, bloom: 0.5, vignette: 0.6, grain: 0.35, temp: 0.22, sat: 0.9, tm: 'agx' },
	tech: { name: 'Technik', exposure: 0.15, bloom: 0.08, vignette: 0, grain: 0, temp: -0.28, sat: 0.72, tm: 'neutral' },
	stage: { name: 'Bühne', exposure: -0.15, bloom: 0.42, vignette: 0.78, grain: 0.12, temp: -0.06, sat: 1.12, tm: 'aces' },
};
const TM = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping };
const STORE = 'turbo-look-v1';

export class Look {
	constructor() {
		this.u = {
			exposure: uniform(1),
			vignette: uniform(0.25),
			grain: uniform(0),
			temp: uniform(0),
			sat: uniform(1),
			aspect: uniform(1),
			frame: uniform(0, 'uint'),
		};
		this.bloomPass = null;
		this.values = { ...PRESETS.studio };
		this.preset = 'studio';
		try {
			const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
			if (saved?.values) { this.values = { ...this.values, ...saved.values }; this.preset = saved.preset; }
		} catch { /* storage unavailable */ }
	}

	// grade(linear rgb) → rgb ; bloomFn(rgb) returns the bloom pass node
	build(color, bloomFn) {
		const u = this.u;
		let c = color.mul(u.exposure);
		const wb = vec3(float(1).add(u.temp.mul(0.11)), float(1).add(u.temp.mul(0.015)), float(1).sub(u.temp.mul(0.12)));
		c = c.mul(wb);
		const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
		c = mix(vec3(lum), c, u.sat);
		if (bloomFn) {
			this.bloomPass = bloomFn(c);
			c = c.add(this.bloomPass.rgb);
		}
		const d = length(screenUV.sub(0.5).mul(vec2(u.aspect, 1)));
		const vig = smoothstep(1.05, 0.2, d);
		c = c.mul(mix(float(1), vig, u.vignette));
		const seed = uint(screenCoordinate.x).add(uint(screenCoordinate.y).mul(uint(8191))).add(u.frame.mul(uint(1597334677)));
		const n = hash(seed).sub(0.5);
		c = c.mul(float(1).add(n.mul(u.grain).mul(0.42)));
		return c;
	}

	apply(renderer, pipeline) {
		const v = this.values, u = this.u;
		u.exposure.value = Math.pow(2, v.exposure);
		u.vignette.value = v.vignette;
		u.grain.value = v.grain;
		u.temp.value = v.temp;
		u.sat.value = v.sat;
		if (this.bloomPass) this.bloomPass.strength.value = v.bloom;
		const tm = TM[v.tm] ?? THREE.NeutralToneMapping;
		if (renderer.toneMapping !== tm) {
			renderer.toneMapping = tm;
			if (pipeline) pipeline.needsUpdate = true;
		}
		try { localStorage.setItem(STORE, JSON.stringify({ preset: this.preset, values: v })); } catch { /* ignore */ }
	}

	setPreset(key) { this.preset = key; this.values = { ...PRESETS[key] }; }
	set(key, value) { this.values[key] = value; this.preset = 'custom'; }
	tick() { this.u.frame.value = (this.u.frame.value + 1) >>> 0; }
}

export function formatLook(key, v) {
	switch (key) {
		case 'exposure': return (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' EV';
		case 'temp': return Math.abs(v) < 0.02 ? 'Neutral' : (v > 0 ? 'Warm ' : 'Kühl ') + Math.round(Math.abs(v) * 100);
		default: return Math.round(v * 100) + ' %';
	}
}
