import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

// Import Ray as side effect - required for createPickingRay to work
import "@babylonjs/core/Culling/ray";

export interface CameraConfig {
  /** Initial distance from target */
  initialRadius: number;
  /** Minimum zoom distance */
  minRadius: number;
  /** Maximum zoom distance */
  maxRadius: number;
  /** Initial vertical angle (radians from top) */
  initialBeta: number;
  /** Initial horizontal angle */
  initialAlpha: number;
  /** Minimum vertical angle (prevent going under terrain) */
  minBeta: number;
  /** Maximum vertical angle (prevent too flat view) */
  maxBeta: number;
  /** Map bounds for panning limits */
  mapWidth: number;
  mapHeight: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  initialRadius: 500,
  minRadius: 50,
  maxRadius: 2000,
  initialBeta: 0.01, // Nearly straight down (top-down view like 2D)
  initialAlpha: -Math.PI / 2, // Looking down -Z axis
  minBeta: 0.01, // Allow nearly straight down
  maxBeta: Math.PI / 2.5, // ~72 degrees (not quite flat)
  mapWidth: 1000,
  mapHeight: 1000,
};

/**
 * 2D-style camera controller for 3D renderer.
 * Default top-down view that feels like the 2D version.
 *
 * Controls:
 * - Left-click drag: Pan across the map (like 2D version)
 * - WASD / Arrow keys: Pan camera
 * - Scroll wheel: Zoom in/out
 * - Alt + Left-drag: Rotate camera (to view 3D structures)
 * - Home key: Reset to default top-down view
 * - Right-click: Reserved for game menu (no camera action)
 */
export class CameraController {
  private camera: ArcRotateCamera;
  private config: CameraConfig;
  private scene: Scene;

  // For Alt+drag rotation
  private isAltDown: boolean = false;
  private isRotating: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private pointerInput: { buttons: number[] } | null = null;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    config: Partial<CameraConfig> = {},
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create arc rotate camera
    // Alpha = horizontal rotation, Beta = vertical angle, Radius = distance
    this.camera = new ArcRotateCamera(
      "mainCamera",
      this.config.initialAlpha,
      this.config.initialBeta,
      this.config.initialRadius,
      new Vector3(this.config.mapWidth / 2, 0, this.config.mapHeight / 2),
      scene,
    );

    // Attach controls but we'll customize them
    this.camera.attachControl(canvas, true);

    // Configure zoom limits
    this.camera.lowerRadiusLimit = this.config.minRadius;
    this.camera.upperRadiusLimit = this.config.maxRadius;

    // Configure vertical angle limits
    this.camera.lowerBetaLimit = this.config.minBeta;
    this.camera.upperBetaLimit = this.config.maxBeta;

    // Pan speed and inertia
    this.camera.panningSensibility = 50;
    this.camera.inertia = 0.7;

    // Zoom speed
    this.camera.wheelPrecision = 0.5;
    this.camera.pinchPrecision = 50;

    // Only pan on X-Z plane
    this.camera.panningAxis = new Vector3(1, 0, 1);

    // Disable default rotation (we'll handle it with Alt+drag)
    this.camera.angularSensibilityX = Number.MAX_SAFE_INTEGER;
    this.camera.angularSensibilityY = Number.MAX_SAFE_INTEGER;

    // Configure mouse buttons:
    // Button 0 (left) = pan (like 2D version)
    // Button 1 (middle) = also pan
    // Button 2 (right) = no action (menu handled elsewhere)
    this.pointerInput = this.camera.inputs.attached.pointers as unknown as {
      buttons: number[];
    };
    if (this.pointerInput) {
      this.pointerInput.buttons = [0, 1]; // Left and middle mouse for panning
    }

    // Keyboard controls (WASD for panning)
    this.camera.keysUp = [87, 38]; // W, Up arrow
    this.camera.keysDown = [83, 40]; // S, Down arrow
    this.camera.keysLeft = [65, 37]; // A, Left arrow
    this.camera.keysRight = [68, 39]; // D, Right arrow

    // Set up custom input handling for Alt+drag rotation and Home key
    this.setupCustomInputs();
  }

  /**
   * Set up custom keyboard and pointer inputs
   */
  private setupCustomInputs(): void {
    // Track Alt key state
    this.scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.event.key === "Alt") {
        if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
          this.isAltDown = true;
          // Disable left-click pan when Alt is held (so rotation works)
          if (this.pointerInput) {
            this.pointerInput.buttons = [1]; // Only middle mouse
          }
        } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
          this.isAltDown = false;
          this.isRotating = false;
          // Re-enable left-click pan
          if (this.pointerInput) {
            this.pointerInput.buttons = [0, 1]; // Left and middle mouse
          }
        }
      }

      // Home key to reset camera
      if (
        kbInfo.type === KeyboardEventTypes.KEYDOWN &&
        kbInfo.event.key === "Home"
      ) {
        this.resetToDefault();
      }
    });

    // Handle Alt+drag rotation
    this.scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          if (this.isAltDown && pointerInfo.event.button === 0) {
            this.isRotating = true;
            this.lastPointerX = pointerInfo.event.clientX;
            this.lastPointerY = pointerInfo.event.clientY;
          }
          break;

        case PointerEventTypes.POINTERUP:
          this.isRotating = false;
          break;

        case PointerEventTypes.POINTERMOVE:
          if (this.isRotating && this.isAltDown) {
            const deltaX = pointerInfo.event.clientX - this.lastPointerX;
            const deltaY = pointerInfo.event.clientY - this.lastPointerY;

            // Rotate camera (adjust sensitivity as needed)
            this.camera.alpha -= deltaX * 0.005;
            this.camera.beta -= deltaY * 0.005;

            // Clamp beta to limits
            this.camera.beta = Math.max(
              this.config.minBeta,
              Math.min(this.config.maxBeta, this.camera.beta),
            );

            this.lastPointerX = pointerInfo.event.clientX;
            this.lastPointerY = pointerInfo.event.clientY;
          }
          break;
      }
    });
  }

  /**
   * Reset camera to default top-down RTS view
   */
  resetToDefault(): void {
    this.camera.alpha = this.config.initialAlpha;
    this.camera.beta = this.config.initialBeta;
  }

  /**
   * Get the Babylon camera instance
   */
  getCamera(): ArcRotateCamera {
    return this.camera;
  }

  /**
   * Move camera to look at a specific world position
   */
  goToPosition(x: number, z: number, animate: boolean = true): void {
    const target = new Vector3(x, 0, z);
    if (animate) {
      // Smooth transition
      this.camera.setTarget(target);
    } else {
      this.camera.target = target;
    }
  }

  /**
   * Center camera on the entire map
   */
  centerOnMap(): void {
    const centerX = this.config.mapWidth / 2;
    const centerZ = this.config.mapHeight / 2;
    this.goToPosition(centerX, centerZ, false);

    // Adjust radius to fit map
    const maxDimension = Math.max(this.config.mapWidth, this.config.mapHeight);
    this.camera.radius = Math.min(maxDimension * 0.8, this.config.maxRadius);
  }

  /**
   * Update map bounds (call when map changes)
   */
  setMapBounds(width: number, height: number): void {
    this.config.mapWidth = width;
    this.config.mapHeight = height;
  }

  /**
   * Convert screen coordinates to world position on the terrain plane (Y=0)
   * Returns null if the ray doesn't hit the ground plane
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    scene: Scene,
  ): Vector3 | null {
    const ray = scene.createPickingRay(
      screenX,
      screenY,
      null,
      this.camera,
      false,
    );

    // Intersect with Y=0 plane
    if (ray.direction.y === 0) return null;

    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;

    return ray.origin.add(ray.direction.scale(t));
  }

  /**
   * Get current zoom level (0 = max zoomed out, 1 = max zoomed in)
   */
  getZoomLevel(): number {
    const range = this.config.maxRadius - this.config.minRadius;
    return 1 - (this.camera.radius - this.config.minRadius) / range;
  }

  /**
   * Set zoom level (0 = max zoomed out, 1 = max zoomed in)
   */
  setZoomLevel(level: number): void {
    const range = this.config.maxRadius - this.config.minRadius;
    this.camera.radius = this.config.maxRadius - level * range;
  }

  dispose(): void {
    this.camera.dispose();
  }
}
