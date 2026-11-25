// Preloader backdrop after the reference layout: an animated halftone wave
// (orange to white), a slowly turning wireframe "network globe" and a grain
// layer (CSS). Plain 2D canvas, no dependencies.

export function splitReveal(el) {
	const words = el.textContent.trim().split(/\s+/);
	el.textContent = '';
	el.setAttribute('aria-label', words.join(' '));
	words.forEach((w, i) => {
		const outer = document.createElement('span');
		outer.className = 'w';
		outer.setAttribute('aria-hidden', 'true');
		const inner = document.createElement('span');
		inner.textContent = w;
		inner.style.setProperty('--i', i + (el.classList.contains('pl-sub') ? 2 : 0));
		outer.appendChild(inner);
		el.appendChild(outer);
		if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
	});
}

export function startPreloaderBackdrop(canvas, { reducedMotion = false } = {}) {
	// Halftone dots on a grid; their size follows a slow, flowing field and
	// they light up softly around the cursor.
	const ctx = canvas.getContext('2d');
	let W = 0, H = 0, dpr = 1, raf = 0, running = true;
	const t0 = performance.now();
	const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, glow: 0, tglow: 0 };

	const resize = () => {
		dpr = Math.min(devicePixelRatio || 1, 2);
		W = canvas.clientWidth; H = canvas.clientHeight;
		canvas.width = W * dpr; canvas.height = H * dpr;
	};
	resize();
	const onMove = e => { mouse.tx = e.clientX; mouse.ty = e.clientY; mouse.tglow = 1; if (mouse.x < -1e3) { mouse.x = mouse.tx; mouse.y = mouse.ty; } };
	const onLeave = () => { mouse.tglow = 0; };
	addEventListener('resize', resize);
	addEventListener('pointermove', onMove);
	document.addEventListener('pointerleave', onLeave);

	const draw = now => {
		const t = (now - t0) / 1000 * (reducedMotion ? 0 : 1);
		mouse.x += (mouse.tx - mouse.x) * 0.12; mouse.y += (mouse.ty - mouse.y) * 0.12;
		mouse.glow += (mouse.tglow - mouse.glow) * 0.06;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		const sp = Math.max(11, Math.min(15, W / 110));
		const rMax = sp * 0.27;
		const R2 = Math.pow(Math.min(W, H) * 0.22, 2);
		for (let y = sp / 2, row = 0; y < H; y += sp, row++) {
			const vy = y / H;
			for (let x = sp / 2 + (row % 2) * sp * 0.5; x < W; x += sp) {
				const vx = x / W;
				// flowing field: a few slow travelling waves
				const f = Math.sin(vx * 5.2 + t * 0.55 + Math.sin(vy * 3.1 - t * 0.35) * 1.6)
					+ Math.sin(vy * 6.4 - t * 0.42 + Math.cos(vx * 2.7 + t * 0.25) * 1.3)
					+ Math.sin((vx + vy) * 3.6 + t * 0.3);
				let s = (f / 3) * 0.5 + 0.5;                   // 0..1
				s = s * s * (3 - 2 * s);
				// cursor light
				const dx = x - mouse.x, dy = y - mouse.y;
				const g = Math.exp(-(dx * dx + dy * dy) / R2) * mouse.glow;
				const r = rMax * (0.12 + s * 0.6 + g * 0.35);
				if (r < 0.35) continue;
				// dark grey dots so white type stays readable; the cursor lifts them a little
				const v = Math.round(78 + g * 70);
				ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.28 + s * 0.3 + g * 0.3})`;
				ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
			}
		}
		if (running) raf = requestAnimationFrame(draw);
	};
	raf = requestAnimationFrame(draw);
	return () => {
		running = false; cancelAnimationFrame(raf);
		removeEventListener('resize', resize); removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave);
	};
}
