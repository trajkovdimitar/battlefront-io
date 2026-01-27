import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import { EventBus } from "../../core/EventBus";
import { Cell } from "../../core/game/Game";
import { GameView } from "../../core/game/GameView";
import { UIState } from "../graphics/UIState";
import { CameraController } from "./CameraController";
import { Layer3D } from "./layers/Layer3D";
import { TerrainLayer3D } from "./layers/TerrainLayer3D";

/**
 * Factory function to create the 3D renderer.
 * Matches the interface of the 2D createRenderer function.
 */
export function createRenderer3D(
  canvas: HTMLCanvasElement,
  game: GameView,
  eventBus: EventBus,
): BabylonRenderer {
  return new BabylonRenderer(canvas, game, eventBus);
}

/**
 * Compatibility wrapper for transform operations.
 * Provides the same interface as TransformHandler for ClientGameRunner.
 */
class TransformHandler3D {
  constructor(
    private cameraController: CameraController,
    private game: GameView,
    private scene: Scene,
  ) {}

  /**
   * Convert screen coordinates to game world coordinates.
   * Returns the tile Cell at the given screen position.
   */
  screenToWorldCoordinates(screenX: number, screenY: number): Cell {
    const worldPos = this.cameraController.screenToWorld(
      screenX,
      screenY,
      this.scene,
    );

    if (!worldPos) {
      // Return origin if no hit (matches 2D behavior of always returning a Cell)
      return new Cell(0, 0);
    }

    // Convert 3D world position (x, z) to game tile (x, y)
    const tileX = Math.floor(worldPos.x);
    const tileY = Math.floor(worldPos.z); // Note: game Y = 3D Z

    // Clamp to map bounds
    const clampedX = Math.max(0, Math.min(this.game.width() - 1, tileX));
    const clampedY = Math.max(0, Math.min(this.game.height() - 1, tileY));

    return new Cell(clampedX, clampedY);
  }
}

/**
 * Main 3D renderer using Babylon.js.
 * Replaces the Canvas 2D GameRenderer with WebGL rendering.
 */
export class BabylonRenderer {
  private engine: Engine;
  private scene: Scene;
  private cameraController: CameraController;
  private layers: Layer3D[] = [];
  private lastFrameTime: number = 0;

  // Compatibility properties for ClientGameRunner
  public uiState: UIState;
  public transformHandler: TransformHandler3D;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: GameView,
    private eventBus: EventBus,
  ) {
    // Initialize UI state (same as 2D renderer)
    this.uiState = {
      attackRatio: 20,
      ghostStructure: null,
      rocketDirectionUp: true,
    };
    // Create Babylon engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    // Create scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.1, 0.2, 1); // Dark blue background

    // Create camera
    this.cameraController = new CameraController(this.scene, canvas, {
      mapWidth: game.width(),
      mapHeight: game.height(),
      initialRadius: Math.max(game.width(), game.height()) * 0.6,
      maxRadius: Math.max(game.width(), game.height()) * 1.5,
    });

    // Create transform handler for coordinate conversion
    this.transformHandler = new TransformHandler3D(
      this.cameraController,
      game,
      this.scene,
    );

    // Create lighting
    this.setupLighting();

    // Create layers
    this.layers = [
      new TerrainLayer3D(game),
      // Future layers will be added here:
      // new StructureLayer3D(game),
      // new UnitLayer3D(game, eventBus),
      // new FxLayer3D(game),
    ];
  }

  /**
   * Set up scene lighting
   */
  private setupLighting(): void {
    // Ambient light from above
    const ambientLight = new HemisphericLight(
      "ambientLight",
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambientLight.intensity = 0.6;
    ambientLight.groundColor = new Color3(0.2, 0.2, 0.3);

    // Directional sun light
    const sunLight = new DirectionalLight(
      "sunLight",
      new Vector3(-0.5, -1, -0.5).normalize(),
      this.scene,
    );
    sunLight.intensity = 0.8;
    sunLight.diffuse = new Color3(1, 0.95, 0.8);

    // Future: add shadows
    // const shadowGenerator = new ShadowGenerator(2048, sunLight);
  }

  /**
   * Initialize the renderer and start the render loop.
   * Called after game is ready.
   */
  initialize(): void {
    // Initialize all layers
    for (const layer of this.layers) {
      layer.init(this.scene);
    }

    // Center camera on map
    this.cameraController.centerOnMap();

    // Handle window resize
    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    // Start render loop
    this.lastFrameTime = performance.now();
    this.engine.runRenderLoop(() => this.renderLoop());

    console.log(
      `[BabylonRenderer] Initialized with map size ${this.game.width()}x${this.game.height()}`,
    );
  }

  /**
   * Main render loop - called every frame
   */
  private renderLoop(): void {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Update layers
    for (const layer of this.layers) {
      layer.update?.(deltaTime);
    }

    // Render scene
    this.scene.render();
  }

  /**
   * Process game state updates.
   * Called by ClientGameRunner when game state changes.
   */
  tick(): void {
    // Note: layers receive updates via their tick() method
    // The GameView already has the updates available
    for (const layer of this.layers) {
      layer.tick(null); // Layers can query game state directly
    }
  }

  /**
   * Force a full redraw of all layers
   */
  redraw(): void {
    for (const layer of this.layers) {
      // Trigger full update with null to indicate redraw
      layer.tick(null);
    }
  }

  /**
   * Get the camera controller for external camera manipulation
   */
  getCamera(): CameraController {
    return this.cameraController;
  }

  /**
   * Get the Babylon scene for debugging/extensions
   */
  getScene(): Scene {
    return this.scene;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    for (const layer of this.layers) {
      layer.dispose();
    }
    this.cameraController.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
