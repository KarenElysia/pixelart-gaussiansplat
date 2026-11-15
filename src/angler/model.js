// An articulated deep-sea anglerfish hovering over a seabed, modelled from
// SDF primitives. Each bone is its own surfel cloud; lighting is NOT baked,
// so it can be computed live from the surfel normal when the bones move.

import { sphere, ellipsoid, cone, displace, shape, sampleSurface, worley } from "../authoring/sdf.js";
import { vnoise3, mulberry32 } from "../noise.js";

export const M = { skin: 0, bone: 1, lure: 2, mouth: 3, eye: 4, rock: 5, kelp: 6, glow: 7 };
export const H = 0.0125; // surfel spacing

const D2R = Math.PI / 180;
const rimPoint = (cx, cz, rx, rz, deg) => [cx + rx * Math.cos(deg * D2R), cz + rz * Math.sin(deg * D2R)];

// ---- shapes (each in its own bone-local space) ----------------------------

function bodyShape() {
  const s = shape();
  s.add(ellipsoid(0, 0, 0, 0.42, 0.34, 0.3), M.skin);
  s.add(cone([-0.2, 0.0, 0], [-0.52, 0.02, 0], 0.25, 0.13), M.skin, 0.12);
  s.add(ellipsoid(0.26, 0.07, 0, 0.27, 0.2, 0.27), M.skin, 0.1);
  // brow ridges and cheek lumps
  for (const sz of [-1, 1]) {
    s.add(cone([0.18, 0.2, sz * 0.15], [0.42, 0.15, sz * 0.19], 0.05, 0.035), M.skin, 0.05);
    s.add(sphere(0.02, -0.1, sz * 0.25, 0.1), M.skin, 0.08);
    s.add(sphere(0.33, 0.115, sz * 0.205, 0.058), M.eye);
  }
  // dorsal spines
  for (let i = 0; i < 6; i++) {
    const x = 0.05 - i * 0.1, len = 0.2 - Math.abs(i - 2) * 0.025;
    s.add(cone([x, 0.27 - i * 0.012, 0], [x - 0.1, 0.3 + len, 0], 0.03, 0.004), M.bone, 0.03);
  }
  // little warts
  const rnd = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28, b = (rnd() - 0.3) * 1.2;
    const x = -0.1 + 0.36 * Math.cos(b) * Math.cos(a), y = 0.3 * Math.sin(b), z = 0.28 * Math.cos(b) * Math.sin(a);
    s.add(sphere(x, y, z, 0.018 + rnd() * 0.02), M.skin, 0.02);
  }
  // mouth cavity
  s.sub(ellipsoid(0.42, -0.11, 0, 0.27, 0.15, 0.225), M.mouth);
  // upper teeth
  for (let a = -78; a <= 78; a += 15.6) {
    const [x, z] = rimPoint(0.3, 0, 0.245, 0.225, a);
    const len = 0.07 + 0.05 * Math.abs(Math.sin(a * 0.11 + 1));
    s.add(cone([x, 0.0, z], [x - 0.012, -len, z * 0.95], 0.02, 0.003), M.bone);
  }
  return s;
}

function jawShape() {
  const s = shape();
  s.add(ellipsoid(0.3, -0.07, 0, 0.31, 0.125, 0.27), M.skin);
  s.add(sphere(0.52, -0.1, 0, 0.07), M.skin, 0.08); // chin
  s.sub(ellipsoid(0.33, 0.03, 0, 0.275, 0.115, 0.225), M.mouth);
  for (let a = -84; a <= 84; a += 16.8) {
    const [x, z] = rimPoint(0.31, 0, 0.275, 0.238, a);
    const len = 0.1 + 0.08 * Math.abs(Math.cos(a * 0.09));
    s.add(cone([x, -0.02, z], [x - 0.02, len, z * 0.93], 0.019, 0.003), M.bone);
  }
  return s;
}

const stalkShape = (len, r1, r2) => shape().add(cone([0, 0, 0], [0, len, 0], r1, r2), M.skin);
function bulbShape() {
  const s = shape();
  s.add(cone([0, 0, 0], [0, 0.1, 0], 0.014, 0.012), M.skin);
  s.add(sphere(0, 0.14, 0, 0.05), M.lure);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + 0.4;
    s.add(cone([0, 0.12, 0], [0.07 * Math.cos(a), 0.06, 0.07 * Math.sin(a)], 0.008, 0.003), M.skin);
  }
  return s;
}

const tailShape = () =>
  shape()
    .add(cone([0.04, 0, 0], [-0.24, 0, 0], 0.135, 0.06), M.skin)
    .add(cone([-0.05, 0.1, 0], [-0.14, 0.2, 0], 0.025, 0.004), M.bone, 0.02);
const finRays = (x, y) => 0.006 * Math.sin(Math.atan2(y, -x + 0.02) * 26);
const caudalShape = () =>
  shape()
    .add(cone([0.03, 0, 0], [-0.06, 0, 0], 0.06, 0.03), M.skin)
    .add(displace(ellipsoid(-0.2, 0, 0, 0.21, 0.24, 0.016), (x, y) => finRays(x, y)), M.skin, 0.03);
const pectoralShape = () =>
  shape()
    .add(sphere(0, 0, 0, 0.045), M.skin)
    .add(displace(ellipsoid(-0.16, 0, 0, 0.18, 0.115, 0.014), (x, y) => finRays(x, y)), M.skin, 0.03);

function seabedShape() {
  const s = shape();
  const bump = (x, y, z) => -0.05 * vnoise3(x * 5, y * 5, z * 5) - 0.025 * vnoise3(x * 13, y * 13, z * 13);
  s.add(displace(ellipsoid(0, -0.3, 0, 1.05, 0.3, 1.05), bump), M.rock);
  const rnd = mulberry32(9);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * 6.28, r = 0.35 + rnd() * 0.6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, rr = 0.05 + rnd() * 0.09;
    s.add(displace(ellipsoid(x, -0.03 - r * 0.05, z, rr * 1.2, rr * 0.8, rr), bump), M.rock, 0.03);
  }
  // vent chimneys
  for (const [x, z, hgt, r] of [[-0.62, -0.3, 0.42, 0.075], [-0.5, -0.46, 0.26, 0.055], [-0.74, -0.16, 0.2, 0.05], [0.66, 0.36, 0.3, 0.06], [0.55, 0.5, 0.17, 0.045]]) {
    s.add(displace(cone([x, -0.1, z], [x + 0.02, hgt, z], r, r * 0.55), bump), M.rock, 0.05);
    s.sub(cone([x + 0.02, hgt - 0.05, z], [x + 0.02, hgt + 0.1, z], r * 0.3, r * 0.34), M.rock);
  }
  // glowing anemones
  for (const [x, z] of [[0.3, 0.62], [-0.2, 0.7], [0.72, -0.2], [-0.35, -0.72], [0.1, -0.62], [-0.78, 0.3]]) {
    const y = -0.04 - Math.hypot(x, z) * 0.06;
    s.add(cone([x, y, z], [x, y + 0.07, z], 0.012, 0.008), M.kelp);
    s.add(sphere(x, y + 0.085, z, 0.022), M.glow);
  }
  return s;
}

function kelpShape() {
  const s = shape();
  const rnd = mulberry32(21);
  for (let i = 0; i < 9; i++) {
    const a = 0.6 + i * 0.7 + rnd() * 0.3, r = 0.44 + rnd() * 0.26;
    let p = [Math.cos(a) * r, -0.12, Math.sin(a) * r];
    const hgt = 0.2 + rnd() * 0.32, segs = 5, ph = rnd() * 6;
    for (let k = 0; k < segs; k++) {
      const t = (k + 1) / segs;
      const q = [p[0] + 0.04 * Math.sin(ph + t * 5), -0.12 + hgt * t, p[2] + 0.04 * Math.cos(ph + t * 4)];
      s.add(cone(p, q, 0.018 * (1.1 - t * 0.7), 0.018 * (1.1 - (t + 1 / segs) * 0.7)), M.kelp, 0.01);
      if (k % 2 === 1) s.add(ellipsoid(q[0] + 0.03, q[1], q[2], 0.045, 0.02, 0.012), M.kelp, 0.01);
      p = q;
    }
  }
  return s;
}

// ---- per-surfel "painted" detail (cracks, plates, strata) ------------------
function detail(m, x, y, z) {
  if (m === M.skin) {
    const [f1, e] = worley(x * 9, y * 9, z * 9, 3);
    let d = 0.5 + 0.34 * (vnoise3(x * 6, y * 6, z * 6) - 0.5) + 0.12 * (0.5 - f1);
    if (e < 0.07) d -= 0.3; // cracks between plates
    return d;
  }
  if (m === M.rock) {
    const [, e] = worley(x * 5, y * 7, z * 5, 8);
    let d = 0.5 + 0.4 * (vnoise3(x * 8, y * 14, z * 8) - 0.5);
    if (e < 0.06) d -= 0.28;
    return d;
  }
  if (m === M.bone) return 0.55 + 0.2 * (vnoise3(x * 30, y * 6, z * 30) - 0.5);
  if (m === M.mouth) return 0.5 + 0.3 * (vnoise3(x * 14, y * 14, z * 14) - 0.5);
  if (m === M.kelp) return 0.5 + 0.3 * Math.sin(y * 60);
  return 0.5;
}

// ---- rig -------------------------------------------------------------------
// Bones: name, parent, rest position (in parent space), shape + sampling box.
export function buildAngler() {
  const defs = [
    { name: "seabed", h: H * 1.45, parent: null, pos: [0, 0, 0], shape: seabedShape(), box: [[-1.15, -0.62, -1.15], [1.15, 0.5, 1.15]] },
    { name: "kelp", parent: null, pos: [0, 0, 0], shape: kelpShape(), box: [[-1.1, -0.2, -1.1], [1.1, 1.0, 1.1]] },
    { name: "body", parent: null, pos: [0, 0.62, 0], shape: bodyShape(), box: [[-0.6, -0.4, -0.38], [0.6, 0.58, 0.38]] },
    { name: "jaw", parent: "body", pos: [0.0, -0.13, 0], shape: jawShape(), box: [[-0.05, -0.24, -0.3], [0.66, 0.2, 0.3]] },
    { name: "stalk1", parent: "body", pos: [0.2, 0.25, 0], shape: stalkShape(0.2, 0.02, 0.016), box: [[-0.04, -0.03, -0.04], [0.04, 0.23, 0.04]] },
    { name: "stalk2", parent: "stalk1", pos: [0, 0.2, 0], shape: stalkShape(0.2, 0.016, 0.014), box: [[-0.04, -0.03, -0.04], [0.04, 0.23, 0.04]] },
    { name: "bulb", parent: "stalk2", pos: [0, 0.2, 0], shape: bulbShape(), box: [[-0.09, -0.03, -0.09], [0.09, 0.21, 0.09]] },
    { name: "tail", parent: "body", pos: [-0.5, 0.02, 0], shape: tailShape(), box: [[-0.32, -0.16, -0.16], [0.2, 0.24, 0.16]] },
    { name: "caudal", parent: "tail", pos: [-0.24, 0, 0], shape: caudalShape(), box: [[-0.44, -0.27, -0.08], [0.1, 0.27, 0.08]] },
    { name: "finL", parent: "body", pos: [-0.02, -0.1, 0.28], shape: pectoralShape(), box: [[-0.37, -0.14, -0.06], [0.06, 0.14, 0.06]] },
    { name: "finR", parent: "body", pos: [-0.02, -0.1, -0.28], shape: pectoralShape(), box: [[-0.37, -0.14, -0.06], [0.06, 0.14, 0.06]] },
  ];
  for (const d of defs) {
    const s = sampleSurface(d.shape, d.box[0], d.box[1], d.h || H);
    const n = s.mat.length;
    d.count = n;
    d.p = new Float32Array(s.p);
    d.n = new Float32Array(s.n);
    d.attr = new Float32Array(n * 3); // material, detail, ao
    for (let i = 0; i < n; i++) {
      const x = s.p[i * 3], y = s.p[i * 3 + 1], z = s.p[i * 3 + 2];
      let m = s.mat[i], det = detail(m, x, y, z), ao = s.ao[i];
      if (m === M.eye) {
        // slit pupil looking forward/outward
        const sz = Math.sign(z);
        const ex = x - 0.33, ey = y - 0.115, ez = z - sz * 0.205;
        const el = Math.hypot(ex, ey, ez) || 1;
        det = (ex * 0.6 + ez * sz * 0.8) / el > 0.8 ? 0 : 1; // round pupil
      }
      if (d.name === "seabed" && m === M.rock) {
        // soft contact shadow under the fish
        ao *= 1 - 0.35 * Math.exp(-(x * x + z * z) / 0.16);
      }
      d.attr[i * 3] = m;
      d.attr[i * 3 + 1] = Math.max(0, Math.min(1, det));
      d.attr[i * 3 + 2] = ao;
    }
    delete d.shape;
  }
  return defs;
}

// Pose the bones at time t. `bones` maps name -> THREE.Object3D.
export function poseAngler(bones, t) {
  const b = bones;
  const breathe = Math.sin(t * 1.1);
  // the whole fish: hover, look around, pitch a little
  b.body.position.set(0.03 * Math.sin(t * 0.4), 0.62 + 0.035 * Math.sin(t * 0.9), 0.03 * Math.cos(t * 0.33));
  b.body.rotation.set(0.05 * Math.sin(t * 0.7), 0.42 * Math.sin(t * 0.31) + 0.12 * Math.sin(t * 0.83), 0.07 * Math.sin(t * 0.55), "YXZ");
  // jaw: slow breathing plus an occasional wide gape and snap
  const cyc = (t * 0.16) % 1;
  const gape = cyc > 0.72 ? Math.sin(((cyc - 0.72) / 0.28) * Math.PI) ** 2 : 0;
  const snap = cyc > 0.965 ? 1 - (1 - cyc) / 0.035 : 0;
  b.jaw.rotation.z = -(0.3 + 0.08 * breathe + 0.45 * gape) * (1 - 0.85 * snap);
  // lure stalk: arcs forward over the mouth and wobbles like a fishing rod
  b.stalk1.rotation.set(0.12 * Math.sin(t * 0.8), 0, -0.5 + 0.14 * Math.sin(t * 1.3));
  b.stalk2.rotation.set(0.18 * Math.sin(t * 0.8 - 0.7), 0, -0.75 + 0.2 * Math.sin(t * 1.3 - 0.8));
  b.bulb.rotation.set(0.25 * Math.sin(t * 0.8 - 1.4), 0, -0.8 + 0.28 * Math.sin(t * 1.3 - 1.6));
  // swimming wave travels down the tail
  b.tail.rotation.y = 0.3 * Math.sin(t * 2.1);
  b.caudal.rotation.y = 0.5 * Math.sin(t * 2.1 - 1.0);
  // pectoral fins scull
  const flap = Math.sin(t * 2.6);
  b.finL.rotation.set(0.5 * flap, -0.75 + 0.2 * Math.sin(t * 2.6 - 0.6), 0.25, "YXZ");
  b.finR.rotation.set(-0.5 * flap, 0.75 - 0.2 * Math.sin(t * 2.6 - 0.6), 0.25, "YXZ");
}
