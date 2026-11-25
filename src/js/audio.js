// Small synthesized sound layer: turbo whine for the flow view, snap clicks.
export class Sound {
	constructor() { this.enabled = false; this.ctx = null; }

	_ensure() {
		if (this.ctx) return;
		const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
		this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
		const comp = ctx.createDynamicsCompressor(); comp.connect(this.master);
		// whine: two detuned sines
		this.whine = ctx.createGain(); this.whine.gain.value = 0; this.whine.connect(comp);
		this.o1 = ctx.createOscillator(); this.o1.type = 'sine';
		this.o2 = ctx.createOscillator(); this.o2.type = 'triangle';
		const g2 = ctx.createGain(); g2.gain.value = 0.25;
		this.o1.connect(this.whine); this.o2.connect(g2); g2.connect(this.whine);
		this.o1.start(); this.o2.start();
		// air: filtered noise
		const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
		const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
		this.bp = ctx.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.Q.value = 0.8;
		this.air = ctx.createGain(); this.air.gain.value = 0;
		n.connect(this.bp); this.bp.connect(this.air); this.air.connect(comp); n.start();
		this.comp = comp;
	}

	setEnabled(on) {
		this.enabled = on;
		if (on) this._ensure();
		if (!this.ctx) return;
		if (on) this.ctx.resume();
		this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.08);
	}

	setTurbo(active, rpm) {
		if (!this.ctx || !this.enabled) return;
		const t = this.ctx.currentTime, n = rpm / 200000;
		const f = 180 + Math.pow(n, 1.2) * 2600;
		this.o1.frequency.setTargetAtTime(f, t, 0.25);
		this.o2.frequency.setTargetAtTime(f * 1.503, t, 0.25);
		this.whine.gain.setTargetAtTime(active ? 0.035 + n * 0.05 : 0, t, 0.3);
		this.bp.frequency.setTargetAtTime(400 + n * 3000, t, 0.25);
		this.air.gain.setTargetAtTime(active ? 0.02 + n * 0.09 : 0, t, 0.3);
	}

	click(weight = 1) {
		if (!this.ctx || !this.enabled) return;
		const ctx = this.ctx, t = ctx.currentTime;
		const o = ctx.createOscillator(), g = ctx.createGain();
		o.type = 'triangle';
		o.frequency.setValueAtTime(1600 / Math.sqrt(weight), t);
		o.frequency.exponentialRampToValueAtTime(220 / Math.sqrt(weight), t + 0.05);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
		o.connect(g); g.connect(this.comp); o.start(t); o.stop(t + 0.14);
	}
}
