#!/usr/bin/env node
// Build a scene from src/authoring/scenes/ into public/models/<name>.dio.
//   node tools/build-scene.mjs <name>      or   all

import fs from "node:fs";
import { SCENES } from "../src/authoring/scenes/index.js";
import { bake } from "../src/authoring/island.js";
import { makeLighting } from "../src/authoring/light.js";
import { KIND } from "../src/authoring/scene-kit.js";
import { mulberry32 } from "../src/noise.js";
import { writeWorld, addToManifest } from "./lib/files.mjs";

const arg = process.argv[2];
const names = arg === "all" ? Object.keys(SCENES) : [arg];
if (!arg || !names.every((n) => SCENES[n])) { console.error(`usage: build-scene.mjs <${Object.keys(SCENES).join(" | ")} | all>`); process.exit(1); }

for (const name of names) {
  const started = Date.now();
  let seed = 11;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; // same name, same scene
  const scene = SCENES[name].build(mulberry32(seed));
  // light is baked into every splat: shadows, lamps, colour ramps (light.js)
  const lighting = makeLighting(scene.c.s, scene.lights, scene.palette);
  const baked = bake(scene.c, scene, { h: 0.02, lighting, ...(scene.bottom !== undefined ? { bottom: scene.bottom } : {}) });
  // free splats: blades, leaflets, litter and flowers are lit as if facing up,
  // and blades and leaflets let light through
  for (const f of scene.free) {
    if (f[13] !== KIND.lit && f[13] !== KIND.sway) continue;
    const sway = f[13] === KIND.sway, k = sway ? 0.78 : 1; // blades sit in each other's shade
    const lit = lighting.shade([f[10] * k, f[11] * k, f[12] * k], f[0], f[1], f[2], 0, 1, 0, { leaf: sway });
    f[10] = lit[0]; f[11] = lit[1]; f[12] = lit[2];
  }
  writeWorld(name, baked, scene.free, {
    scene: true, baked: true,
    bottom: scene.bottom ?? baked.bottom,
    palette: scene.palette, glowPalette: scene.glowPalette || [], background: scene.background, light: scene.light, elev: scene.elev, dither: scene.dither,
  });
  addToManifest({ name, label: SCENES[name].label || name, count: baked.count + scene.free.length, scene: true });
  console.log(`${name}: ${baked.count} surfels + ${scene.free.length} free splats, ${scene.lights.length} lights, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
