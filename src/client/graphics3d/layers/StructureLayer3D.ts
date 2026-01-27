import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import { UnitType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";
import { Layer3D } from "./Layer3D";

/** Structure types we render */
const STRUCTURE_TYPES = new Set<UnitType>([
  UnitType.City,
  UnitType.Port,
  UnitType.Factory,
  UnitType.MissileSilo,
  UnitType.DefensePost,
  UnitType.SAMLauncher,
]);

/** Configuration for each structure type */
interface StructureConfig {
  height: number;
  baseSize: number;
  createMesh: (scene: Scene, name: string) => Mesh;
}

/** Render info for a structure instance */
interface StructureRenderInfo {
  unit: UnitView;
  node: TransformNode;
  mesh: Mesh;
  material: StandardMaterial;
  ownerId: string;
  isConstruction: boolean;
}

/**
 * Renders game structures (buildings) as 3D meshes.
 * Each structure type has a unique procedural shape.
 */
export class StructureLayer3D implements Layer3D {
  private scene: Scene | null = null;
  private structureParent: TransformNode | null = null;

  /** Map from unit ID to render info */
  private structures = new Map<number, StructureRenderInfo>();

  /** Cached materials by color key */
  private materialCache = new Map<string, StandardMaterial>();

  /** Structure configurations */
  private readonly configs: Map<UnitType, StructureConfig>;

  constructor(private game: GameView) {
    this.configs = new Map([
      [
        UnitType.City,
        {
          height: 8,
          baseSize: 6,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 8, diameter: 6, tessellation: 16 },
              scene,
            ),
        },
      ],
      [
        UnitType.Port,
        {
          height: 5,
          baseSize: 6,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 5, diameter: 6, tessellation: 5 },
              scene,
            ),
        },
      ],
      [
        UnitType.Factory,
        {
          height: 6,
          baseSize: 6,
          createMesh: (scene, name) => {
            // Factory: cylinder with a smaller chimney on top
            const base = CreateCylinder(
              name,
              { height: 6, diameter: 6, tessellation: 12 },
              scene,
            );
            const chimney = CreateCylinder(
              `${name}_chimney`,
              { height: 4, diameter: 2, tessellation: 8 },
              scene,
            );
            chimney.position.y = 5;
            chimney.parent = base;
            return base;
          },
        },
      ],
      [
        UnitType.MissileSilo,
        {
          height: 10,
          baseSize: 5,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              {
                height: 10,
                diameterTop: 0,
                diameterBottom: 5,
                tessellation: 4,
              },
              scene,
            ),
        },
      ],
      [
        UnitType.DefensePost,
        {
          height: 4,
          baseSize: 6,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 4, diameter: 6, tessellation: 8 },
              scene,
            ),
        },
      ],
      [
        UnitType.SAMLauncher,
        {
          height: 5,
          baseSize: 5,
          createMesh: (scene, name) =>
            CreateBox(name, { height: 5, width: 5, depth: 5 }, scene),
        },
      ],
    ]);
  }

  init(scene: Scene): void {
    this.scene = scene;

    // Create parent node for all structures
    this.structureParent = new TransformNode("structures", scene);

    // Initial scan of all structures
    for (const unit of this.game.units()) {
      if (STRUCTURE_TYPES.has(unit.type()) && unit.isActive()) {
        this.addStructure(unit);
      }
    }
  }

  tick(): void {
    if (!this.scene) return;

    // Process unit updates
    const updates = this.game.updatesSinceLastTick();
    const unitUpdates = updates?.[GameUpdateType.Unit];

    if (unitUpdates) {
      for (const update of unitUpdates) {
        const unitView = this.game.unit(update.id);
        if (!unitView) continue;

        if (!STRUCTURE_TYPES.has(unitView.type())) continue;

        if (unitView.isActive()) {
          if (this.structures.has(update.id)) {
            this.updateStructure(unitView);
          } else {
            this.addStructure(unitView);
          }
        } else {
          this.removeStructure(update.id);
        }
      }
    }
  }

  private addStructure(unit: UnitView): void {
    if (!this.scene || !this.structureParent) return;

    const config = this.configs.get(unit.type());
    if (!config) return;

    const id = unit.id();
    const name = `structure_${id}`;

    // Create parent node for this structure
    const node = new TransformNode(name, this.scene);
    node.parent = this.structureParent;

    // Create mesh
    const mesh = config.createMesh(this.scene, `${name}_mesh`);
    mesh.parent = node;

    // Position in 3D world
    const gameX = this.game.x(unit.tile());
    const gameY = this.game.y(unit.tile());
    const worldX = gameX;
    const worldZ = this.game.height() - 1 - gameY;
    const worldY = config.height / 2; // Raise so bottom is at ground level

    node.position = new Vector3(worldX, worldY, worldZ);

    // Create material
    const isConstruction = unit.isUnderConstruction();
    const material = this.getMaterial(unit, isConstruction);
    mesh.material = material;

    // Apply material to children (e.g., factory chimney)
    mesh.getChildMeshes().forEach((child) => {
      if (child instanceof Mesh) {
        child.material = material;
      }
    });

    this.structures.set(id, {
      unit,
      node,
      mesh,
      material,
      ownerId: unit.owner().id(),
      isConstruction,
    });
  }

  private updateStructure(unit: UnitView): void {
    const info = this.structures.get(unit.id());
    if (!info) return;

    const isConstruction = unit.isUnderConstruction();
    const ownerId = unit.owner().id();

    // Check if material needs update
    if (info.isConstruction !== isConstruction || info.ownerId !== ownerId) {
      const material = this.getMaterial(unit, isConstruction);
      info.mesh.material = material;
      info.mesh.getChildMeshes().forEach((child) => {
        if (child instanceof Mesh) {
          child.material = material;
        }
      });
      info.material = material;
      info.isConstruction = isConstruction;
      info.ownerId = ownerId;
    }

    // Update position if needed (structures don't move, but just in case)
    const gameX = this.game.x(unit.tile());
    const gameY = this.game.y(unit.tile());
    const worldX = gameX;
    const worldZ = this.game.height() - 1 - gameY;
    const config = this.configs.get(unit.type());
    const worldY = config ? config.height / 2 : 4;

    info.node.position.x = worldX;
    info.node.position.y = worldY;
    info.node.position.z = worldZ;
  }

  private removeStructure(id: number): void {
    const info = this.structures.get(id);
    if (!info) return;

    info.node.dispose();
    this.structures.delete(id);
  }

  private getMaterial(
    unit: UnitView,
    isConstruction: boolean,
  ): StandardMaterial {
    let colorKey: string;
    let diffuseColor: Color3;

    if (isConstruction) {
      // Gray for construction
      colorKey = "construction";
      diffuseColor = new Color3(0.6, 0.6, 0.6);
    } else {
      // Player color
      const colors = unit.owner().structureColors();
      const light = colors.light.rgba;
      diffuseColor = new Color3(light.r / 255, light.g / 255, light.b / 255);
      colorKey = `player_${unit.owner().id()}`;
    }

    // Check cache
    let material = this.materialCache.get(colorKey);
    if (!material) {
      material = new StandardMaterial(`structureMat_${colorKey}`, this.scene!);
      material.diffuseColor = diffuseColor;
      material.specularColor = new Color3(0.2, 0.2, 0.2);
      material.emissiveColor = diffuseColor.scale(0.2); // Slight glow
      this.materialCache.set(colorKey, material);
    }

    return material;
  }

  update(deltaTime: number): void {
    // Future: animate structures (e.g., factory smoke, SAM rotation)
  }

  dispose(): void {
    this.structureParent?.dispose();
    this.materialCache.forEach((m) => m.dispose());
    this.materialCache.clear();
    this.structures.clear();
  }
}
