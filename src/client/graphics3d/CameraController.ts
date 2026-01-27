import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

export interface CameraConfig {
  /** Initial distance from target */
  initialRadius: number;
  /** Minimum zoom distance */
  minRadius: number;
  /** Maximum zoom distance */
  maxRadius: number;
  /** Initial vertical angle (radians from top) */
  initialBeta: number;
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
  initialBeta: Math.PI / 4, // 45 degrees from top
  minBeta: 0.1,
  maxBeta: Math.PI / 2.5, // ~72 degrees (not quite flat)
  mapWidth: 1000,
  mapHeight: 1000,
};

/**
 * RTS-style camera controller.
 * Provides pan, zoom, and tilt controls for viewing the battlefield.
 */
export class CameraController {
  private camera: ArcRotateCamera;
  private config: CameraConfig;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    config: Partial<CameraConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create arc rotate camera
    // Alpha = horizontal rotation, Beta = vertical angle, Radius = distance
    this.camera = new ArcRotateCamera(
      "mainCamera",
      -Math.PI / 2, // Alpha: looking down -Z axis initially
      this.config.initialBeta,
      this.config.initialRadius,
      new Vector3(this.config.mapWidth / 2, 0, this.config.mapHeight / 2), // Target center of map
      scene,
    );

    // Attach controls to canvas
    this.camera.attachControl(canvas, true);

    // Configure zoom limits
    this.camera.lowerRadiusLimit = this.config.minRadius;
    this.camera.upperRadiusLimit = this.config.maxRadius;

    // Configure vertical angle limits
    this.camera.lowerBetaLimit = this.config.minBeta;
    this.camera.upperBetaLimit = this.config.maxBeta;

    // Pan speed and inertia
    this.camera.panningSensibility = 50;
    this.camera.inertia = 0.9;

    // Zoom speed
    this.camera.wheelPrecision = 1;
    this.camera.pinchPrecision = 50;

    // Enable panning with right mouse button
    this.camera.panningAxis = new Vector3(1, 0, 1); // Only pan on X-Z plane

    // Keyboard controls (WASD for panning)
    this.camera.keysUp = [87]; // W
    this.camera.keysDown = [83]; // S
    this.camera.keysLeft = [65]; // A
    this.camera.keysRight = [68]; // D
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
