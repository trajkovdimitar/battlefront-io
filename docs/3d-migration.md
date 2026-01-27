# Battlefront 3D Migration

## Overview

This document tracks the migration from Canvas 2D rendering to Babylon.js 3D rendering.

**Goal:** Same game, same mechanics, same maps - rendered in 3D.

**Approach:** Replace the rendering layer only. Game logic in `/src/core` remains untouched.

---

## Architecture Decisions

### Why Babylon.js over Three.js

- Built-in particle system (critical for explosions - 4 bomb types + SAM intercepts)
- GPU particles for late-game MIRV spam
- Game-focused API with built-in camera controls
- Visual particle editor available
- Trade-off: ~350kb larger bundle (acceptable given 58MB map data)

### What We're Replacing

```
CURRENT:
GameView → GameRenderer → 30+ Canvas 2D Layers → HTML Canvas

TARGET:
GameView → BabylonRenderer → 3D Scene Graph → WebGL Canvas
```

### What We're Keeping

- `/src/core/*` - All game logic untouched
- `/src/server/*` - Server untouched
- `EventBus` - Same pub/sub communication
- `GameView` - Same state interface
- UI Components - Keep as HTML overlay initially

---

## Current Rendering Architecture

### Layer System

The existing renderer uses a Layer interface:

```typescript
interface Layer {
  init?(): void;
  tick?(): void;
  renderLayer?(context: CanvasRenderingContext2D): void;
  shouldTransform?(): boolean;
}
```

30+ layers render in order:

1. TerrainLayer - Ground/water
2. TerritoryLayer - Player ownership colors
3. RailroadLayer - Train tracks
4. StructureLayer - Buildings
5. SAMRadiusLayer - Defense ranges
6. UnitLayer - Ships, missiles, trains
7. FxLayer - Explosions, effects
8. UILayer - Health bars, selection
9. ...UI layers (no transform)

### Key Files

| File                  | Purpose          | Migration Impact       |
| --------------------- | ---------------- | ---------------------- |
| `GameRenderer.ts`     | Main render loop | Replace entirely       |
| `TransformHandler.ts` | Camera/zoom      | Use Babylon camera     |
| `UnitLayer.ts`        | All mobile units | Port to 3D meshes      |
| `StructureLayer.ts`   | Buildings        | Port to 3D meshes      |
| `FxLayer.ts`          | Effects system   | Rebuild with particles |
| `TerritoryLayer.ts`   | Ownership viz    | Port to 3D terrain     |
| `SpriteLoader.ts`     | 2D sprites       | Replace with 3D models |

---

## 3D Renderer Design

### New File Structure

```
src/client/graphics3d/
├── BabylonRenderer.ts      # Main renderer, scene setup
├── CameraController.ts     # Camera movement, zoom
├── layers/
│   ├── Layer3D.ts          # Base interface
│   ├── TerrainLayer3D.ts   # Ground mesh with territory colors
│   ├── StructureLayer3D.ts # Building meshes
│   ├── UnitLayer3D.ts      # Ship/missile meshes
│   ├── RailLayer3D.ts      # Railroad visualization
│   ├── FxLayer3D.ts        # Particle effects
│   └── UILayer3D.ts        # 3D UI elements (optional)
├── models/
│   ├── ModelLoader.ts      # 3D model management
│   └── ProceduralModels.ts # Generated geometry
├── effects/
│   ├── ExplosionFx.ts      # Nuke/bomb explosions
│   ├── MissileFx.ts        # Launch trails, smoke
│   └── WakeFx.ts           # Ship water trails
└── utils/
    ├── CoordinateMapper.ts # 2D game coords → 3D world
    └── ColorUtils.ts       # Player color materials
```

### Layer3D Interface

```typescript
interface Layer3D {
  init(scene: Scene): void;
  tick(updates: GameUpdateViewData): void;
  dispose(): void;
}
```

### Coordinate System

```
Game coordinates (2D):     3D World:
  (0,0) top-left           Y = up
  x+ = right               X = game X
  y+ = down                Z = game Y (inverted)
```

Map game tiles to world units: 1 tile = 1 world unit (adjustable)

---

## Migration Milestones

### Milestone 1: Foundation (Target: Week 2) ✅

- [x] Babylon.js project setup
- [x] Basic scene with camera
- [x] Flat plane representing map bounds
- [x] Camera controls (pan, zoom, rotate)
- [x] Can switch between 2D/3D renderers

### Milestone 2: Terrain (Target: Week 4) ✅

- [x] Territory mesh generation from map data
- [x] Player ownership colors on mesh
- [x] Water vs land distinction
- [ ] Border rendering between territories

### Milestone 3: Structures (Target: Week 6)

- [ ] Building meshes (procedural or models)
- [ ] City, Port, Factory, Silo, SAM, DefensePost
- [ ] Construction state visualization
- [ ] Correct positioning on terrain

### Milestone 4: Units (Target: Week 8)

- [ ] Ship meshes (Warship, Transport, Trade)
- [ ] Train meshes with railroad tracks
- [ ] Unit movement/rotation
- [ ] Selection highlighting

### Milestone 5: Projectiles (Target: Week 10)

- [ ] Missile trajectory rendering
- [ ] AtomBomb, HydrogenBomb, MIRV, MIRVWarhead
- [ ] SAM intercept missiles
- [ ] Shell projectiles

### Milestone 6: Effects (Target: Week 14)

- [ ] Explosion particle systems (4 types)
- [ ] SAM intercept effects
- [ ] Ship wakes
- [ ] Smoke/fire for buildings
- [ ] Conquest animation

### Milestone 7: Polish (Target: Week 18)

- [ ] Performance optimization
- [ ] LOD system for distant objects
- [ ] Visual polish pass
- [ ] Edge case handling

---

## Technical Decisions Log

### 2025-01-27: Renderer Choice

**Decision:** Babylon.js over Three.js
**Reason:** Built-in particle system critical for explosion-heavy gameplay
**Trade-off:** Larger bundle size acceptable

### 2025-01-27: Visual Style

**Decision:** Realistic terrain with height maps
**Reason:** More immersive experience, mountains/valleys visible
**Implementation:** Generate heightmap from map data, apply to terrain mesh

### 2025-01-27: Asset Approach

**Decision:** Procedural geometry
**Reason:** Faster iteration, no external asset dependencies
**Implementation:** Generate all meshes in code (terrain, buildings, units)

### 2025-01-27: UI Approach

**Decision:** Keep UI as HTML overlay initially
**Reason:** Faster iteration, existing components work
**Future:** May port critical UI to 3D later

---

## Open Questions

1. **Map projection:** Flat plane or curved terrain with height?
2. **Asset pipeline:** Procedural geometry or authored 3D models?
3. **Shader complexity:** Basic materials or custom shaders for effects?
4. **Mobile support:** WebGL 1 compatibility needed?

---

## Progress Log

_Updates added as work progresses_

### Session 1: Initial Assessment

- Explored existing codebase
- Confirmed Canvas 2D architecture (not PixiJS)
- Documented layer system and state flow
- Created this design document

### Session 2: Foundation Implementation

- Installed Babylon.js dependencies
- Created BabylonRenderer with scene, lighting, render loop
- Implemented CameraController with RTS-style controls
- Created TerrainLayer3D with heightmap generation
- Added 2D/3D toggle in settings UI
- Modified ClientGameRunner to support both renderers

### Session 3: Coordinate Conversion & Performance

- Fixed shader loading (import default shaders as side effects for tree-shaking)
- Created TransformHandler3D for proper 3D coordinate conversion using ray picking
- Created ITransformHandler interface for 2D/3D type compatibility
- Implemented incremental territory color updates (only update changed tiles)
- Fixed Ray module import for createPickingRay functionality
- Mouse picking now works correctly in 3D mode

**Completed Milestones:**

- ✅ Milestone 1: Foundation (scene, camera, lighting, 2D/3D toggle)
- ✅ Milestone 2: Terrain (heightmap, territory colors, water, incremental updates)

**Next Steps:**

- Milestone 3: Structures (City, Port, Factory, Silo, SAM, DefensePost)
- Milestone 4: Units (Ships, Trains, movement/rotation)

**To test the 3D renderer:**

1. Run `npm run dev`
2. Go to Settings
3. Enable "3D Renderer (Experimental)"
4. Restart the game (refresh page)
5. Start a game to see the 3D terrain
