import { Cell } from "../../core/game/Game";

/**
 * Interface for coordinate transformation between screen and game world.
 * Implemented by both 2D TransformHandler and 3D TransformHandler3D.
 */
export interface ITransformHandler {
  /** Current scale/zoom level */
  scale: number;

  /** Get the canvas bounding rectangle */
  boundingRect(): DOMRect;

  /** Get the canvas width */
  width(): number;

  /** Check if the transform has changed since last reset */
  hasChanged(): boolean;

  /** Reset the changed flag */
  resetChanged(): void;

  /** Convert screen coordinates to game world coordinates */
  screenToWorldCoordinates(screenX: number, screenY: number): Cell;

  /** Convert game world coordinates to screen coordinates */
  worldToScreenCoordinates(cell: Cell): { x: number; y: number };

  /** Get the bounding rectangle of visible game area in game coordinates */
  screenBoundingRect(): [Cell, Cell];

  /** Check if a cell is currently visible on screen */
  isOnScreen(cell: Cell): boolean;

  /** Get the center of the visible area in game coordinates */
  screenCenter(): { screenX: number; screenY: number };

  /** Update the cached canvas bounding rect */
  updateCanvasBoundingRect(): void;

  /** Center the entire map in view */
  centerAll(fit?: number): void;
}
