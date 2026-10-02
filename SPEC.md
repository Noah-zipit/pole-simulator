# POLE SIMULATOR — build spec (working title; Ashar renames later)

3D pole dancer simulator. Three.js + Vite + TypeScript, zero runtime deps
beyond three.

## Character
- `assets/Jill_FBX.fbx` — "Jill" from MasterPuppet's Jack & Jill (itch.io, free).
  Rigged anime adult female: skeleton (LimbNodes), skinned meshes, embedded
  textures, genital bones, facial shape keys, separate clothing meshes.
- Load with three's FBXLoader. Verify: skeleton found, meshes bound, textures
  resolve. If textures are missing, build PBR-ish fallback materials from the
  material colors.
- Credit MasterPuppet in the credits screen.

## Scene
- Chrome dance pole (reflective metal material) center of a round podium.
- Neon nightclub: dark room, pink/cyan moving spotlights, haze (fog), light
  beams (cones), LED strip ring around podium, dim audience silhouettes.
- ACES tone mapping, shadows, 60fps target.

## Animation (procedural, bone-level — the FBX ships no dance clips)
Drive Jill's bones each frame with a dance state machine:
- IDLE: weight shifting, hair sway, breathing.
- SPIN: body orbits the pole, one hand grips, legs extended (classic spin).
- CLIMB: rises up the pole, legs hook.
- INVERT: upside-down split on the pole.
- FLOOR: body waves/rolls on the podium near the pole.
- TRANSITIONS: smooth blends between states (lerp bone quaternions over ~0.6s).
- FACE: subtle smile shape key during performance; look-at-camera occasionally.
All moves loop cleanly. Dance auto-plays; player can trigger specific moves
with buttons.

## Strip mechanics
- Jill's clothing = separate meshes. Identify them by mesh name/material
  (inspect the FBX node names) and map to layers, e.g.:
  Layer 0: jacket/accessories, Layer 1: top, Layer 2: bottoms/skirt,
  Layer 3: underwear. Nude body mesh underneath (stylized, no explicit
  genital detail beyond what the model ships — keep the model's own finish).
- Strip is EARNED: tip thresholds unlock each removal. "She decides" pacing:
  at $25 she drops the jacket, $60 the top, $120 the bottoms, $200 everything.
  Removal plays a short tease animation (turn, glance at camera) then the mesh
  hides with a sparkle burst.
- Outfits: 2 unlockable recolors (e.g., "Crimson", "Midnight") purchasable
  with lifetime tips; changes clothing material colors.

## Tip economy (the game loop)
- Buttons: Throw $1 / $5 / $20, plus "Make it rain" ($50, bill particle storm).
- Clicking/tapping the stage also throws $1 at that spot (arc animation).
- Tip balance + lifetime tips in HUD. Every tip triggers her reaction
  (blow kiss, wink, hip sway burst) and adds to the strip meter.
- Dollar bills: instanced quads fluttering down, landing on podium, fading.

## Camera & controls
- Drag to orbit, wheel/pinch to zoom, right-drag pan (desktop).
- Preset buttons: Front / Side / Top / Close-up.
- Auto-cam toggle: slow cinematic orbit during performances.

## Screens & UI
- 18+ gate (remembered).
- Main: stage + HUD (tips, strip meter, move buttons, camera presets, mute).
- Wardrobe panel (outfits), Credits (MasterPuppet + tech).
- Mute + WebAudio synthwave loop + SFX (coin, crowd cheer at strip).

## Performance
- Pixel ratio capped at 2 (1.5 on small screens), no fps governor needed
  (single character scene).

## Verification (must pass)
- `tsc --noEmit` clean, `vite build` clean.
- FBX loads: assert skeleton bone count > 20, skinned meshes bound, no
  exceptions. List mesh names -> identify clothing layers; fail loudly if no
  separable clothing meshes are found (then propose fallback in the report).
- Headless animation smoke: step the dance state machine 600 frames for each
  move, assert no NaNs in bone quaternions/positions, no exceptions.
- Attempt a real render check: try `npm i -D gl` (headless-gl) and render one
  frame of Jill on the pole to PNG; inspect it (does a humanoid render? is it
  upright?). If headless-gl fails on this VM, say so plainly in the report —
  do NOT claim visual verification you did not do.
- Serve `vite preview` and curl the page: title + bundle 200.

## Deliverable
Commit + push to Noah-zipit/pole-simulator as Noah-zipit <noahext994@gmail.com>.
Report: verification results, clothing-layer mapping, and an honest note on
how the model looks (good enough? anything off?).
Do NOT deploy — the parent handles hosting (Vercel scope is down; GitHub
Pages is the fallback).
