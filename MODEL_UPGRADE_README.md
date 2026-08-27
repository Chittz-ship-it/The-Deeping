# The Deeping v1.63 — Distinct Blender silhouettes and Cabinet Runway II

v1.63 uses authored Blender `.glb` models when they exist, chooses among three
separately constructed silhouettes for every model family, and automatically falls back to the
procedural renderer if none can load. Saves contain item/enemy identity, not
mesh data, so this is completely save-compatible.

## Put these files into GitHub

| Delivered file | Destination in the Vite repository |
| --- | --- |
| `App-v1.63.jsx` | `src/App.jsx` |
| `BlenderModelViewer.jsx` | `src/BlenderModelViewer.jsx` |
| `tools/blender/build_deeping_assets.py` | same path |
| `.github/workflows/build-3d-assets.yml` | same path |
| `package.json` | repository root |

Then run in the repository root:

```bash
npm install
git add src/App.jsx src/BlenderModelViewer.jsx package.json package-lock.json tools/blender .github/workflows
git commit -m "The Deeping v1.63 silhouettes and Cabinet Runway II"
git push
```

`storageShim.js` remains beside `App.jsx`, exactly as before.

## Generate the included model library

The workflow avoids requiring Blender on your own computer:

1. Open the repository's **Actions** tab.
2. Select **Build Deeping 3D assets**.
3. Choose **Run workflow**.
4. Leave **Commit generated GLBs** enabled.

The workflow installs Blender, generates **135 binary models** under
`public/models/` (45 families with base, `_v2`, and `_v3` variants), validates
the 57 gear, 54 enemy and 24 pet files, then commits them. Unlike v1.62, `_v2`
and `_v3` are not a base mesh with generic spikes or rings: each family is
rebuilt around a different silhouette (for example sword/sabre/greatsword,
wolf/boar, shark/angler and sallet/barbute). If branch
protection blocks that commit, download the `deeping-models` workflow artifact,
unzip its `models` folder into `public/models`, commit, and push.

For automatic commits, GitHub may require:
**Settings → Actions → General → Workflow permissions → Read and write**.

Local alternative:

```bash
blender -b --python tools/blender/build_deeping_assets.py -- --output public/models
```

## Runtime conventions

The game deterministically selects one of three models per family and tries the
others if the selected file is unavailable:

- `public/models/gear/sword.glb`, `sword_v2.glb`, `sword_v3.glb`, etc.
- `public/models/enemies/bat.glb`, `bat_v2.glb`, `bat_v3.glb`, etc.
- `public/models/pets/wisp.glb`, `wisp_v2.glb`, `wisp_v3.glb`, etc.

Mesh or material names determine procedural recolouring:

- `PRIMARY`: the first named colour or rarity metal.
- `SECONDARY`: the second named colour, leather, fur shadow or under-layer.
- `ACCENT`: the third named colour, gems, trim and armour edges.
- `EMISSIVE`: elemental runes, eyes and magical cores.

Ghostly applies transparent physical transmission to every role. Bi-colour and
tri-colour equipment keep discrete material zones; the renderer never washes a
single tint over the whole model.

## Replacing a generated template with hand-authored Blender art

The generated library is a clean, bevelled PBR baseline—not a ceiling. An
artist can replace any GLB without touching React:

1. Model at the world origin, standing upright, with a sensible central pivot.
2. Use the four role names above on objects or materials.
3. Apply transforms and triangulate before export.
4. Target roughly 8k–30k triangles per template because up to three enemies
   can appear simultaneously on a phone.
5. Export **glTF Binary (`.glb`)**, with materials and textures embedded.
6. Overwrite the matching file in `public/models` and push.

The reference spirit sword is best represented by editing `sword.glb`: keep the
faceted blade and winged guard, add sculpted bevels and a controlled emissive
fuller, then retain the material-role names so every generated colour and
element continues to work.

## v1.63 gameplay included

- Tattered Maps migrate into run-bound Chests. Chests always roll rare-or-better
  equipment and Paydirt gives each one a 5% Relic chance.
- The four original collections now continue through seven new full-set gates:
  Paydirt (Coins), Uno Reverso (Cards), TLDR2 (Stamps), pet slots 2/3/4 and
  Smarter Merchants (Figures). Infinite collection exchange only begins after
  those authored milestones.
- The Wandering Trader can sell missing collectibles after Uno Reverso.
- TLDR2 marks only shop gear that is strictly stronger than the weakest legal
  equipped comparison.
- Smarter Merchants add a guaranteed skill-book offer plus a 5% Chest offer.
- Active pet traits stack cleanly across all unlocked slots.
- Four additional full-set gates extend the authored chain again: Compound
  Interest (Coins XIII), Cabinet Reversal (Cards XI), element-aware TLDR3
  (Stamps XII), and Pet Foraging (Figures XVI). Only after those gates do the
  uncapped cabinet laps begin.
- The model badge names the GLB actually loaded, so a missing `_v2` or `_v3`
  can no longer masquerade as a successful variant load.
- Legacy saves migrate automatically, including Maps to Chests and the old
  single active-pet field to the new active-pet array.
