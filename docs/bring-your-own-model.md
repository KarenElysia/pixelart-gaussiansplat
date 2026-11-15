# Bring your own model

Any glTF or GLB file can be converted: a photogrammetry scan, a sculpt, a model from a generator, a game character.

## Convert

```bash
npm run convert path/to/model.glb mymodel
```

This writes `public/models/mymodel.psf` and adds the model to the panel. Open `/?m=mymodel`.

| Option | Default | Meaning |
|---|---|---|
| `--count` | 110000 | roughly how many splats |
| `--tex` | 128 | textures are shrunk to this size before sampling |

Both defaults are low on purpose. At a pixel size of 5 a model covers about 150 pixels of height, so more splats or sharper textures only add noise: neighbouring pixels pick up different texels and the surface looks sandy. Raise `--count` for large scenes such as rooms.

What the converter reads: base colour (texture and factor), vertex colours, emissive, double-sided, alpha cutoff. It skips glass. It does not read normal maps or metalness; lighting comes from the mesh normals.

## Animated models

If the file has a skeleton, the converter also writes `mymodel.rig.glb`: the skeleton and its animation clips, with meshes and textures removed. The viewer plays the clip named `walk` if there is one, and lists all clips in the panel. Keys 1 to 9 switch between them.

Limits:

- at most 256 joints,
- four weights per splat,
- bones should not be scaled during animation (dual-quaternion skinning has no scale),
- morph targets are ignored.

## Give it an island

```bash
npm run island mymodel ruins
```

Themes: `ruins`, `desert`, `swamp`, `crag`, `dais`.

The tool plays every clip of the model first. It measures how far the model reaches in each direction and where its feet land, then builds the island around that: flat where it stands, props where it does not reach. It takes 10 to 25 seconds.

The viewer loads `mymodel.dio` when it exists. Add `&island=0` to the address to hide it.

## Options in the address

| Option | Meaning |
|---|---|
| `light=1.3` | brightness, for dark textures |
| `colors=24` | palette size |
| `bands=5` | number of flat light steps; `0` for smooth shading |
| `anim=run` | clip to start with |
| `px=4`, `dither=0.5` | pixel size, dither strength |

To make an option permanent for a model, add it to the model's entry in `public/models/models.json`:

```json
{ "name": "mymodel", "label": "My model", "count": 148000, "query": "light=1.3" }
```

## Recording

The `record` button in the panel saves a video of the canvas. For a frame-exact capture, open the page with `&capture=1`: the clock stops, and `window.viewer.renderAt(seconds)` draws any moment you ask for. Use an even pixel size (4 or 6) for video; odd sizes blur at the edges once compressed.
