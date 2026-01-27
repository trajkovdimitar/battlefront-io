import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import { EventBus } from "../../../core/EventBus";
import { UnitType } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";
import {
  ContextMenuEvent,
  MouseUpEvent,
  TouchEvent,
  UnitSelectionEvent,
} from "../../InputHandler";
import { MoveWarshipIntentEvent } from "../../Transport";
import { ITransformHandler } from "../../graphics/ITransformHandler";
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

/** Configuration for warship selection */
const WARSHIP_SELECTION_RADIUS = 10;

/**
 * Renders mobile game units (ships, trains, projectiles) as 3D meshes.
 * Also handles warship selection and movement commands.
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

  /** Currently selected unit */
  private selectedUnit: UnitView | null = null;

  /** Selection ring mesh */
  private selectionRing: Mesh | null = null;
  private selectionMaterial: StandardMaterial | null = null;
  private selectionAnimTime: number = 0;

  constructor(
    private game: GameView,
    private eventBus?: EventBus,
    private transformHandler?: ITransformHandler,
  ) {
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

    // Create selection ring (hidden initially)
    this.createSelectionRing();

    // Subscribe to selection events
    if (this.eventBus) {
      this.eventBus.on(MouseUpEvent, (e) => this.onMouseUp(e));
      this.eventBus.on(TouchEvent, (e) => this.onTouch(e));
      this.eventBus.on(UnitSelectionEvent, (e) =>
        this.onUnitSelectionChange(e),
      );
    }

    // Initial scan of all units
    for (const unit of this.game.units()) {
      if (MOBILE_UNIT_TYPES.has(unit.type()) && unit.isActive()) {
        this.addUnit(unit);
      }
    }
  }

  /**
   * Create the selection ring mesh for highlighting selected units
   */
  private createSelectionRing(): void {
    if (!this.scene) return;

    // Create a torus for the selection ring
    this.selectionRing = CreateTorus(
      "selectionRing",
      { diameter: 12, thickness: 0.8, tessellation: 32 },
      this.scene,
    );
    this.selectionRing.isVisible = false;

    // Create glowing material
    this.selectionMaterial = new StandardMaterial("selectionMat", this.scene);
    this.selectionMaterial.emissiveColor = new Color3(1, 1, 0.5); // Yellow glow
    this.selectionMaterial.diffuseColor = new Color3(1, 1, 0.3);
    this.selectionMaterial.specularColor = new Color3(0, 0, 0);
    this.selectionMaterial.alpha = 0.8;
    this.selectionRing.material = this.selectionMaterial;
  }

  /**
   * Find player-owned warships near the given cell within selection radius
   */
  private findWarshipsNearCell(clickRef: TileRef): UnitView[] {
    return this.game
      .units(UnitType.Warship)
      .filter(
        (unit) =>
          unit.isActive() &&
          unit.owner() === this.game.myPlayer() &&
          this.game.manhattanDist(unit.tile(), clickRef) <=
            WARSHIP_SELECTION_RADIUS,
      )
      .sort((a, b) => {
        const distA = this.game.manhattanDist(a.tile(), clickRef);
        const distB = this.game.manhattanDist(b.tile(), clickRef);
        return distA - distB;
      });
  }

  /**
   * Handle mouse up events for warship selection
   */
  private onMouseUp(event: MouseUpEvent): void {
    if (!this.transformHandler || !this.eventBus) return;

    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;

    const clickRef = this.game.ref(cell.x, cell.y);
    if (!this.game.isOcean(clickRef)) return;

    if (this.selectedUnit) {
      // Move the selected warship
      this.eventBus.emit(
        new MoveWarshipIntentEvent(this.selectedUnit.id(), clickRef),
      );
      // Deselect
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
      return;
    }

    // Find warships near this tile
    const nearbyWarships = this.findWarshipsNearCell(clickRef);
    if (nearbyWarships.length > 0) {
      this.eventBus.emit(new UnitSelectionEvent(nearbyWarships[0], true));
    }
  }

  /**
   * Handle touch events for warship selection
   */
  private onTouch(event: TouchEvent): void {
    if (!this.transformHandler || !this.eventBus) return;

    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;

    const clickRef = this.game.ref(cell.x, cell.y);
    if (!this.game.isOcean(clickRef)) {
      this.eventBus.emit(new ContextMenuEvent(event.x, event.y));
      return;
    }

    if (this.selectedUnit) {
      this.onMouseUp(new MouseUpEvent(event.x, event.y));
      return;
    }

    const nearbyWarships = this.findWarshipsNearCell(clickRef);
    if (nearbyWarships.length > 0) {
      this.eventBus.emit(new UnitSelectionEvent(nearbyWarships[0], true));
    } else {
      this.eventBus.emit(new ContextMenuEvent(event.x, event.y));
    }
  }

  /**
   * Handle unit selection changes
   */
  private onUnitSelectionChange(event: UnitSelectionEvent): void {
    if (event.isSelected) {
      this.selectedUnit = event.unit;
    } else if (this.selectedUnit === event.unit) {
      this.selectedUnit = null;
    }
    this.updateSelectionRing();
  }

  /**
   * Update the selection ring position and visibility
   */
  private updateSelectionRing(): void {
    if (!this.selectionRing) return;

    if (this.selectedUnit && this.selectedUnit.isActive()) {
      const info = this.units.get(this.selectedUnit.id());
      if (info) {
        this.selectionRing.isVisible = true;
        this.selectionRing.position.x = info.node.position.x;
        this.selectionRing.position.z = info.node.position.z;
        this.selectionRing.position.y = 1.5; // Slightly above water
      }
    } else {
      this.selectionRing.isVisible = false;
      this.selectedUnit = null;
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
    // Animate selection ring
    if (this.selectionRing?.isVisible && this.selectionMaterial) {
      this.selectionAnimTime += deltaTime;

      // Pulsating opacity
      const baseOpacity = 0.6;
      const pulseAmount = 0.3;
      const opacity =
        baseOpacity + Math.sin(this.selectionAnimTime * 0.005) * pulseAmount;
      this.selectionMaterial.alpha = opacity;

      // Gentle rotation
      this.selectionRing.rotation.y += deltaTime * 0.001;

      // Update position to follow selected unit
      this.updateSelectionRing();
    }
  }

  dispose(): void {
    this.unitParent?.dispose();
    this.selectionRing?.dispose();
    this.selectionMaterial?.dispose();
    this.materialCache.forEach((m) => m.dispose());
    this.materialCache.clear();
    this.units.clear();
    this.selectedUnit = null;
  }
}
