#!/usr/bin/env node
// Build a scene from src/authoring/scenes/ into public/models/<name>.dio.
//   node tools/build-scene.mjs <name>      or   all

import fs from "node:fs";
import { SCENES } from "../src/authoring/scenes/index.js";
import { bake } from "../src/authoring/island.js";
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
  const baked = bake(scene.c, scene, { h: 0.02, ...(scene.bottom !== undefined ? { bottom: scene.bottom } : {}) });
  writeWorld(name, baked, scene.free, {
    scene: true,
    bottom: scene.bottom ?? baked.bottom,
    palette: scene.palette, background: scene.background, light: scene.light, elev: scene.elev, dither: scene.dither,
  });
  addToManifest({ name, label: SCENES[name].label || name, count: baked.count + scene.free.length, scene: true });
  console.log(`${name}: ${baked.count} surfels + ${scene.free.length} free splats, ${scene.lights.length} lights, ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
