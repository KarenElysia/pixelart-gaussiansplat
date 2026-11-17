// A creature made entirely in code: modelled from SDF shapes, rigged by hand.
//
// Unlike the converted models (one splat cloud + skinning), every bone here
// is its own splat cloud inside a three.js Group, and the pose is plain
// JavaScript (src/angler/model.js). Colours come from two hand-picked ramps
// instead of textures: a splat stores a material id, a painted detail value
// and baked occlusion, and the shader turns those into a ramp colour.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, dyno } from "@sparkjsdev/spark";
import { buildAngler, poseAngler, H } from "./model.js";
import { hexToRgb, mulberry32 } from "../noise.js";
import { createPost } from "../render/post.js";
import { createHud, commonControls, showLoading, defaultPixel, portraitFit, viewportSize } from "../render/hud.js";

THREE.ColorManagement.enabled = false;

const TEAL = ["#04080f", "#081424", "#0d2238", "#14364e", "#1f5068", "#327086", "#5294a4", "#84bac0", "#bcdfd8", "#effaee"];
const WARM = ["#2a1216", "#5c2418", "#a04a20", "#e08638", "#ffc874", "#fff2c8"];
const MIX = ["#3d3a48", "#7a6a6c", "#c9a48a", "#f0d2b0"]; // teal lit by the warm lure
const BG = "#04080f";

const params = new URLSearchParams(location.search);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const state = { pixel: Number(params.get("px")) || 0, quant: params.get("quant") !== "0", dither: 0, idle: true, crisp: true, ss: params.get("ss") === "0" ? 1 : 2, outline: params.get("outline") !== "0" };
let hud;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(dpr);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
// hard-edged splats: no Gaussian falloff, no anti-alias blur. Each splat is a
// flat opaque disc, so neighbouring colours never bleed into each other.
const spark = new SparkRenderer({ renderer, falloff: 0, maxStdDev: 1.5, blurAmount: 0, preBlurAmount: 0.3 });
scene.add(spark);

const TARGET = new THREE.Vector3(0, 0.42, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.2;
controls.maxDistance = 9;
controls.target.copy(TARGET);
controls.addEventListener("start", () => { state.idle = false; hud?.set("orbit", false); });

const rt = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType });
const post = createPost();
post.setPalette([...TEAL, ...WARM, ...MIX]);
post.setBackground(BG);
post.setOutline(state.outline);

// ---------------------------------------------------------------- shading
const uTime = dyno.dynoFloat(0);
const uCam = dyno.dynoVec3(new THREE.Vector3());
const uLure = dyno.dynoVec3(new THREE.Vector3());
const uFog = dyno.dynoVec2(new THREE.Vector2(3, 6));

const glslRamp = (name, hexes) => `
vec3 ${name}(float l) {
  const vec3 c[${hexes.length}] = vec3[${hexes.length}](${hexes.map((h) => `vec3(${hexToRgb(h).map((v) => v.toFixed(4)).join(",")})`).join(",")});
  l = clamp(l, 0.0, 1.0) * ${(hexes.length - 1).toFixed(1)};
  int i = int(floor(l));
  return mix(c[i], c[min(i + 1, ${hexes.length - 1})], fract(l));
}`;
const GLOBALS = `
float ps_hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 ps_hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
${glslRamp("ps_teal", TEAL)}
${glslRamp("ps_warm", WARM)}`;

function fx(body) {
  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: "float", cam: "vec3", lure: "vec3", fog: "vec2" },
      outTypes: { gsplat: dyno.Gsplat },
      inputs: { gsplat, t: uTime, cam: uCam, lure: uLure, fog: uFog },
      globals: () => [GLOBALS],
      statements: ({ inputs, outputs }) => [`${outputs.gsplat} = ${inputs.gsplat};`, body(inputs, outputs.gsplat)],
    });
    return { gsplat: d.outputs.gsplat };
  });
}

// World-space lighting. rgba carries (material/8, painted detail, baked AO).
const shadeFx = () =>
  fx((i, g) => `{
    vec3 n = quatVec(${g}.quaternion, vec3(0.0, 0.0, 1.0));
    vec3 p = ${g}.center;
    int m = int(floor(${g}.rgba.r * 8.0 + 0.5));
    float det = ${g}.rgba.g, ao = ${g}.rgba.b;

    // key light: a shaft from the surface, far above
    float ndl = dot(n, normalize(vec3(0.3, 0.9, 0.35)));
    float l = 0.17 + 0.83 * clamp(ndl * 0.72 + 0.28, 0.0, 1.0);
    l *= mix(0.35, 1.0, ao);
    l += (det - 0.5) * 0.42;
    l += 0.05 * max(n.y, 0.0) * sin(p.x * 9.0 + ${i.t} * 1.3 + 2.0 * sin(p.z * 7.0 - ${i.t} * 0.8));

    // warm point light from the lure
    vec3 lv = ${i.lure} - p;
    float ld = length(lv);
    float lw = (max(dot(n, lv / ld), 0.0) * 0.85 + 0.1) / (1.0 + ld * ld * 30.0);
    lw *= 0.9 + 0.1 * sin(${i.t} * 5.0);

    float fogk = smoothstep(${i.fog}.x, ${i.fog}.y, length(p - ${i.cam}));
    vec3 col;
    if (m == 0) col = ps_teal(l * 0.8);
    else if (m == 1) col = ps_teal(l * 0.5 + 0.48);
    else if (m == 2) { col = ps_warm(0.84 + 0.16 * sin(${i.t} * 3.0)); lw = 0.0; fogk = 0.0; }
    else if (m == 3) col = ps_warm(l * 0.36);
    else if (m == 4) { col = det < 0.5 ? ps_teal(0.0) : ps_teal(0.97); lw *= 0.3; }
    else if (m == 5) { col = ps_teal(l * 0.62); lw *= 1.6; }
    else if (m == 6) col = ps_teal(l * 0.6 + 0.04);
    else { col = ps_warm(0.62 + 0.12 * sin(${i.t} * 2.0 + p.x * 20.0)); lw = 0.0; }
    col += vec3(1.0, 0.6, 0.28) * lw * 1.1;
    col = mix(col, ps_teal(0.0), 0.7 * fogk);
    float alpha = 1.0;
    if (m == 5) alpha = (1.0 - smoothstep(0.62, 1.02, length(p.xz))) * smoothstep(-0.34, -0.16, p.y);
    ${g}.rgba = vec4(col, alpha);
  }`);

const kelpSwayFx = () =>
  fx((i, g) => `{
    vec3 p = ${g}.center;
    float k = max(p.y + 0.1, 0.0);
    p.x += k * k * 0.16 * sin(${i.t} * 0.9 + p.z * 3.0 + p.x * 2.0);
    p.z += k * k * 0.12 * cos(${i.t} * 0.7 + p.x * 3.0);
    ${g}.center = p;
  }`);

const snowFx = () =>
  fx((i, g) => `{
    float id = float(${g}.index);
    vec3 r = ps_hash31(id + 2.0);
    vec3 p = ${g}.center;
    p.y = mod(p.y - ${i.t} * 0.025 * (0.4 + r.x) + 0.3, 2.0) - 0.3;
    p.x += 0.05 * sin(${i.t} * 0.4 + r.y * 40.0);
    p.z += 0.05 * cos(${i.t} * 0.35 + r.z * 40.0);
    ${g}.rgba.a *= smoothstep(-0.3, 0.0, p.y) * (1.0 - smoothstep(1.4, 1.7, p.y)) * (0.4 + 0.6 * r.z);
    ${g}.center = p;
  }`);

const bubbleFx = () =>
  fx((i, g) => `{
    float id = float(${g}.index);
    vec3 r = ps_hash31(id + 5.0);
    float c = fract(${i.t} * 0.1 * (0.6 + r.x) + r.y);
    vec3 p = ${g}.center;
    p.y += c * 1.5;
    p.x += 0.035 * sin(c * 22.0 + r.z * 50.0) * c;
    p.z += 0.035 * cos(c * 17.0 + r.x * 50.0) * c;
    ${g}.scales *= 0.6 + c;
    ${g}.rgba.a *= smoothstep(0.0, 0.04, c) * (1.0 - smoothstep(0.75, 1.0, c));
    ${g}.center = p;
  }`);

const shaftFx = () =>
  fx((i, g) => `{
    float id = float(${g}.index);
    ${g}.rgba.a *= 0.55 + 0.45 * sin(${i.t} * 0.45 + id * 2.1);
    ${g}.center.x += 0.06 * sin(${i.t} * 0.2 + id);
  }`);

// ---------------------------------------------------------------- build
const Z = new THREE.Vector3(0, 0, 1);
function surfelMesh(def) {
  const c = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), col = new THREE.Color();
  const h = def.h || H;
  const sc = new THREE.Vector3(0.62 * h, 0.62 * h, 0.3 * h);
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      for (let i = 0; i < def.count; i++) {
        c.fromArray(def.p, i * 3);
        q.setFromUnitVectors(Z, n.fromArray(def.n, i * 3).normalize());
        col.setRGB(def.attr[i * 3] / 8, def.attr[i * 3 + 1], def.attr[i * 3 + 2]);
        splats.pushSplat(c, sc, q, 1, col);
      }
    },
  });
  mesh.worldModifier = shadeFx();
  return mesh;
}

function particleMesh(build, modifier) {
  const mesh = new SplatMesh({ constructSplats: build });
  mesh.objectModifier = modifier;
  mesh.updateGenerator();
  return mesh;
}

const bones = {};
const meshes = [];
let lureGlow;
function build() {
  const defs = buildAngler();
  let total = 0;
  for (const d of defs) {
    const group = new THREE.Group();
    group.position.fromArray(d.pos);
    (d.parent ? bones[d.parent] : scene).add(group);
    bones[d.name] = group;
    const mesh = surfelMesh(d);
    if (d.name === "kelp") mesh.objectModifier = kelpSwayFx();
    mesh.updateGenerator();
    group.add(mesh);
    meshes.push(mesh);
    total += d.count;
  }

  const rnd = mulberry32(4);
  const q = new THREE.Quaternion(), c = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const teal = (k) => col.setRGB(...hexToRgb(TEAL[k]));
  // marine snow
  meshes.push(particleMesh((sp) => {
    for (let i = 0; i < 170; i++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 1.5;
      c.set(Math.cos(a) * r, -0.3 + rnd() * 2, Math.sin(a) * r);
      teal(5 + Math.floor(rnd() * 3));
      sp.pushSplat(c, s.setScalar(H * (0.2 + rnd() * 0.12)), q, 0.9, col);
    }
  }, snowFx()));
  // bubbles from the vent chimneys
  meshes.push(particleMesh((sp) => {
    for (const [x, y, z] of [[-0.6, 0.42, -0.3], [0.68, 0.3, 0.36], [-0.48, 0.26, -0.46]])
      for (let i = 0; i < 9; i++) {
        c.set(x, y, z);
        teal(7 + Math.floor(rnd() * 2));
        sp.pushSplat(c, s.setScalar(H * (0.28 + rnd() * 0.2)), q, 0.95, col);
      }
  }, bubbleFx()));
  // light shafts from above: huge, faint, stretched splats
  meshes.push(particleMesh((sp) => {
    for (let i = 0; i < 7; i++) {
      c.set(-0.7 + i * 0.24 + rnd() * 0.1, 0.9, -0.35 + rnd() * 0.7);
      q.setFromEuler(new THREE.Euler(0, 0, -0.32));
      teal(6);
      sp.pushSplat(c, s.set(0.05 + rnd() * 0.05, 0.75, 0.05 + rnd() * 0.05), q, 0.07 + rnd() * 0.05, col);
    }
  }, shaftFx()));
  // soft halo that follows the lure
  lureGlow = new SplatMesh({
    constructSplats: (sp) => {
      col.setRGB(...hexToRgb(WARM[3]));
      sp.pushSplat(c.set(0, 0, 0), s.setScalar(0.038), new THREE.Quaternion(), 0.38, col);
    },
  });
  for (const m of meshes.slice(-3)) scene.add(m);
  scene.add(lureGlow);
  meshes.push(lureGlow);
  return total;
}

// ---------------------------------------------------------------- sizing/UI
function resize() {
  const { w, h } = viewportSize();
  renderer.setSize(w, h);
  const px = state.pixel || defaultPixel();
  state.pixelUsed = px;
  const lw = Math.max(1, Math.round(w / px)), lh = Math.max(1, Math.round(h / px));
  rt.setSize(lw * state.ss, lh * state.ss);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSizes(lw, lh, px * dpr, state.ss);
}
window.addEventListener("resize", resize);

// ---------------------------------------------------------------- loop
const lureLocal = new THREE.Vector3(0, 0.14, 0), tmp = new THREE.Vector3();
function step(t) {
  uTime.value = t;
  poseAngler(bones, t);
  scene.updateMatrixWorld(true);
  bones.bulb.localToWorld(tmp.copy(lureLocal));
  uLure.value.copy(tmp);
  lureGlow.position.copy(tmp);

  if (state.idle) {
    const a = t * 0.2 + 0.5;
    const d = 4.7 * portraitFit(camera.aspect) * (1 - 0.2 * Math.sin(t * 0.13));
    camera.position.set(Math.sin(a) * d, TARGET.y + d * (0.2 + 0.1 * Math.sin(t * 0.17)), Math.cos(a) * d);
    camera.lookAt(TARGET);
  } else controls.update();
  uCam.value.copy(camera.position);
  const cd = camera.position.distanceTo(TARGET);
  uFog.value.set(cd - 0.2, cd + 1.5);

  for (const m of meshes) m.updateVersion();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.render(renderer, rt.texture, state.quant, state.dither);
}

const clock = new THREE.Timer();
function frame() {
  clock.update();
  step(clock.getElapsed());
  requestAnimationFrame(frame);
}

const capture = params.has("capture");
resize();
const loaded = showLoading("building anglerfish…");
await new Promise((r) => setTimeout(r, 30));
const total = build();
loaded();
const common = commonControls({ state, post, spark, resize, canvas: renderer.domElement });
hud = createHud({ current: "angler", controls: [...common.look, ...common.view, common.record] });
hud.count?.(total);
window.viewer = {
  state,
  renderAt: async (t) => { step(t); await new Promise((r) => setTimeout(r, 30)); step(t); },
};
if (!capture) requestAnimationFrame(frame);
