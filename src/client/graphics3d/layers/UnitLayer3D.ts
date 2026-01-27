import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import { UnitType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";
import { Layer3D } from "./Layer3D";

/** Unit types we render (mobile units, not structures) */
const MOBILE_UNIT_TYPES = new Set<UnitType>([
  UnitType.TransportShip,
  UnitType.Warship,
  UnitType.TradeShip,
  UnitType.Train,
  UnitType.Shell,
  UnitType.SAMMissile,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.MIRVWarhead,
]);

/** Configuration for each unit type */
interface UnitConfig {
  height: number;
  createMesh: (scene: Scene, name: string) => Mesh;
}

/** Render info for a unit instance */
interface UnitRenderInfo {
  unit: UnitView;
  node: TransformNode;
  mesh: Mesh;
  material: StandardMaterial;
  lastX: number;
  lastZ: number;
  targetX: number;
  targetZ: number;
}

/**
 * Renders mobile game units (ships, trains, projectiles) as 3D meshes.
 */
export class UnitLayer3D implements Layer3D {
  private scene: Scene | null = null;
  private unitParent: TransformNode | null = null;

  /** Map from unit ID to render info */
  private units = new Map<number, UnitRenderInfo>();

  /** Cached materials by color key */
  private materialCache = new Map<string, StandardMaterial>();

  /** Unit configurations */
  private readonly configs: Map<UnitType, UnitConfig>;

  constructor(private game: GameView) {
    this.configs = new Map([
      // Ships - elongated boxes
      [
        UnitType.TransportShip,
        {
          height: 2,
          createMesh: (scene, name) =>
            CreateBox(name, { height: 2, width: 3, depth: 6 }, scene),
        },
      ],
      [
        UnitType.Warship,
        {
          height: 3,
          createMesh: (scene, name) =>
            CreateBox(name, { height: 3, width: 4, depth: 8 }, scene),
        },
      ],
      [
        UnitType.TradeShip,
        {
          height: 2,
          createMesh: (scene, name) =>
            CreateBox(name, { height: 2, width: 3, depth: 5 }, scene),
        },
      ],
      // Train - cylinder
      [
        UnitType.Train,
        {
          height: 2,
          createMesh: (scene, name) =>
            CreateBox(name, { height: 2, width: 2, depth: 4 }, scene),
        },
      ],
      // Projectiles - small shapes
      [
        UnitType.Shell,
        {
          height: 1,
          createMesh: (scene, name) =>
            CreateSphere(name, { diameter: 1, segments: 8 }, scene),
        },
      ],
      [
        UnitType.SAMMissile,
        {
          height: 1.5,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 3, diameter: 0.5, tessellation: 8 },
              scene,
            ),
        },
      ],
      // Nukes - larger missiles
      [
        UnitType.AtomBomb,
        {
          height: 2,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 4, diameter: 1, tessellation: 8 },
              scene,
            ),
        },
      ],
      [
        UnitType.HydrogenBomb,
        {
          height: 2.5,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 5, diameter: 1.2, tessellation: 8 },
              scene,
            ),
        },
      ],
      [
        UnitType.MIRV,
        {
          height: 3,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              { height: 6, diameter: 1.5, tessellation: 8 },
              scene,
            ),
        },
      ],
      [
        UnitType.MIRVWarhead,
        {
          height: 1.5,
          createMesh: (scene, name) =>
            CreateCylinder(
              name,
              {
                height: 2,
                diameterTop: 0,
                diameterBottom: 0.8,
                tessellation: 8,
              },
              scene,
            ),
        },
      ],
    ]);
  }

  init(scene: Scene): void {
    this.scene = scene;

    // Create parent node for all units
    this.unitParent = new TransformNode("units", scene);

    // Initial scan of all units
    for (const unit of this.game.units()) {
      if (MOBILE_UNIT_TYPES.has(unit.type()) && unit.isActive()) {
        this.addUnit(unit);
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

        if (!MOBILE_UNIT_TYPES.has(unitView.type())) continue;

        if (unitView.isActive()) {
          if (this.units.has(update.id)) {
            this.updateUnit(unitView);
          } else {
            this.addUnit(unitView);
          }
        } else {
          this.removeUnit(update.id);
        }
      }
    }
  }

  private addUnit(unit: UnitView): void {
    if (!this.scene || !this.unitParent) return;

    const config = this.configs.get(unit.type());
    if (!config) return;

    const id = unit.id();
    const name = `unit_${id}`;

    // Create parent node for this unit
    const node = new TransformNode(name, this.scene);
    node.parent = this.unitParent;

    // Create mesh
    const mesh = config.createMesh(this.scene, `${name}_mesh`);
    mesh.parent = node;

    // Get positions
    const gameX = this.game.x(unit.tile());
    const gameY = this.game.y(unit.tile());
    const lastGameX = this.game.x(unit.lastTile());
    const lastGameY = this.game.y(unit.lastTile());

    const worldX = gameX;
    const worldZ = this.game.height() - 1 - gameY;
    const lastWorldX = lastGameX;
    const lastWorldZ = this.game.height() - 1 - lastGameY;

    // Height based on unit type
    const worldY = this.getUnitHeight(unit.type());

    node.position = new Vector3(worldX, worldY, worldZ);

    // Calculate rotation based on movement direction
    this.updateRotation(node, lastWorldX, lastWorldZ, worldX, worldZ);

    // Create material
    const material = this.getMaterial(unit);
    mesh.material = material;

    this.units.set(id, {
      unit,
      node,
      mesh,
      material,
      lastX: lastWorldX,
      lastZ: lastWorldZ,
      targetX: worldX,
      targetZ: worldZ,
    });
  }

  private updateUnit(unit: UnitView): void {
    const info = this.units.get(unit.id());
    if (!info) return;

    // Get new positions
    const gameX = this.game.x(unit.tile());
    const gameY = this.game.y(unit.tile());
    const lastGameX = this.game.x(unit.lastTile());
    const lastGameY = this.game.y(unit.lastTile());

    const worldX = gameX;
    const worldZ = this.game.height() - 1 - gameY;
    const lastWorldX = lastGameX;
    const lastWorldZ = this.game.height() - 1 - lastGameY;
    const worldY = this.getUnitHeight(unit.type());

    // Update position
    info.node.position.x = worldX;
    info.node.position.y = worldY;
    info.node.position.z = worldZ;

    // Update rotation based on movement direction
    this.updateRotation(info.node, lastWorldX, lastWorldZ, worldX, worldZ);

    // Store for interpolation
    info.lastX = lastWorldX;
    info.lastZ = lastWorldZ;
    info.targetX = worldX;
    info.targetZ = worldZ;
  }

  private removeUnit(id: number): void {
    const info = this.units.get(id);
    if (!info) return;

    info.node.dispose();
    this.units.delete(id);
  }

  private getUnitHeight(type: UnitType): number {
    // Ships float on water
    if (
      type === UnitType.TransportShip ||
      type === UnitType.Warship ||
      type === UnitType.TradeShip
    ) {
      return 1;
    }
    // Missiles fly high
    if (
      type === UnitType.AtomBomb ||
      type === UnitType.HydrogenBomb ||
      type === UnitType.MIRV ||
      type === UnitType.MIRVWarhead ||
      type === UnitType.SAMMissile
    ) {
      return 15;
    }
    // Shells arc through air
    if (type === UnitType.Shell) {
      return 8;
    }
    // Trains on ground
    if (type === UnitType.Train) {
      return 2;
    }
    return 2;
  }

  private updateRotation(
    node: TransformNode,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): void {
    const dx = toX - fromX;
    const dz = toZ - fromZ;

    if (dx !== 0 || dz !== 0) {
      // Calculate angle from direction
      const angle = Math.atan2(dx, dz);
      node.rotation.y = angle;
    }
  }

  private getMaterial(unit: UnitView): StandardMaterial {
    const colors = unit.owner().territoryColor().rgba;
    const colorKey = `unit_${unit.owner().id()}`;

    let material = this.materialCache.get(colorKey);
    if (!material) {
      material = new StandardMaterial(`unitMat_${colorKey}`, this.scene!);
      material.diffuseColor = new Color3(
        colors.r / 255,
        colors.g / 255,
        colors.b / 255,
      );
      material.specularColor = new Color3(0.3, 0.3, 0.3);
      material.emissiveColor = new Color3(
        colors.r / 510,
        colors.g / 510,
        colors.b / 510,
      );
      this.materialCache.set(colorKey, material);
    }

    return material;
  }

  update(deltaTime: number): void {
    // Future: smooth interpolation between positions
  }

  dispose(): void {
    this.unitParent?.dispose();
    this.materialCache.forEach((m) => m.dispose());
    this.materialCache.clear();
    this.units.clear();
  }
}
