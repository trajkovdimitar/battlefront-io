import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import { EventBus } from "../../core/EventBus";
import { Cell } from "../../core/game/Game";
import { GameView } from "../../core/game/GameView";
import { CenterCameraEvent, DragEvent, ZoomEvent } from "../InputHandler";
import { ITransformHandler } from "../graphics/ITransformHandler";
import {
  GoToPlayerEvent,
  GoToPositionEvent,
  GoToUnitEvent,
} from "../graphics/layers/Leaderboard";
import { CameraController } from "./CameraController";

/**
 * 3D-aware transform handler that converts between screen coordinates
 * and game world coordinates using Babylon.js ray picking.
 *
 * Replaces the 2D TransformHandler when using the 3D renderer.
 */
export class TransformHandler3D implements ITransformHandler {
  private _boundingRect: DOMRect;
  private changed = false;

  // For compatibility with 2D code that reads these
  public scale: number = 1;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private canvas: HTMLCanvasElement,
    private cameraController: CameraController,
    private scene: Scene,
  ) {
    this._boundingRect = this.canvas.getBoundingClientRect();

    // Subscribe to events - delegate camera movement to CameraController
    this.eventBus.on(ZoomEvent, (e) => this.onZoom(e));
    this.eventBus.on(DragEvent, (e) => this.onMove(e));
    this.eventBus.on(GoToPlayerEvent, (e) => this.onGoToPlayer(e));
    this.eventBus.on(GoToPositionEvent, (e) => this.onGoToPosition(e));
    this.eventBus.on(GoToUnitEvent, (e) => this.onGoToUnit(e));
    this.eventBus.on(CenterCameraEvent, () => this.centerCamera());
  }

  public updateCanvasBoundingRect(): void {
    this._boundingRect = this.canvas.getBoundingClientRect();
  }

  boundingRect(): DOMRect {
    return this._boundingRect;
  }

  width(): number {
    return this.boundingRect().width;
  }

  hasChanged(): boolean {
    return this.changed;
  }

  resetChanged(): void {
    this.changed = false;
  }

  /**
   * Convert screen coordinates to game world coordinates.
   * Uses ray picking to intersect with the Y=0 plane.
   */
  screenToWorldCoordinates(screenX: number, screenY: number): Cell {
    const canvasRect = this.boundingRect();
    const canvasX = screenX - canvasRect.left;
    const canvasY = screenY - canvasRect.top;

    // Use camera controller's ray picking
    const worldPos = this.cameraController.screenToWorld(
      canvasX,
      canvasY,
      this.scene,
    );

    if (worldPos) {
      // Convert 3D world coordinates to game coordinates
      // World X = Game X
      // World Z = (mapHeight - 1 - gameY), so gameY = mapHeight - 1 - worldZ
      const gameX = worldPos.x;
      const gameY = this.game.height() - 1 - worldPos.z;

      return new Cell(Math.floor(gameX), Math.floor(gameY));
    }

    // Fallback if ray doesn't hit ground plane
    return new Cell(0, 0);
  }

  /**
   * Convert game world coordinates to screen coordinates.
   * Projects the 3D position onto the screen.
   */
  worldToScreenCoordinates(cell: Cell): { x: number; y: number } {
    // Convert game coordinates to 3D world position
    const worldX = cell.x;
    const worldZ = this.game.height() - 1 - cell.y;
    const worldY = 0; // Ground level

    const worldPos = new Vector3(worldX, worldY, worldZ);

    // Project to screen using Babylon's built-in projection
    const engine = this.scene.getEngine();
    const camera = this.cameraController.getCamera();

    const screenPos = Vector3.Project(
      worldPos,
      camera.getWorldMatrix(),
      this.scene.getTransformMatrix(),
      camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );

    const canvasRect = this.boundingRect();
    return {
      x: screenPos.x + canvasRect.left,
      y: screenPos.y + canvasRect.top,
    };
  }

  /**
   * Get the bounding rectangle of the visible game area in game coordinates.
   */
  screenBoundingRect(): [Cell, Cell] {
    const canvasRect = this.boundingRect();

    // Get corners of the screen in game coordinates
    const topLeft = this.screenToWorldCoordinates(
      canvasRect.left,
      canvasRect.top,
    );
    const bottomRight = this.screenToWorldCoordinates(
      canvasRect.right,
      canvasRect.bottom,
    );

    // Due to perspective, the actual bounds might be larger
    // Use a margin to ensure we capture everything visible
    const margin = 50;

    return [
      new Cell(
        Math.max(0, topLeft.x - margin),
        Math.max(0, topLeft.y - margin),
      ),
      new Cell(
        Math.min(this.game.width(), bottomRight.x + margin),
        Math.min(this.game.height(), bottomRight.y + margin),
      ),
    ];
  }

  /**
   * Check if a cell is currently visible on screen.
   */
  isOnScreen(cell: Cell): boolean {
    const [topLeft, bottomRight] = this.screenBoundingRect();
    return (
      cell.x >= topLeft.x &&
      cell.x <= bottomRight.x &&
      cell.y >= topLeft.y &&
      cell.y <= bottomRight.y
    );
  }

  /**
   * Get the center of the visible area in game coordinates.
   */
  screenCenter(): { screenX: number; screenY: number } {
    const [upperLeft, bottomRight] = this.screenBoundingRect();
    return {
      screenX: upperLeft.x + Math.floor((bottomRight.x - upperLeft.x) / 2),
      screenY: upperLeft.y + Math.floor((bottomRight.y - upperLeft.y) / 2),
    };
  }

  // Event handlers - delegate to camera controller

  private onZoom(event: ZoomEvent): void {
    // Babylon's ArcRotateCamera handles zoom via mouse wheel automatically
    // But we can adjust zoom level programmatically if needed
    this.changed = true;
  }

  private onMove(event: DragEvent): void {
    // Babylon's camera handles panning via right-click drag automatically
    this.changed = true;
  }

  private onGoToPlayer(event: GoToPlayerEvent): void {
    const nameLocation = event.player.nameLocation();
    if (!nameLocation) return;

    // Convert game coordinates to 3D world coordinates
    const worldZ = this.game.height() - 1 - nameLocation.y;
    this.cameraController.goToPosition(nameLocation.x, worldZ, true);
  }

  private onGoToPosition(event: GoToPositionEvent): void {
    const worldZ = this.game.height() - 1 - event.y;
    this.cameraController.goToPosition(event.x, worldZ, true);
  }

  private onGoToUnit(event: GoToUnitEvent): void {
    const gameX = this.game.x(event.unit.lastTile());
    const gameY = this.game.y(event.unit.lastTile());
    const worldZ = this.game.height() - 1 - gameY;
    this.cameraController.goToPosition(gameX, worldZ, true);
  }

  private centerCamera(): void {
    const player = this.game.myPlayer();
    if (!player || !player.nameLocation()) return;

    const loc = player.nameLocation();
    const worldZ = this.game.height() - 1 - loc.y;
    this.cameraController.goToPosition(loc.x, worldZ, true);
  }

  /**
   * Center the entire map in view.
   */
  centerAll(fit: number = 1): void {
    this.cameraController.centerOnMap();
  }

  /**
   * For compatibility - no-op in 3D since there's no canvas context transform.
   */
  handleTransform(context: CanvasRenderingContext2D): void {
    // No-op - 3D renderer doesn't use canvas 2D context
  }

  /**
   * Override camera position programmatically.
   */
  override(x: number = 0, y: number = 0, s: number = 1): void {
    const worldZ = this.game.height() - 1 - y;
    this.cameraController.goToPosition(x, worldZ, false);
    this.changed = true;
  }
}
