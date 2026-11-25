import * as THREE from 'three/webgpu';
import {
	positionLocal, uniform, float, vec3, vec4, atan, length, abs, mod, smoothstep, step, PI, PI2, mix, dot, pow,
	normalView, positionViewDirection, positionWorld, fract, min, max, select,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ---------------------------------------------------------------------------
// Part catalogue. Mesh names come from the CAD export (turbo+CG.3ds).
// offset = exploded position (scene units), mass = inertia for the springs.
// ---------------------------------------------------------------------------
export const GROUPS = {
	compHousing: { label: 'Turbinengehäuse', offset: [0, 0.86, 0], mass: 3.2, side: 'left' },
	compWheel: { label: 'Turbinenrad', offset: [0, 0.5, 0], mass: 1.0, side: 'right' },
	shaft: { label: 'Welle', offset: [0, 0.18, 0], mass: 0.8, side: 'right' },
	center: { label: 'Lagergehäuse', offset: [0, 0, 0], mass: 2.6, side: 'left' },
	tip1: { label: 'Ölzulauf', offset: [0.02, 0.06, -0.32], mass: 0.4, side: 'left' },
	tip2: { label: 'Ölrücklauf', offset: [0.02, 0.06, 0.32], mass: 0.4, side: 'right' },
	turbWheel: { label: 'Verdichterrad', offset: [0, -0.48, 0], mass: 1.3, side: 'right' },
	turbHousing: { label: 'Verdichtergehäuse', offset: [0, -0.96, 0], mass: 4.2, side: 'left' },
	clamp: { label: 'V-Band-Schelle', offset: [0.5, -0.96, 0.06], mass: 0.7, side: 'right' },
	screw: { label: null, offset: [0.24, -0.98, 0.18], mass: 0.3 },
	screw1: { label: null, offset: [0.2, -1.0, -0.26], mass: 0.3 },
};

const MESHES = {
	Tube: { group: 'compHousing', mat: 'aluCast', cut: true, ghost: true },
	Path_1: { group: 'compHousing', mat: 'aluBright', cut: true, ghost: true },
	Cylinder_1: { group: 'compWheel', mat: 'aluPolish', spin: true },
	blades: { group: 'shaft', mat: 'steel', spin: true },
	midle_1: { group: 'center', mat: 'ironMachined', cut: true, ghost: true },
	tip1: { group: 'tip1', mat: 'anodized' },
	tip2: { group: 'tip2', mat: 'anodized' },
	Cylinder: { group: 'turbWheel', mat: 'inconel', spin: true },
	Tube_1: { group: 'turbHousing', mat: 'ironCast', cut: true, ghost: true },
	tie: { group: 'clamp', mat: 'stainless', cut: true, ghost: true },
	screw: { group: 'screw', mat: 'zinc', ghost: true },
	screw_1: { group: 'screw1', mat: 'zinc', ghost: true },
};

const MATS = {
	aluCast: { color: 0xb6b9bf, metalness: 1, roughness: 0.43 },
	aluBright: { color: 0xe4e6ea, metalness: 1, roughness: 0.2 },
	aluPolish: { color: 0xdcdfe3, metalness: 1, roughness: 0.12 },
	steel: { color: 0xc3c5c9, metalness: 1, roughness: 0.2 },
	ironMachined: { color: 0x8b8e94, metalness: 1, roughness: 0.38 },
	ironCast: { color: 0x75777c, metalness: 1, roughness: 0.55 },
	inconel: { color: 0xa9a196, metalness: 1, roughness: 0.27 },
	stainless: { color: 0xd0d3d7, metalness: 1, roughness: 0.25 },
	zinc: { color: 0x5b5e64, metalness: 1, roughness: 0.34 },
	anodized: { color: 0xf0580e, metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 },
};

// ---------------------------------------------------------------------------
// Cutaway: a wedge around the shaft axis opens for the flow view.
// ---------------------------------------------------------------------------
export const cut = {
	amount: uniform(0),                                   // 0 = closed, 1 = fully open
	center: uniform(THREE.MathUtils.degToRad(125)),       // wedge center angle atan2(z, x)
	half: THREE.MathUtils.degToRad(52),
};

function wedgeNodes() {
	const p = positionLocal;   // model space (housings are never rotated themselves)
	const ang = atan(p.z, p.x);
	const diff = abs(mod(ang.sub(cut.center).add(PI), PI2).sub(PI));
	const half = cut.amount.mul(cut.half);
	const inside = diff.lessThan(half);
	const r = length(p.xz);
	const edgeDist = diff.sub(half).mul(r);
	const glow = float(1).sub(smoothstep(0.0, 0.005, edgeDist)).mul(step(0.02, cut.amount));
	return { keep: inside.not(), glow };
}

// Intro reveal: an orange wireframe-like scan sweeps across the product and
// leaves the finished surface behind it (world X, left to right).
export const reveal = { front: uniform(-3) };
function revealNodes() {
	const x = positionWorld.x;
	const behind = reveal.front.sub(x);                       // > 0 = already revealed
	const keep = behind.greaterThan(0);
	const g = positionWorld.mul(22.0);
	const f = fract(g);
	const e = min(f, float(1).sub(f));                        // distance to the nearest grid plane
	const line = max(max(smoothstep(0.07, 0.0, e.x), smoothstep(0.07, 0.0, e.y)), smoothstep(0.07, 0.0, e.z));
	const band = smoothstep(0.55, 0.0, behind);               // glow trail behind the front
	const edge = smoothstep(0.03, 0.0, behind);
	const glow = band.mul(line.mul(3.2).add(0.12)).add(edge.mul(2.5));
	return { keep, glow: vec3(1.0, 0.38, 0.08).mul(glow) };
}

function makeRasterMaterial(def, opts) {
	const m = new THREE.MeshPhysicalNodeMaterial({ ...def });
	m.envMapIntensity = 1;
	const r = revealNodes();
	if (opts.cut) {
		m.side = THREE.DoubleSide;
		const w = wedgeNodes();
		m.maskNode = w.keep.and(r.keep);
		m.emissiveNode = vec3(1.0, 0.36, 0.06).mul(w.glow).mul(4.0).add(r.glow);
	} else {
		m.maskNode = r.keep;
		m.emissiveNode = r.glow;
	}
	return m;
}

// X-ray: housings become a fresnel glass shell, the rotating parts stay solid
export const xray = { amount: uniform(0) };
let ghostMat = null;
function makeGhostMaterial() {
	if (ghostMat) return ghostMat;
	const f = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2.0);
	const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
	const c = mix(vec3(0.05, 0.11, 0.2), vec3(0.62, 0.82, 1.0), f);
	m.colorNode = vec4(c, f.mul(0.85).add(0.06).mul(xray.amount));
	ghostMat = m;
	return m;
}

function makePathMaterial(def) {
	const m = new THREE.MeshPhysicalMaterial({ ...def });
	return m;
}

// Convert quantized/normalized attributes to plain float and bake the node
// transform, so path tracer, BVH raycasts and physics all see true geometry.
function dequantize(mesh) {
	const g = mesh.geometry;
	const out = new THREE.BufferGeometry();
	for (const name of ['position', 'normal']) {
		const a = g.attributes[name];
		if (!a) continue;
		const arr = new Float32Array(a.count * 3);
		for (let i = 0; i < a.count; i++) {
			arr[i * 3] = a.getX(i); arr[i * 3 + 1] = a.getY(i); arr[i * 3 + 2] = a.getZ(i);
		}
		out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
	}
	const idx = g.index;
	out.setIndex(new THREE.BufferAttribute(idx.count > 65535 || a32(idx) ? new Uint32Array(idx.array) : new Uint32Array(idx.array), 1));
	mesh.updateWorldMatrix(true, false);
	out.applyMatrix4(mesh.matrixWorld);
	out.computeBoundingBox();
	out.computeBoundingSphere();
	return out;
}
const a32 = idx => idx.array instanceof Uint32Array;

export async function loadModel(url, onProgress) {
	const res = await fetch(url);
	if (!res.ok) throw new Error('Modell nicht gefunden: ' + url);
	const total = +res.headers.get('content-length') || 0;
	const reader = res.body.getReader();
	const chunks = []; let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value); loaded += value.length;
		onProgress?.(loaded, total);
	}
	const buf = new Uint8Array(loaded); let o = 0;
	for (const c of chunks) { buf.set(c, o); o += c.length; }

	const loader = new GLTFLoader();
	await MeshoptDecoder.ready;
	loader.setMeshoptDecoder(MeshoptDecoder);
	const gltf = await loader.parseAsync(buf.buffer, '');
	gltf.scene.updateMatrixWorld(true);

	const root = new THREE.Group(); root.name = 'turbo';
	const groups = {};
	for (const [key, def] of Object.entries(GROUPS)) {
		const g = new THREE.Group(); g.name = key;
		g.userData = { ...def, key, rest: new THREE.Vector3(), meshes: [] };
		groups[key] = g; root.add(g);
	}
	const meshes = [];
	const rasterMats = {}, pathMats = {};
	gltf.scene.traverse(o => {
		if (!o.isMesh) return;
		const info = MESHES[o.name];
		if (!info) return;
		const geo = dequantize(o);
		const key = info.mat + (info.cut ? ':cut' : '');
		rasterMats[key] ||= makeRasterMaterial(MATS[info.mat], info);
		pathMats[info.mat] ||= makePathMaterial(MATS[info.mat]);
		const mesh = new THREE.Mesh(geo, rasterMats[key]);
		mesh.name = o.name;
		mesh.userData = { ...info, rasterMat: rasterMats[key], pathMat: pathMats[info.mat], ghostMat: info.ghost ? makeGhostMaterial() : null };
		groups[info.group].add(mesh);
		groups[info.group].userData.meshes.push(mesh);
		meshes.push(mesh);
	});
	gltf.scene.traverse(o => o.geometry?.dispose());

	// part bounds (assembled) for labels / pivots
	for (const g of Object.values(groups)) {
		const box = new THREE.Box3();
		for (const m of g.userData.meshes) box.union(m.geometry.boundingBox);
		g.userData.box = box;
	}
	return { root, groups, meshes };
}

export function useGhostMaterials(meshes, on) {
	for (const m of meshes) if (m.userData.ghostMat) {
		m.material = on ? m.userData.ghostMat : m.userData.rasterMat;
		m.renderOrder = on ? 5 : 0;
	}
}
