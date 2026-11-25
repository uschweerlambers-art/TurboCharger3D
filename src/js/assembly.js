import * as THREE from 'three/webgpu';

// Exploded view with weight: every part hangs on a damped spring.
// Parts can be grabbed, thrown, and snap back into their slot.
export class Assembly extends EventTarget {
	constructor({ groups, meshes, camera, dom, reducedMotion }) {
		super();
		this.groups = Object.values(groups);
		this.meshes = meshes;
		this.camera = camera;
		this.dom = dom;
		this.reduced = reducedMotion;
		this.amount = 0;           // requested explode amount 0..1
		this.visualAmount = 0;     // smoothed, for camera / labels
		this.grabEnabled = false;
		this.held = null;
		this.raycaster = new THREE.Raycaster();
		this.raycaster.firstHitOnly = true;
		this.plane = new THREE.Plane();
		this._ndc = new THREE.Vector2();
		this._tmp = new THREE.Vector3();
		this._hist = [];
		const order = ['compHousing', 'turbHousing', 'compWheel', 'turbWheel', 'clamp', 'tip1', 'tip2', 'shaft', 'screw', 'screw1', 'center'];
		for (const g of this.groups) {
			const u = g.userData;
			u.pos = new THREE.Vector3();
			u.vel = new THREE.Vector3();
			u.rot = new THREE.Vector3();
			u.w = new THREE.Vector3();
			u.slotAmount = 0;
			u.pending = null;
			u.order = Math.max(0, order.indexOf(u.key));
			u.pivot = u.box.getCenter(new THREE.Vector3());
			u.offsetV = new THREE.Vector3(...u.offset);
			u.displaced = false;
			u.omega = 3.2;   // critically damped: smooth ~2 s move, no overshoot
		}
		this._bind();
	}

	setAmount(v, { stagger = true } = {}) {
		v = THREE.MathUtils.clamp(v, 0, 1);
		const now = performance.now();
		const opening = v > this.amount;
		this.amount = v;
		for (const g of this.groups) {
			const u = g.userData;
			const n = opening ? u.order : (10 - u.order);
			u.pending = { value: v, at: now + (stagger && !this.reduced ? n * 45 : 0) };
		}
	}

	slotOf(u, out) { return out.copy(u.offsetV).multiplyScalar(u.slotAmount); }

	// ---------------------------------------------------------------- input
	_bind() {
		const d = this.dom;
		d.addEventListener('pointerdown', e => {
			if (!this.grabEnabled || e.button !== 0 || this.held) return;
			const hit = this.pick(e.clientX, e.clientY);
			if (!hit) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			d.setPointerCapture(e.pointerId);
			this.grab(hit, e.pointerId);
			this.dom.classList.add('grabbing');
		}, { capture: true });
		d.addEventListener('pointermove', e => {
			if (this.held && this.held.pointerId === e.pointerId) {
				this.dragTo(e.clientX, e.clientY);
			} else if (this.grabEnabled && e.pointerType === 'mouse' && !e.buttons) {
				this._hoverQueued = [e.clientX, e.clientY];
			}
		});
		const up = e => {
			if (this.held && this.held.pointerId === e.pointerId) this.release();
		};
		d.addEventListener('pointerup', up);
		d.addEventListener('pointercancel', up);
	}

	canRaycast() { return this.meshes.every(m => m.geometry.boundsTree); }

	pick(x, y) {
		if (!this.canRaycast()) return null;
		const r = this.dom.getBoundingClientRect();
		this._ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
		this.raycaster.setFromCamera(this._ndc, this.camera);
		const hits = this.raycaster.intersectObjects(this.meshes, false);
		if (!hits.length) return null;
		const mesh = hits[0].object;
		return { group: mesh.parent, point: hits[0].point };
	}

	grab(hit, pointerId = -1) {
		const g = hit.group, u = g.userData;
		this.camera.getWorldDirection(this._tmp);
		this.plane.setFromNormalAndCoplanarPoint(this._tmp.negate(), hit.point);
		const local = g.parent.worldToLocal(hit.point.clone());
		this.held = {
			group: g, pointerId,
			offset: local.clone().sub(u.pos),
			arm: local.clone().sub(u.pivot.clone().add(u.pos)),
			target: u.pos.clone(),
		};
		this._hist.length = 0;
		u.displaced = true;
		this.dispatchEvent(new CustomEvent('grab', { detail: g }));
	}

	dragTo(x, y) {
		const r = this.dom.getBoundingClientRect();
		this._ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
		this.raycaster.setFromCamera(this._ndc, this.camera);
		const p = new THREE.Vector3();
		if (!this.raycaster.ray.intersectPlane(this.plane, p)) return;
		this.dragToWorld(p);
	}

	dragToWorld(p) {
		if (!this.held) return;
		const t = this.held.group.parent.worldToLocal(p.clone()).sub(this.held.offset);
		// keep thrown parts within a sensible stage
		t.clampLength(0, 2.4);
		this.held.target.copy(t);
		this._hist.push({ t: performance.now(), p: t.clone() });
		while (this._hist.length > 8) this._hist.shift();
	}

	release() {
		const h = this.held;
		if (!h) return;
		const u = h.group.userData;
		// throw velocity from the last ~90 ms of motion
		const now = performance.now();
		const recent = this._hist.filter(s => now - s.t < 90);
		if (recent.length >= 2) {
			const a = recent[0], b = recent[recent.length - 1];
			const dt = Math.max(0.016, (b.t - a.t) / 1000);
			const v = b.p.clone().sub(a.p).divideScalar(dt).clampLength(0, 7);
			u.vel.copy(v);
			// spin from the lever arm
			u.w.add(new THREE.Vector3().crossVectors(h.arm, v).multiplyScalar(5).clampLength(0, 14));
		}
		this.held = null;
		this.dom.classList.remove('grabbing');
		this.dispatchEvent(new CustomEvent('release', { detail: h.group }));
	}

	// ---------------------------------------------------------------- sim
	update(dt, now = performance.now()) {
		if (this._hoverQueued && !this.held) {
			const [x, y] = this._hoverQueued; this._hoverQueued = null;
			this.dom.classList.toggle('can-grab', !!this.pick(x, y));
		}
		if (!this.grabEnabled) this.dom.classList.remove('can-grab');

		let energy = 0;
		const steps = Math.ceil(Math.min(dt, 0.05) / (1 / 240));
		const h = Math.min(dt, 0.05) / Math.max(1, steps);
		const slot = this._tmp;
		for (const g of this.groups) {
			const u = g.userData;
			if (u.pending && now >= u.pending.at) {
				if (Math.abs(u.slotAmount - u.pending.value) > 0.05) u.displaced = true;
				u.slotAmount = u.pending.value; u.pending = null;
			}
			const held = this.held && this.held.group === g;
			const omega = held ? 24 : u.omega;
			const zeta = held ? 0.95 : 1.0;
			const omegaR = 4.0, zetaR = 1.0;
			for (let s = 0; s < steps; s++) {
				if (held) slot.copy(this.held.target); else this.slotOf(u, slot);
				// x'' = ω²(target - x) - 2ζω x'
				const ax = omega * omega * (slot.x - u.pos.x) - 2 * zeta * omega * u.vel.x;
				const ay = omega * omega * (slot.y - u.pos.y) - 2 * zeta * omega * u.vel.y;
				const az = omega * omega * (slot.z - u.pos.z) - 2 * zeta * omega * u.vel.z;
				u.vel.x += ax * h; u.vel.y += ay * h; u.vel.z += az * h;
				u.pos.addScaledVector(u.vel, h);
				// rotational spring back to upright
				u.w.x += (-omegaR * omegaR * u.rot.x - 2 * zetaR * omegaR * u.w.x) * h;
				u.w.y += (-omegaR * omegaR * u.rot.y - 2 * zetaR * omegaR * u.w.y) * h;
				u.w.z += (-omegaR * omegaR * u.rot.z - 2 * zetaR * omegaR * u.w.z) * h;
				u.rot.addScaledVector(u.w, h);
			}
			if (u.rot.length() > 1.4) u.rot.setLength(1.4);
			this.slotOf(u, slot);
			const err = u.pos.distanceTo(slot);
			const speed = u.vel.length();
			energy += err + speed * 0.2 + u.rot.length() * 0.3 + u.w.length() * 0.05;
			if (!held && u.displaced && err < 0.006 && speed < 0.12) {
				u.displaced = false;
				this.dispatchEvent(new CustomEvent('snap', { detail: g }));
			}
			if (!held && err > 0.08) u.displaced = true;
			// compose transform: rotate around the part's own pivot
			const ang = u.rot.length();
			if (ang > 1e-6) g.quaternion.setFromAxisAngle(this._tmp.copy(u.rot).divideScalar(ang), ang);
			else g.quaternion.identity();
			const pv = u.pivot;
			const rp = pv.clone().applyQuaternion(g.quaternion);
			g.position.copy(u.pos).add(pv).sub(rp);
		}
		const a = this.reduced ? 1 : 1 - Math.exp(-dt * 2.4);
		this.visualAmount += (this.amount - this.visualAmount) * a;
		this.energy = energy;
		this.settled = energy < 0.002 && !this.held && this.groups.every(g => !g.userData.pending);
		return this.settled;
	}
}
