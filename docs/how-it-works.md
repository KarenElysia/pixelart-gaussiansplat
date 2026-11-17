# How it works

Each section names the file that does the work. They are all short.

## 1. Splats as surfels

A Gaussian splat has a position, a size along three axes, a rotation and a colour. Here every splat is a **surfel**: wide in two directions, thin in the third, lying flat on a surface.

- The thin axis is the surface normal. No extra storage is needed: the normal is read back from the splat's rotation.
- Splats sit on a regular spacing `h` and are `0.66 h` wide, so neighbours overlap and the surface has no holes.

Where they come from:

- **Scenes** are built from signed-distance shapes, and the sampler in [`src/authoring/sdf.js`](../src/authoring/sdf.js) walks a grid, keeps the cells the surface passes through and nudges each point onto the surface.
- **Models** are triangle meshes, and [`tools/convert-model.mjs`](../tools/convert-model.mjs) scatters points over the triangles and reads the texture colour at each one.

## 2. Lighting each splat

### Scenes: baked

[`src/authoring/light.js`](../src/authoring/light.js), called from [`tools/build-scene.mjs`](../tools/build-scene.mjs)

A scene never moves, so the build works out each splat's light once and stores the final palette colour. Per splat:

1. **Sun.** Diffuse light from the key direction, times a soft shadow: a ray marched towards the sun through the scene's distance field, darker the closer it passes to something.
2. **Sky.** More light on surfaces facing up, less facing down, scaled by the occlusion the sampler measured.
3. **Leaves** (`leaf: true` from `paint`, and every swaying blade or leaflet) are lit from both sides and only half shadowed, so a canopy glows instead of turning into a dark ball.
4. **Lamps.** Fires and lanterns light what they can see (another marched ray), and their warm light may pull a colour into their own hue: orange on stone.
5. **Colour ramps.** The lit colour is matched to the palette in OKLab, with a penalty for leaving the surface's own hue. A shaded orange becomes a darker orange or a red, never a green that happens to be close. Shadows lean cool and light warm before matching. Grey and white surfaces have no hue to keep, so they shade into the palette's cool greys; very dark tones may go navy.

In the viewer only a little live lamp light (the flicker) and fog are added on top.

### Models: every frame

[`src/render/shade.js`](../src/render/shade.js)

Spark lets you attach a small shader, a *modifier*, that runs for every splat before it is drawn. The lighting modifier:

1. reads the normal from the splat's rotation,
2. adds ambient light, one directional light and up to four point lights (fires, lanterns),
3. fades distant splats towards the background,
4. writes the lit colour back.

Because the normal travels with the splat, lighting stays right when a skeleton bends the model.

A few flags (emissive, two-sided) are packed into the opacity channel. Hard-edged splats are fully opaque, so the channel is otherwise unused.

## 3. The pixel pass

[`src/render/post.js`](../src/render/post.js), and `applyCrisp` in [`src/render/hud.js`](../src/render/hud.js)

![Four stages](images/pipeline.png)

**Low resolution, supersampled.** With a pixel size of 4, a 1600×900 window has 400×225 art pixels, and the splats are drawn at twice that (800×450), so each art pixel has four samples. A full-screen pass turns each 2×2 block into one art pixel and draws it as a square with nearest sampling. The grid belongs to the screen, not the scene: zooming changes what is in each pixel, never how big a pixel is. `&ss=0` draws one sample per pixel.

**Hard splats.** Normally a splat fades out towards its edge and blends with what is behind it. That blending is what makes splats look soft, and after palette snapping it reads as noise. So the falloff is switched off (`falloff: 0`) and each splat is a solid disc.

**Coverage.** A sample is solid when an opaque splat covers it. An art pixel with at least two solid samples out of four is the object; otherwise it is background.

**Palette by vote.** Each solid sample snaps to its nearest palette colour, and the pixel takes the colour most of them chose. A pixel on the border of two materials gets one of them, never their average snapped to some third colour. Solid pixels never take the background colour.

**Outlines.** A solid pixel with the background on one to three sides takes an "ink" of its own colour: darker, but lifted to a minimum brightness so it still shows against a near-black background. Isolated dots (embers) keep their colour. `&outline=0` turns it off.

**Translucent light.** Halos, smoke, the lighthouse beam and sun shafts are blended over the background, and the blend is matched to the palette in OKLab while keeping the light's hue, so a faint gold beam becomes a muted gold band rather than a grey that happens to be close. Below about 30% opacity it is left out. A scene can list `glowPalette` colours that only this light may use, so muted beam colours never leak onto surfaces.

**Dithering.** Off by default. Above 0, the pass averages the samples, finds the *two* nearest palette colours, and picks one or the other with a 4×4 Bayer pattern in proportion to where the colour sits between them.

## 4. Scenes

[`src/authoring/`](../src/authoring), built by [`tools/build-scene.mjs`](../tools/build-scene.mjs)

A scene has three kinds of content.

- **Surfels from shapes.** The island, buildings and trees are signed-distance shapes (spheres, boxes, cones, combinations of them). Each has a material number, and a `paint` function turns material, position and normal into a colour: stripes on a tent, joints between flagstones, moss on anything facing up.
- **Free splats.** Some things are easier to place one splat at a time. A grass blade is a single splat stretched along the blade. A fallen leaf is one flattened splat. A glow is three nested translucent splats, which the alpha test turns into a halo of dots.
- **Sun shafts.** `shafts()` in [`scene-kit.js`](../src/authoring/scene-kit.js) lays rows of long, faint splats along the sun's direction, scattered sideways so each beam has streaks. Where they overlap, they pass the pass's opacity threshold and show as thin bands (the shrine has four).
- **Particles.** Embers, fireflies, falling leaves, smoke. Each kind is a few lines of GLSL in [`src/render/particles.js`](../src/render/particles.js) that move a splat from its index and the time, so nothing is animated in JavaScript.

Building takes a few seconds, which is why scenes are baked to a file (`.dio`) instead of being built in the browser.

## 5. Rigged models

[`src/viewer/rig.js`](../src/viewer/rig.js)

The converter keeps four joint weights per splat and saves the skeleton and its clips to a small `.rig.glb`. In the browser three.js plays the clips, and each frame the bone poses are handed to Spark's dual-quaternion skinning, which moves every splat on the GPU and rotates it with the bone.

## 6. Islands for models

[`tools/build-island.mjs`](../tools/build-island.mjs), [`src/authoring/themes.js`](../src/authoring/themes.js)

Dropping a walking creature onto a decorated island raises two problems.

- **Limbs pass through props.** The tool plays every clip and records how far the creature reaches in each direction. Tall props go in the directions it reaches least, outside that reach.
- **Feet float or sink.** The middle of the island is flat. Each frame the viewer finds the height the pose stands at and moves the creature so that height meets the ground. It uses the 2nd percentile of splat heights, not the minimum, so a sword tip hanging below the feet does not lift the whole creature.

## Things that cost time

- **Colours came out dark.** Spark converts splat colours to linear space when it draws into a render target. The pixel pass converts back before matching the palette.
- **Skinned models collapsed.** `SplatSkinning.setBoneQuatPos` treats bones as if they rested at the origin. `rig.js` writes each bone's dual quaternion into the bone texture itself.
- **Video blurs odd pixel sizes.** Most video is stored with colour at half resolution. Record with an even pixel size (4 or 6) and edges stay sharp.
