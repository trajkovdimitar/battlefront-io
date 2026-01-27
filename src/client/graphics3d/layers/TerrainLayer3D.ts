import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Scene } from "@babylonjs/core/scene";
import { GameUpdateViewData } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
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

  // Cached terrain data
  private heightmap: Float32Array | null = null;
  private colorData: Float32Array | null = null;

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
    const colors: number[] = [];

    // Generate vertices
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const idx = z * width + x;
        const y = this.heightmap[idx];

        // Position (x, y, z) - note: game Y becomes 3D Z
        positions.push(x, y, z);

        // Get terrain color
        const ref = this.game.ref(x, z);
        const color = this.getTerrainColor(ref);
        colors.push(color.r, color.g, color.b, 1);
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
    vertexData.colors = colors;
    vertexData.applyToMesh(this.terrainMesh);

    // Create material with vertex colors
    this.terrainMaterial = new StandardMaterial("terrainMaterial", this.scene);
    this.terrainMaterial.diffuseColor = new Color3(1, 1, 1);
    this.terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    this.terrainMaterial.emissiveColor = new Color3(0.1, 0.1, 0.1);
    this.terrainMesh.material = this.terrainMaterial;

    // Enable vertex colors (must be done after material is assigned)
    this.terrainMesh.useVertexColors = true;
  }

  /**
   * Create a flat water plane
   */
  private createWaterMesh(): void {
    if (!this.scene) return;

    const width = this.game.width();
    const height = this.game.height();

    // Create simple quad for water
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

    // Water material
    this.waterMaterial = new StandardMaterial("waterMaterial", this.scene);
    this.waterMaterial.diffuseColor = new Color3(0.1, 0.3, 0.6);
    this.waterMaterial.specularColor = new Color3(0.3, 0.3, 0.4);
    this.waterMaterial.alpha = 0.8;
    this.waterMesh.material = this.waterMaterial;
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
   * Update territory colors based on ownership
   * Called when territories change hands
   */
  updateTerritoryColors(): void {
    if (!this.terrainMesh || !this.scene) return;

    const width = this.game.width();
    const height = this.game.height();
    const colors: number[] = [];

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const ref = this.game.ref(x, z);

        // Check if owned by a player
        if (this.game.hasOwner(ref)) {
          const owner = this.game.owner(ref);
          // owner() returns PlayerView | TerraNullius
          if (owner && "territoryColor" in owner) {
            const colord = owner.territoryColor(ref);
            const playerColor = colord.rgba;
            colors.push(
              playerColor.r / 255,
              playerColor.g / 255,
              playerColor.b / 255,
              1,
            );
            continue;
          }
        }

        // Not owned - use terrain color
        const color = this.getTerrainColor(ref);
        colors.push(color.r, color.g, color.b, 1);
      }
    }

    // Update mesh colors
    this.terrainMesh.setVerticesData("color", colors);
  }

  tick(updates: GameUpdateViewData | null): void {
    // Check for tile updates that affect territory ownership
    if (updates?.packedTileUpdates && updates.packedTileUpdates.length > 0) {
      // Territory changed - update colors
      // For now, update all colors (optimization: only update changed tiles)
      this.updateTerritoryColors();
    }
  }

  update(deltaTime: number): void {
    // Future: animate water, etc.
  }

  dispose(): void {
    this.terrainMesh?.dispose();
    this.waterMesh?.dispose();
    this.terrainMaterial?.dispose();
    this.waterMaterial?.dispose();
  }
}
