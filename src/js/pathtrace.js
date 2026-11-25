import * as THREE from 'three/webgpu';
import { texture, textureLoad, screenUV, vec2, ivec2, vec4, float, uniform, floor, fract, mix, clamp, int } from 'three/tsl';
import { WebGPUPathTracer } from 'three-gpu-pathtracer/webgpu';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js';
import { createTransparentBackground } from './env.js';

// Progressive path tracing that takes over as soon as nothing moves.
// It renders a mirror scene (same geometry, classic physical materials) and is
// blended into the raster image inside the post pipeline, so the switch is a
// soft "development" rather than a cut.
export class PathTrace extends EventTarget {
	constructor({ renderer, camera, env, tier }) {
		super();
		this.renderer = renderer;
		this.camera = camera;
		this.tier = tier;
		this.scene = new THREE.Scene();
		this.scene.environment = env;
		this.scene.background = createTransparentBackground();
		this.mirror = [];          // [src, dst] objects whose transforms are mirrored
		this.ready = false;
		this.active = false;
		this.enabled = true;
		this.fade = uniform(0);
		this.samples = 0;
		this.maxSamples = tier.ptSamples;
		this._camKey = '';
		this._xfKey = '';
		this._lastPoll = 0;
		this.texNode = texture(new THREE.StorageTexture(1, 1));
		this.sizeU = uniform(new THREE.Vector2(1, 1));
	}

	// TSL node: path traced color, sampled bilinearly in screen space (premultiplied alpha)
	colorNode() {
		const tex = this.texNode;
		const size = this.sizeU;
		const px = screenUV.mul(size).sub(0.5);
		const p0 = floor(px);
		const f = fract(px);
		const maxI = ivec2(size.sub(1));
		const at = (ox, oy) => textureLoad(tex, clamp(ivec2(p0).add(ivec2(ox, oy)), ivec2(0, 0), maxI));
		const a = mix(at(0, 0), at(1, 0), f.x);
		const b = mix(at(0, 1), at(1, 1), f.x);
		return mix(a, b, f.y);
	}

	async prepare(rasterRoot, onProgress) {
		// mirror scene sharing geometry with the raster scene
		const clone = (src, parent) => {
			let dst;
			if (src.isMesh) {
				dst = new THREE.Mesh(src.geometry, src.userData.pathMat);
			} else {
				dst = new THREE.Group();
			}
			dst.name = src.name;
			dst.position.copy(src.position); dst.quaternion.copy(src.quaternion); dst.scale.copy(src.scale);
			parent.add(dst);
			this.mirror.push([src, dst]);
			for (const c of src.children) if (c.isMesh || c.isGroup) clone(c, dst);
		};
		clone(rasterRoot, this.scene);
		this.scene.updateMatrixWorld(true);

		const pt = new WebGPUPathTracer(this.renderer);
		this.pt = pt;
		pt.renderToCanvas = false;
		pt.dynamicLowRes = false;
		pt.renderDelay = 0;
		pt.fadeDuration = 0;
		pt.minSamples = 1;
		pt.maxSamples = this.maxSamples;
		pt.renderScale = this.tier.ptScale;
		pt.maxBounces = this.tier.ptBounces;
		pt.filterGlossyFactor = 0.4;
		pt.clampIndirect = 8;
		pt.asyncCompile = true;
		pt.pause = true;
		pt.addEventListener('progress', e => {
			if (e.stage === 'building' && e.progress != null) onProgress?.(e.progress);
		});
		pt.setBVHWorker(GenerateMeshBVHWorker);
		await pt.setSceneAsync(this.scene, this.camera);
		this.ready = true;
		this.dispatchEvent(new Event('ready'));
	}

	_sync() {
		let key = '';
		for (const [s, d] of this.mirror) {
			d.position.copy(s.position); d.quaternion.copy(s.quaternion);
			key += s.position.x.toFixed(4) + s.position.y.toFixed(4) + s.position.z.toFixed(4) + s.quaternion.w.toFixed(4) + s.quaternion.y.toFixed(4);
		}
		return key;
	}

	// call every frame. idle = scene and camera are at rest
	update(idle, dt, now) {
		if (!this.ready || !this.enabled) { this._goInactive(dt); return; }
		if (!idle) { this._goInactive(dt); return; }

		if (!this.active) {
			this.active = true;
			const xf = this._sync();
			if (xf !== this._xfKey) {
				this._xfKey = xf;
				this.scene.updateMatrixWorld(true);
				this.pt.updateTransforms();
			}
			this.camera.updateMatrixWorld();
			const ck = this.camera.matrixWorld.elements.map(v => v.toFixed(5)).join() + this.camera.aspect.toFixed(4);
			if (ck !== this._camKey) {
				this._camKey = ck;
				this.pt.updateCamera();
				this.samples = 0;
			}
			this.pt.pause = false;
			this.dispatchEvent(new Event('start'));
		}
		this.pt.renderSample();
		const tgt = this.pt.target;
		if (tgt) {
			this.texNode.value = tgt;
			this.sizeU.value.set(tgt.width ?? tgt.image?.width ?? 1, tgt.height ?? tgt.image?.height ?? 1);
		}
		if (now - this._lastPoll > 350 && !this._polling) {
			this._lastPoll = now;
			this._polling = true;
			this.pt.getSampleCountsAsync().then(c => {
				this._polling = false;
				if (this.active) {
					this.samples = Math.min(c.avg, this.maxSamples);
					this.dispatchEvent(new CustomEvent('progress', { detail: { samples: c.avg, max: this.maxSamples } }));
				}
			}).catch(() => { this._polling = false; });
		}
		// develop: start blending once a handful of samples exist
		// the path traced image fades in as it converges, so it visibly "develops"
		const want = Math.min(1, Math.max(0, (this.samples - this.tier.ptFadeAt + 1) / 10));
		const f = this.fade.value;
		this.fade.value = f < want ? Math.min(want, f + dt / 0.9) : f;
	}

	_goInactive(dt) {
		if (this.active) {
			this.active = false;
			if (this.pt) this.pt.pause = true;
			this.dispatchEvent(new Event('stop'));
		}
		this.fade.value = Math.max(0, this.fade.value - dt / 0.12);
	}

	invalidateCamera() { this._camKey = ''; }
}
