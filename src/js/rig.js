import * as THREE from 'three/webgpu';

// Damped spherical camera rig driven by mouse, touch, wheel and keyboard.
// Scripted moves (intro, mode changes) run as eased tweens with a fixed duration.
export class CameraRig {
	constructor(camera, dom, { reducedMotion = false } = {}) {
		this.camera = camera;
		this.dom = dom;
		this.reduced = reducedMotion;
		this.home = { az: 0.72, pol: 1.38, dist: 5.8, target: new THREE.Vector3(0, -0.36, 0) };
		this.az = this.home.az; this.pol = this.home.pol; this.dist = this.home.dist;
		this.target = this.home.target.clone();
		this.goal = { az: this.az, pol: this.pol, dist: this.dist, target: this.target.clone() };
		this.vel = { az: 0, pol: 0 };
		this.distExtra = 0;          // added by explosion
		this.liftY = 0;              // target lowered by explosion (keeps the stack above the dock)
		this.enabled = true;
		this.pointers = new Map();
		this.lastInput = performance.now();
		this.moving = false;
		this.onUserInput = null;
		this._bind();
		this.update(0);
	}

	_bind() {
		const d = this.dom;
		d.addEventListener('pointerdown', e => {
			if (!this.enabled || e.defaultPrevented) return;
			d.setPointerCapture(e.pointerId);
			this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			this.vel.az = this.vel.az * 0.2; this.vel.pol = this.vel.pol * 0.2;
			this._touch();
		});
		d.addEventListener('pointermove', e => {
			const p = this.pointers.get(e.pointerId);
			if (!p) return;
			if (this.pointers.size === 1) {
				const dx = e.clientX - p.x, dy = e.clientY - p.y;
				const s = 1.7 / Math.max(500, d.clientHeight);
				this.goal.az -= dx * s; this.goal.pol -= dy * s;
				this.vel.az = -dx * s; this.vel.pol = -dy * s;
			} else if (this.pointers.size === 2) {
				const pts = [...this.pointers.values()];
				const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
				p.x = e.clientX; p.y = e.clientY;
				const after = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
				if (before > 0) this.zoomBy(before / after);
			}
			p.x = e.clientX; p.y = e.clientY;
			this._clampGoal();
			this._touch();
		});
		const up = e => { this.pointers.delete(e.pointerId); };
		d.addEventListener('pointerup', up);
		d.addEventListener('pointercancel', up);
		d.addEventListener('wheel', e => {
			e.preventDefault();
			this.zoomBy(Math.exp(e.deltaY * 0.0012));
			this._touch();
		}, { passive: false });
	}

	_touch() { this.lastInput = performance.now(); this.tween = null; this.onUserInput?.(); }

	cancelPointer(id) { this.pointers.delete(id); }

	zoomBy(f) {
		this.goal.dist = THREE.MathUtils.clamp(this.goal.dist * f, 1.6, 7.5);
	}

	rotateBy(daz, dpol) {
		this.goal.az += daz; this.goal.pol += dpol;
		this._clampGoal();
		this._touch();
	}

	_clampGoal() {
		this.goal.pol = THREE.MathUtils.clamp(this.goal.pol, 0.18, Math.PI - 0.22);
	}

	// eased camera move over a fixed duration (seconds)
	animateTo({ az, pol, dist, target }, duration = 2) {
		if (this.reduced) duration = 0.001;
		let toAz = this.az;
		if (az !== undefined) {
			let d = az - this.az;
			d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
			toAz = this.az + d;
		}
		this.vel.az = this.vel.pol = 0;
		this.tween = {
			t: 0, dur: duration,
			from: { az: this.az, pol: this.pol, dist: this.dist, target: this.target.clone() },
			to: { az: toAz, pol: pol ?? this.pol, dist: dist ?? this.dist, target: (target ?? this.target).clone() },
		};
	}

	flyTo({ az, pol, dist, target }) {
		if (az !== undefined) {
			// shortest way around
			let d = az - this.goal.az;
			d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
			this.goal.az += d;
		}
		if (pol !== undefined) this.goal.pol = pol;
		if (dist !== undefined) this.goal.dist = dist;
		if (target) this.goal.target.copy(target);
		this.vel.az = this.vel.pol = 0;
		this._clampGoal();
	}

	reset() { this._touch(); this.animateTo({ ...this.home, target: this.home.target }, 2); }

	update(dt) {
		const dragging = this.pointers.size > 0;
		if (this.tween) {
			const tw = this.tween;
			tw.t = Math.min(1, tw.t + dt / tw.dur);
			const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;   // ease in-out cubic
			this.goal.az = this.az = tw.from.az + (tw.to.az - tw.from.az) * e;
			this.goal.pol = this.pol = tw.from.pol + (tw.to.pol - tw.from.pol) * e;
			this.goal.dist = this.dist = tw.from.dist + (tw.to.dist - tw.from.dist) * e;
			this.target.lerpVectors(tw.from.target, tw.to.target, e); this.goal.target.copy(this.target);
			if (tw.t >= 1) this.tween = null;
		}
		if (!dragging && dt > 0) {
			// inertia
			this.goal.az += this.vel.az * 0.9; this.goal.pol += this.vel.pol * 0.9;
			const k = Math.exp(-dt * 6.5);
			this.vel.az *= k; this.vel.pol *= k;
			this._clampGoal();
		}
		const a = this.reduced ? 1 : 1 - Math.exp(-dt * 7.5);
		const b = this.reduced ? 1 : 1 - Math.exp(-dt * 4.0);
		const pa = this.az, pp = this.pol, pd = this.dist + this.distExtra;
		this.az += (this.goal.az - this.az) * a;
		this.pol += (this.goal.pol - this.pol) * a;
		this.dist += (this.goal.dist - this.dist) * b;
		this.target.lerp(this.goal.target, b);
		const dist = this.dist + this.distExtra;
		const s = Math.sin(this.pol);
		const ty = this.target.y + this.liftY;
		this.camera.position.set(
			this.target.x + dist * s * Math.sin(this.az),
			ty + dist * Math.cos(this.pol),
			this.target.z + dist * s * Math.cos(this.az),
		);
		this._look = (this._look || new THREE.Vector3()).set(this.target.x, ty, this.target.z);
		this.camera.lookAt(this._look);
		const change = Math.abs(this.az - pa) + Math.abs(this.pol - pp) + Math.abs(dist - pd) * 0.3;
		this.moving = change > 2e-5 || dragging || !!this.tween ||
			Math.abs(this.goal.az - this.az) + Math.abs(this.goal.pol - this.pol) > 1e-3 ||
			this.target.distanceToSquared(this.goal.target) > 1e-7;
		return this.moving;
	}
}
