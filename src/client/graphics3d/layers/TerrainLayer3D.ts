import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import { GameUpdateViewData } from "../../../core/game/GameUpdates";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { Layer3D } from "./Layer3D";

/**
 * Configuration for terrain generation
 */
interface TerrainConfig {
  /** Height multiplier for terrain elevation */
  heightScale: number;
  /** Base height for water level */
  waterLevel: number;
  /** Smoothing passes for heightmap */
  smoothingPasses: number;
}

const DEFAULT_CONFIG: TerrainConfig = {
  heightScale: 10, // Max height of terrain
  waterLevel: -2, // Water sits below land
  smoothingPasses: 2,
};

/**
 * Renders the game terrain as a 3D mesh with realistic heightmap.
 * Converts 2D map data into a 3D terrain surface.
 */
export class TerrainLayer3D implements Layer3D {
  private scene: Scene | null = null;
  private terrainMesh: Mesh | null = null;
  private waterMesh: Mesh | null = null;
  private terrainMaterial: StandardMaterial | null = null;
  private waterMaterial: StandardMaterial | null = null;
  private config: TerrainConfig;

  // Double-buffered border meshes for smooth updates
  private borderMeshA: LinesMesh | null = null;
  private borderMeshB: LinesMesh | null = null;
  private activeBorderIndex: 0 | 1 = 0; // Which mesh is currently visible

  // Cached terrain data
  private heightmap: Float32Array | null = null;
  private cachedColors: Float32Array | null = null;

  // Track if we need initial color update (game state may not be ready at init time)
  private needsInitialColorUpdate: boolean = true;
  private tickCount: number = 0;

  // Track if borders need update
  private bordersDirty: boolean = true;

  constructor(
    private game: GameView,
    config: Partial<TerrainConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(scene: Scene): void {
    this.scene = scene;
    this.createTerrainMesh();
    this.createWaterMesh();
    // Territory colors will be updated on first tick when game state is ready
  }

  /**
   * Generate heightmap from game map data
   */
  private generateHeightmap(): Float32Array {
    const width = this.game.width();
    const height = this.game.height();
    const heightmap = new Float32Array(width * height);

    // Extract magnitude values from terrain
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ref = this.game.ref(x, y);
        const idx = y * width + x;

        if (this.game.isLand(ref)) {
          // Land: use magnitude for height (0-31 range)
          const magnitude = this.game.magnitude(ref);
          heightmap[idx] = (magnitude / 31) * this.config.heightScale;
        } else {
          // Water: below water level
          heightmap[idx] = this.config.waterLevel;
        }
      }
    }

    // Smooth the heightmap
    return this.smoothHeightmap(heightmap, width, height);
  }

  /**
   * Apply smoothing to heightmap for more natural terrain
   */
  private smoothHeightmap(
    heightmap: Float32Array,
    width: number,
    height: number,
  ): Float32Array {
    let current = heightmap;

    for (let pass = 0; pass < this.config.smoothingPasses; pass++) {
      const smoothed = new Float32Array(width * height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          let sum = current[idx];
          let count = 1;

          // Average with neighbors
          const neighbors = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ];

          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += current[ny * width + nx];
              count++;
            }
          }

          smoothed[idx] = sum / count;
        }
      }

      current = smoothed;
    }

    return current;
  }

  /**
   * Create the terrain mesh from map data
   */
  private createTerrainMesh(): void {
    if (!this.scene) return;

    const width = this.game.width();
    const height = this.game.height();

    // Generate heightmap
    this.heightmap = this.generateHeightmap();

    // Create vertex data
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    // Initialize cached colors array
    const totalVertices = width * height;
    this.cachedColors = new Float32Array(totalVertices * 4);

    // Generate vertices
    // Note: We invert Z to match 2D coordinate system where Y increases downward
    let colorIdx = 0;
    for (let gameY = 0; gameY < height; gameY++) {
      for (let gameX = 0; gameX < width; gameX++) {
        const idx = gameY * width + gameX;
        const elevation = this.heightmap[idx];

        // Position: game X -> 3D X, game Y -> 3D Z (inverted for correct orientation)
        const z3d = height - 1 - gameY;
        positions.push(gameX, elevation, z3d);

        // Get terrain color and store in cached array
        const ref = this.game.ref(gameX, gameY);
        const color = this.getTerrainColor(ref);
        this.cachedColors[colorIdx++] = color.r;
        this.cachedColors[colorIdx++] = color.g;
        this.cachedColors[colorIdx++] = color.b;
        this.cachedColors[colorIdx++] = 1;
      }
    }

    // Generate indices for triangles
    for (let z = 0; z < height - 1; z++) {
      for (let x = 0; x < width - 1; x++) {
        const topLeft = z * width + x;
        const topRight = topLeft + 1;
        const bottomLeft = (z + 1) * width + x;
        const bottomRight = bottomLeft + 1;

        // Two triangles per quad
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
    }

    // Calculate normals
    VertexData.ComputeNormals(positions, indices, normals);

    // Create mesh
    this.terrainMesh = new Mesh("terrain", this.scene);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.colors = this.cachedColors;
    // Apply with updatable=true for colors so we can update them efficiently
    vertexData.applyToMesh(this.terrainMesh, true);

    // Create material with vertex colors
    this.terrainMaterial = new StandardMaterial("terrainMaterial", this.scene);
    // White diffuse to let vertex colors show through
    this.terrainMaterial.diffuseColor = new Color3(1, 1, 1);
    // No specular - flat look like 2D
    this.terrainMaterial.specularColor = new Color3(0, 0, 0);
    // Small emissive to ensure colors are visible even in shadow
    this.terrainMaterial.emissiveColor = new Color3(0.3, 0.3, 0.3);
    // Disable backface culling to see terrain from all angles
    this.terrainMaterial.backFaceCulling = false;

    // Enable vertex colors BEFORE assigning material
    this.terrainMesh.useVertexColors = true;
    this.terrainMesh.material = this.terrainMaterial;
  }

  /**
   * Create a flat water plane
   */
  private createWaterMesh(): void {
    if (!this.scene) return;

    const width = this.game.width();
    const height = this.game.height();

    // Create simple quad for water at y=0
    // Corners: (0,0,0), (width,0,0), (width,0,height), (0,0,height)
    const positions = [0, 0, 0, width, 0, 0, width, 0, height, 0, 0, height];
    const indices = [0, 2, 1, 0, 3, 2];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);

    this.waterMesh = new Mesh("water", this.scene);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.applyToMesh(this.waterMesh);

    // Water material - brighter blue to match game
    this.waterMaterial = new StandardMaterial("waterMaterial", this.scene);
    this.waterMaterial.diffuseColor = new Color3(0.2, 0.5, 0.8);
    this.waterMaterial.specularColor = new Color3(0.4, 0.4, 0.5);
    this.waterMaterial.emissiveColor = new Color3(0.1, 0.2, 0.3);
    this.waterMaterial.alpha = 0.85;
    this.waterMesh.material = this.waterMaterial;
  }

  /**
   * Build border line data from current ownership state
   */
  private buildBorderLines(): Vector3[][] {
    if (!this.heightmap) return [];

    const width = this.game.width();
    const height = this.game.height();
    const lines: Vector3[][] = [];

    // Scan all tiles and find edges between different owners
    for (let gameY = 0; gameY < height; gameY++) {
      for (let gameX = 0; gameX < width; gameX++) {
        const ref = this.game.ref(gameX, gameY);
        if (!this.game.hasOwner(ref)) continue;

        const owner = this.game.owner(ref);
        const idx = gameY * width + gameX;
        const elevation = this.heightmap[idx];
        const z3d = height - 1 - gameY;

        // Check right neighbor
        if (gameX < width - 1) {
          const rightRef = this.game.ref(gameX + 1, gameY);
          const rightOwner = this.game.hasOwner(rightRef)
            ? this.game.owner(rightRef)
            : null;

          if (owner !== rightOwner) {
            const rightIdx = gameY * width + (gameX + 1);
            const rightElevation = this.heightmap[rightIdx];
            const borderHeight = Math.max(elevation, rightElevation) + 0.5;

            // Vertical line at x + 0.5
            lines.push([
              new Vector3(gameX + 0.5, borderHeight, z3d - 0.5),
              new Vector3(gameX + 0.5, borderHeight, z3d + 0.5),
            ]);
          }
        }

        // Check bottom neighbor (which is +Y in game coords, -Z in 3D)
        if (gameY < height - 1) {
          const bottomRef = this.game.ref(gameX, gameY + 1);
          const bottomOwner = this.game.hasOwner(bottomRef)
            ? this.game.owner(bottomRef)
            : null;

          if (owner !== bottomOwner) {
            const bottomIdx = (gameY + 1) * width + gameX;
            const bottomElevation = this.heightmap[bottomIdx];
            const borderHeight = Math.max(elevation, bottomElevation) + 0.5;

            // Horizontal line at z3d - 0.5 (between this tile and bottom)
            lines.push([
              new Vector3(gameX - 0.5, borderHeight, z3d - 0.5),
              new Vector3(gameX + 0.5, borderHeight, z3d - 0.5),
            ]);
          }
        }
      }
    }

    return lines;
  }

  /**
   * Update territory border lines using double buffering.
   * Builds new borders into the inactive mesh, then swaps visibility atomically.
   * This eliminates visual flickering during updates.
   */
  private updateBorders(): void {
    if (!this.scene) return;

    const lines = this.buildBorderLines();

    // Determine which mesh to build into (the inactive one)
    const inactiveIndex = this.activeBorderIndex === 0 ? 1 : 0;
    const inactiveMesh =
      inactiveIndex === 0 ? this.borderMeshA : this.borderMeshB;

    // Dispose the inactive mesh before rebuilding
    inactiveMesh?.dispose();

    if (lines.length === 0) {
      // No borders - hide both meshes
      if (this.borderMeshA) this.borderMeshA.isVisible = false;
      if (this.borderMeshB) this.borderMeshB.isVisible = false;
      return;
    }

    // Create new line mesh into the inactive slot
    const newMesh = CreateLineSystem(
      `borders_${inactiveIndex}`,
      {
        lines,
        updatable: false,
      },
      this.scene,
    );

    // Style the new mesh
    newMesh.color = new Color3(0.1, 0.1, 0.1);
    newMesh.alpha = 0.8;
    newMesh.isVisible = true;

    // Store in the inactive slot
    if (inactiveIndex === 0) {
      this.borderMeshA = newMesh;
    } else {
      this.borderMeshB = newMesh;
    }

    // Hide the old active mesh
    const oldActiveMesh =
      this.activeBorderIndex === 0 ? this.borderMeshA : this.borderMeshB;
    if (oldActiveMesh && oldActiveMesh !== newMesh) {
      oldActiveMesh.isVisible = false;
    }

    // Swap active index
    this.activeBorderIndex = inactiveIndex as 0 | 1;
  }

  /**
   * Get the base terrain color for a tile
   */
  private getTerrainColor(ref: number): Color3 {
    const theme = this.game.config().theme();

    if (this.game.isOcean(ref)) {
      // Deep water
      return new Color3(0.05, 0.15, 0.35);
    } else if (this.game.isShore(ref)) {
      // Shore/beach
      return new Color3(0.76, 0.7, 0.5);
    } else if (this.game.isLand(ref)) {
      // Land - use terrain color from theme
      // GameView implements the interface expected by terrainColor
      const terrainColor = theme.terrainColor(this.game as any, ref);
      return new Color3(
        terrainColor.rgba.r / 255,
        terrainColor.rgba.g / 255,
        terrainColor.rgba.b / 255,
      );
    }

    // Default fallback
    return new Color3(0.3, 0.3, 0.3);
  }

  /**
   * Update colors for specific tiles only (incremental update)
   * Much faster than updating the entire terrain
   */
  private updateTileColors(tiles: number[]): void {
    if (!this.terrainMesh || !this.scene || !this.cachedColors) return;

    const width = this.game.width();

    // Update only the changed tiles in the cached array
    for (const tileRef of tiles) {
      // Convert tileRef to x,y coordinates
      const gameX = this.game.x(tileRef);
      const gameY = this.game.y(tileRef);

      // Calculate vertex index (must match createTerrainMesh vertex order)
      const vertexIndex = gameY * width + gameX;
      const colorIndex = vertexIndex * 4; // 4 components per color (RGBA)

      // Get the color for this tile
      let r: number, g: number, b: number;

      if (this.game.hasOwner(tileRef)) {
        const owner = this.game.owner(tileRef) as PlayerView;
        const colord = owner.territoryColor(tileRef);
        const playerColor = colord.rgba;
        r = playerColor.r / 255;
        g = playerColor.g / 255;
        b = playerColor.b / 255;
      } else {
        const color = this.getTerrainColor(tileRef);
        r = color.r;
        g = color.g;
        b = color.b;
      }

      // Update the color in the cached array
      this.cachedColors[colorIndex] = r;
      this.cachedColors[colorIndex + 1] = g;
      this.cachedColors[colorIndex + 2] = b;
      // Alpha stays at 1
    }

    // Apply updated colors - use updateVerticesData for partial updates
    this.terrainMesh.updateVerticesData("color", this.cachedColors, true);
  }

  /**
   * Update territory colors based on ownership (full rebuild)
   * Called on initial load
   */
  updateTerritoryColors(): void {
    if (!this.terrainMesh || !this.scene) return;

    const width = this.game.width();
    const height = this.game.height();
    const totalVertices = width * height;

    // Initialize or reuse cached colors array
    if (!this.cachedColors || this.cachedColors.length !== totalVertices * 4) {
      this.cachedColors = new Float32Array(totalVertices * 4);
    }

    // Must match the vertex order in createTerrainMesh
    let idx = 0;
    for (let gameY = 0; gameY < height; gameY++) {
      for (let gameX = 0; gameX < width; gameX++) {
        const ref = this.game.ref(gameX, gameY);

        // Check if owned by a player (same logic as 2D TerritoryLayer)
        if (this.game.hasOwner(ref)) {
          const owner = this.game.owner(ref) as PlayerView;
          const colord = owner.territoryColor(ref);
          const playerColor = colord.rgba;
          this.cachedColors[idx++] = playerColor.r / 255;
          this.cachedColors[idx++] = playerColor.g / 255;
          this.cachedColors[idx++] = playerColor.b / 255;
          this.cachedColors[idx++] = 1;
          continue;
        }

        // Not owned - use terrain color
        const color = this.getTerrainColor(ref);
        this.cachedColors[idx++] = color.r;
        this.cachedColors[idx++] = color.g;
        this.cachedColors[idx++] = color.b;
        this.cachedColors[idx++] = 1;
      }
    }

    // Update mesh colors
    this.terrainMesh.updateVerticesData("color", this.cachedColors, true);
  }

  tick(updates: GameUpdateViewData | null): void {
    this.tickCount++;

    // Do initial color update after a few ticks (game state may not be ready immediately)
    if (this.needsInitialColorUpdate && this.tickCount >= 3) {
      this.updateTerritoryColors();
      this.updateBorders();
      this.needsInitialColorUpdate = false;
      this.bordersDirty = false;
      return;
    }

    // Incrementally update only the tiles that changed (like 2D renderer)
    const updatedTiles = this.game.recentlyUpdatedTiles();
    if (updatedTiles.length > 0) {
      this.updateTileColors(updatedTiles);
      // Mark borders as needing update (ownership may have changed)
      this.bordersDirty = true;
    }

    // Rebuild borders periodically when dirty (not every tick for performance)
    if (this.bordersDirty && this.tickCount % 10 === 0) {
      this.updateBorders();
      this.bordersDirty = false;
    }
  }

  update(deltaTime: number): void {
    // Future: animate water, etc.
  }

  dispose(): void {
    this.terrainMesh?.dispose();
    this.waterMesh?.dispose();
    this.borderMeshA?.dispose();
    this.borderMeshB?.dispose();
    this.terrainMaterial?.dispose();
    this.waterMaterial?.dispose();
  }
}
