# POLE — 3D Pole Dancer Simulator

A real-time 3D club scene built with [Three.js](https://threejs.org/), [Vite](https://vite.dev/) and TypeScript. An 18+ age gate guards the experience.

- **Scene** (`src/club.ts`): chrome dance pole on a round podium, neon nightclub with moving pink/cyan spotlights, fog, light beams, LED ring and audience silhouettes
- **Dancer** (`src/dancer.ts`): rigged FBX character (`assets/Jill_FBX.fbx` — "Jill" by MasterPuppet, free) driven by a pose/dance state machine (`src/pose.ts`, `src/dance.ts`)
- **Gameplay** (`src/tips.ts`): earn tips, unlock four outfits (Rose, Crimson, Midnight, Gold)
- **Audio** (`src/audio.ts`): Web Audio engine for ambient club sound

## Run it

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # type-checks with tsc and outputs to dist/
```
