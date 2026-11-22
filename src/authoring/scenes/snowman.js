// A snowman on a snowy island: three snowballs, a carrot nose, coal eyes,
// a scarf and a top hat, pine trees and a warm lantern for contrast.

import { sphere, ellipsoid, cone, cyl, box, displace } from "../sdf.js";
import { vnoise3 } from "../../noise.js";
import { makeCtx, island, rgb, mul, mix, sstep } from "../island.js";
import { makeFree } from "../scene-kit.js";

export const label = "Snowman";

export function build(rnd) {
  // Island radius 1.4, flat within 0.55 of the centre so the snowman stands firm.
  const c = makeCtx(1.4, 0.55, () => 0.9, rnd), { s } = c, free = makeFree(c);

  const M = { snow: 0, rock: 1, body: 2, coal: 3, carrot: 4, scarf: 5, hat: 6, trunk: 7, pine: 8, post: 9, lamp: 10 };
  island(c, M.snow, M.rock, { bump: 0.02 });

  const rough = (amt, f) => (px, py, pz) => -amt * (vnoise3(px * f, py * f, pz * f) - 0.5);

  // --- The snowman (faces +z) ---
  s.add(displace(ellipsoid(0, 0.30, 0, 0.44, 0.38, 0.44), rough(0.05, 7)), M.body, 0.06); // bottom
  s.add(displace(ellipsoid(0, 0.82, 0, 0.31, 0.29, 0.31), rough(0.04, 8)), M.body, 0.06); // middle
  s.add(displace(ellipsoid(0, 1.22, 0, 0.225, 0.215, 0.225), rough(0.03, 9)), M.body, 0.05); // head

  // Carrot nose, coal eyes, smile and buttons.
  s.add(cone([0, 1.24, 0.19], [0, 1.21, 0.46], 0.034, 0.004), M.carrot);
  s.add(sphere(-0.082, 1.31, 0.185, 0.026), M.coal);
  s.add(sphere(0.082, 1.31, 0.185, 0.026), M.coal);
  for (const [x, y] of [[-0.09, 1.13], [-0.045, 1.095], [0, 1.085], [0.045, 1.095], [0.09, 1.13]])
    s.add(sphere(x, y, 0.20, 0.014), M.coal);
  s.add(sphere(0, 0.90, 0.295, 0.028), M.coal);
  s.add(sphere(0, 0.72, 0.315, 0.028), M.coal);
  s.add(sphere(0, 0.38, 0.425, 0.03), M.coal);

  // Twig arms with little fingers.
  s.add(cone([0.27, 0.92, 0], [0.64, 1.14, 0.02], 0.020, 0.008), M.trunk);
  s.add(cone([0.58, 1.09, 0.02], [0.70, 1.22, 0.10], 0.010, 0.004), M.trunk);
  s.add(cone([-0.27, 0.92, 0], [-0.64, 1.14, -0.02], 0.020, 0.008), M.trunk);
  s.add(cone([-0.58, 1.09, -0.02], [-0.70, 1.22, -0.10], 0.010, 0.004), M.trunk);

  // Scarf: a ring around the neck and a tail hanging down the front.
  s.add(cyl(0, 1.045, 0, 0.245, 0.05, 0.02), M.scarf);
  s.add(box(0.13, 0.86, 0.245, 0.05, 0.115, 0.028, 0.01), M.scarf);

  // Top hat, tipped very slightly by making the brim follow the head.
  s.add(cyl(0, 1.435, 0, 0.205, 0.018, 0.008), M.hat);
  s.add(cyl(0, 1.545, 0, 0.125, 0.095, 0.012), M.hat);
  s.add(cyl(0, 1.465, 0, 0.128, 0.022, 0.006), M.scarf); // hat band in scarf red
  c.grow(1.68);

  // --- Pine trees around the back and sides ---
  const tree = (x, z, h) => {
    s.bound(x, h / 2, z, 0.6);
    s.add(cone([x, -0.03, z], [x, h * 0.35, z], 0.035, 0.025), M.trunk);
    s.add(cone([x, h * 0.18, z], [x, h * 0.62, z], 0.30 * h / 1.1, 0.16 * h / 1.1), M.pine, 0.03);
    s.add(cone([x, h * 0.42, z], [x, h * 0.85, z], 0.22 * h / 1.1, 0.10 * h / 1.1), M.pine, 0.03);
    s.add(cone([x, h * 0.66, z], [x, h * 1.02, z], 0.14 * h / 1.1, 0.015), M.pine, 0.03);
    s.bound();
  };
  tree(-0.88, -0.55, 1.15);
  tree(0.92, -0.62, 0.95);
  tree(-0.62, -0.95, 0.8);
  tree(1.02, 0.18, 0.7);

  // --- A lantern for a warm accent, like the starter scene ---
  s.add(cone([0.78, -0.03, 0.52], [0.78, 0.42, 0.52], 0.02, 0.014), M.post);
  s.add(box(0.78, 0.48, 0.52, 0.045, 0.055, 0.045, 0.01), M.lamp);
  const lights = [{ pos: [0.78, 0.48, 0.52], color: [1.0, 0.72, 0.32], power: 1.0 }];
  free.glow(0.78, 0.48, 0.52, 0.17, rgb("#ffcf5a"));

  // Snow sparkles on the ground instead of grass and flowers.
  free.dots(60, () => true, { colors: [rgb("#ffffff"), rgb("#aebfe0")], r: 1.35, y: [0.02, 0.07] });

  const paint = (m, x, y, z, n) => {
    if (m === M.lamp) return { c: rgb("#ffcf5a"), emissive: true };
    if (m === M.post || m === M.hat) return { c: rgb("#262640") };
    if (m === M.coal) return { c: rgb("#17171f") };
    if (m === M.carrot) return { c: mul(rgb("#ff8a3c"), 0.85 + 0.3 * vnoise3(x * 20, y * 40, z * 20)) };
    if (m === M.scarf) return { c: rgb("#c8372d") };
    if (m === M.trunk) return { c: mul(rgb("#4a2a26"), 0.85 + 0.3 * vnoise3(x * 30, y * 5, z * 30)) };
    if (m === M.pine) {
      if (n[1] > 0.55) return { c: rgb("#dfe9fa") }; // snow dusting on upward faces
      return { c: vnoise3(x * 10, y * 10, z * 10) > 0.5 ? rgb("#35704c") : rgb("#1f4a38"), leaf: true };
    }
    if (m === M.rock) return { c: mul(rgb("#7d90b8"), 0.8 + 0.4 * vnoise3(x * 8, y * 10, z * 8)) };
    // Snow: ground and body alike, white with a cool blue shade in the noise.
    return { c: mix(rgb("#dfe9fa"), rgb("#ffffff"), sstep(0.35, 0.75, vnoise3(x * 5, y * 5, z * 5))) };
  };

  return {
    c, paint, lights, free: free.list,
    palette: ["#0b1026", "#2b3350", "#4c5878", "#7d90b8", "#aebfe0", "#dfe9fa", "#ffffff", "#17171f", "#4a2a26", "#c8372d", "#8f2420", "#ff8a3c", "#e07b2a", "#1f4a38", "#35704c", "#ffcf5a"],
    glowPalette: ["#4e3f3a", "#8a7356"],
    background: "#0b1026",
    particles: [{ mode: "float", n: 90, colors: ["#ffffff", "#dfe9fa"], center: [0, 0.7, 0], spread: [1.3, 0.9, 1.3] }],
  };
}
