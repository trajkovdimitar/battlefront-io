import { Camera } from "@babylonjs/core/Cameras/camera";
import { Effect } from "@babylonjs/core/Materials/effect";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Scene } from "@babylonjs/core/scene";
import { GameView, PlayerView } from "../../../core/game/GameView";

// Register the custom shader
Effect.ShadersStore["borderVertexShader"] = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 worldViewProjection;
  varying vec2 vUV;
  void main(void) {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vUV = uv;
  }
`;

Effect.ShadersStore["borderFragmentShader"] = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler;    // Scene render
  uniform sampler2D ownershipSampler;  // Ownership texture
  uniform vec2 texelSize;              // 1.0 / texture dimensions
  uniform vec3 borderColor;
  uniform float borderWidth;
  uniform float borderAlpha;

  // Check if two ownership values represent different owners (both must be owned)
  float differentOwners(float a, float b) {
    // Both must be owned (> 0.01) and different from each other
    float aOwned = step(0.01, a);
    float bOwned = step(0.01, b);
    float bothOwned = aOwned * bOwned;
    float different = step(0.01, abs(a - b));
    return bothOwned * different;
  }

  void main(void) {
    vec4 sceneColor = texture2D(textureSampler, vUV);

    // Sample ownership at current pixel and neighbors
    float current = texture2D(ownershipSampler, vUV).r;

    // Sample in a cross pattern for edge detection
    float right = texture2D(ownershipSampler, vUV + vec2(texelSize.x, 0.0)).r;
    float left = texture2D(ownershipSampler, vUV - vec2(texelSize.x, 0.0)).r;
    float up = texture2D(ownershipSampler, vUV + vec2(0.0, texelSize.y)).r;
    float down = texture2D(ownershipSampler, vUV - vec2(0.0, texelSize.y)).r;

    // Also sample diagonals for smoother corners
    float topRight = texture2D(ownershipSampler, vUV + vec2(texelSize.x, texelSize.y)).r;
    float topLeft = texture2D(ownershipSampler, vUV + vec2(-texelSize.x, texelSize.y)).r;
    float bottomRight = texture2D(ownershipSampler, vUV + vec2(texelSize.x, -texelSize.y)).r;
    float bottomLeft = texture2D(ownershipSampler, vUV + vec2(-texelSize.x, -texelSize.y)).r;

    // Only detect edges where TWO DIFFERENT OWNERS meet (not owned vs unowned)
    float edge = 0.0;
    edge += differentOwners(current, right);
    edge += differentOwners(current, left);
    edge += differentOwners(current, up);
    edge += differentOwners(current, down);
    // Diagonals with less weight
    edge += differentOwners(current, topRight) * 0.5;
    edge += differentOwners(current, topLeft) * 0.5;
    edge += differentOwners(current, bottomRight) * 0.5;
    edge += differentOwners(current, bottomLeft) * 0.5;

    // Normalize and apply smoothstep for anti-aliasing
    edge = smoothstep(0.0, 1.0, edge);

    // Blend border color with scene
    vec3 finalColor = mix(sceneColor.rgb, borderColor, edge * borderAlpha);

    gl_FragColor = vec4(finalColor, sceneColor.a);
  }
`;

/**
 * Post-process effect that renders smooth territory borders
 * using edge detection on an ownership texture.
 */
export class BorderPostProcess {
  private postProcess: PostProcess | null = null;
  private ownershipTexture: DynamicTexture | null = null;
  private scene: Scene;
  private game: GameView;

  // Configuration
  private borderColor = [0.1, 0.1, 0.1]; // Dark gray
  private borderWidth = 1.0;
  private borderAlpha = 0.9;

  // Track updates
  private needsUpdate = true;

  constructor(scene: Scene, camera: Camera, game: GameView) {
    this.scene = scene;
    this.game = game;

    this.createOwnershipTexture();
    this.createPostProcess(camera);
  }

  /**
   * Create the ownership texture - each pixel represents one tile
   */
  private createOwnershipTexture(): void {
    const width = this.game.width();
    const height = this.game.height();

    // Create dynamic texture at map resolution
    this.ownershipTexture = new DynamicTexture(
      "ownershipTexture",
      { width, height },
      this.scene,
      false, // No mipmaps
    );

    // Use nearest neighbor sampling for crisp edges
    this.ownershipTexture.updateSamplingMode(1); // NEAREST
  }

  /**
   * Create the post-process effect
   */
  private createPostProcess(camera: Camera): void {
    if (!this.ownershipTexture) return;

    const width = this.game.width();
    const height = this.game.height();

    this.postProcess = new PostProcess(
      "borderPostProcess",
      "border",
      ["texelSize", "borderColor", "borderWidth", "borderAlpha"],
      ["ownershipSampler"],
      1.0,
      camera,
      1, // NEAREST sampling
      this.scene.getEngine(),
    );

    this.postProcess.onApply = (effect) => {
      effect.setTexture("ownershipSampler", this.ownershipTexture!);
      effect.setFloat2("texelSize", 1.0 / width, 1.0 / height);
      effect.setFloat3(
        "borderColor",
        this.borderColor[0],
        this.borderColor[1],
        this.borderColor[2],
      );
      effect.setFloat("borderWidth", this.borderWidth);
      effect.setFloat("borderAlpha", this.borderAlpha);
    };
  }

  /**
   * Update the ownership texture with current game state
   */
  updateOwnership(): void {
    if (!this.ownershipTexture) return;

    const ctx = this.ownershipTexture.getContext();
    const width = this.game.width();
    const height = this.game.height();

    // Clear to black (no owner)
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);

    // Create ImageData for direct pixel manipulation (faster)
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Fill ownership data
    // Each player gets a unique grayscale value
    const playerValues = new Map<string, number>();
    let nextValue = 30; // Start at 30 to leave room for "no owner" (0)

    for (let gameY = 0; gameY < height; gameY++) {
      for (let gameX = 0; gameX < width; gameX++) {
        const ref = this.game.ref(gameX, gameY);

        if (this.game.hasOwner(ref)) {
          const owner = this.game.owner(ref) as PlayerView;
          const ownerId = owner.id();

          // Assign unique value to each player
          if (!playerValues.has(ownerId)) {
            playerValues.set(ownerId, nextValue);
            nextValue += 30; // Space values apart for clear differentiation
            if (nextValue > 255) nextValue = 30; // Wrap around
          }

          const value = playerValues.get(ownerId)!;

          // Note: texture Y is flipped relative to game Y
          const texY = height - 1 - gameY;
          const idx = (texY * width + gameX) * 4;

          data[idx] = value; // R
          data[idx + 1] = value; // G
          data[idx + 2] = value; // B
          data[idx + 3] = 255; // A
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.ownershipTexture.update();
    this.needsUpdate = false;
  }

  /**
   * Mark ownership as needing update
   */
  markDirty(): void {
    this.needsUpdate = true;
  }

  /**
   * Check if update is needed and perform it
   */
  tick(): void {
    if (this.needsUpdate) {
      this.updateOwnership();
    }
  }

  /**
   * Set border color
   */
  setBorderColor(r: number, g: number, b: number): void {
    this.borderColor = [r, g, b];
  }

  /**
   * Set border opacity
   */
  setBorderAlpha(alpha: number): void {
    this.borderAlpha = alpha;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.postProcess?.dispose();
    this.ownershipTexture?.dispose();
  }
}
