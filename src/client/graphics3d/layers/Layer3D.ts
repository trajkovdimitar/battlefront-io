import { Scene } from "@babylonjs/core/scene";
import { GameUpdateViewData } from "../../../core/game/GameUpdates";

/**
 * Interface for all 3D rendering layers.
 * Each layer handles a specific rendering concern (terrain, units, effects, etc.)
 */
export interface Layer3D {
  /**
   * Initialize the layer. Called once when the renderer starts.
   * Create meshes, materials, and set up any resources here.
   */
  init(scene: Scene): void;

  /**
   * Called when game state updates. Process any changes that affect this layer.
   * @param updates - The game state updates since last tick
   */
  tick(updates: GameUpdateViewData | null): void;

  /**
   * Called every frame before render. Use for animations and visual updates.
   * @param deltaTime - Time since last frame in milliseconds
   */
  update?(deltaTime: number): void;

  /**
   * Clean up resources when the layer is destroyed.
   */
  dispose(): void;
}
