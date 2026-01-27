import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Scene } from "@babylonjs/core/scene";

import { UnitType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";
import { Layer3D } from "./Layer3D";

/** Effect types that trigger particle effects */
const EXPLOSION_UNIT_TYPES = new Set<UnitType>([
  UnitType.Shell,
  UnitType.SAMMissile,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.MIRVWarhead,
]);

/** Configuration for explosion effects */
interface ExplosionConfig {
  particleCount: number;
  minSize: number;
  maxSize: number;
  minLifeTime: number;
  maxLifeTime: number;
  emitRate: number;
  duration: number;
  color1: Color4;
  color2: Color4;
  colorDead: Color4;
}

/** Active particle system info */
interface ActiveExplosion {
  system: ParticleSystem;
  startTime: number;
  duration: number;
}

/**
 * Renders visual effects (explosions, particles) in 3D.
 * Uses Babylon.js ParticleSystem for realistic explosions.
 */
export class FxLayer3D implements Layer3D {
  private scene: Scene | null = null;
  private fxParent: TransformNode | null = null;

  /** Active particle systems */
  private activeExplosions: ActiveExplosion[] = [];

  /** Track which units we've already created explosions for */
  private explodedUnits = new Set<number>();

  /** Particle texture */
  private particleTexture: Texture | null = null;

  /** Explosion configurations */
  private readonly explosionConfigs: Map<string, ExplosionConfig>;

  constructor(private game: GameView) {
    // Configure different explosion types
    this.explosionConfigs = new Map([
      [
        "mini", // Shells, small impacts
        {
          particleCount: 50,
          minSize: 0.5,
          maxSize: 2,
          minLifeTime: 0.2,
          maxLifeTime: 0.5,
          emitRate: 200,
          duration: 300,
          color1: new Color4(1, 0.8, 0.2, 1), // Bright yellow
          color2: new Color4(1, 0.3, 0, 1), // Orange
          colorDead: new Color4(0.3, 0.1, 0, 0), // Dark, transparent
        },
      ],
      [
        "sam", // SAM intercept
        {
          particleCount: 100,
          minSize: 1,
          maxSize: 4,
          minLifeTime: 0.3,
          maxLifeTime: 0.8,
          emitRate: 300,
          duration: 500,
          color1: new Color4(1, 1, 0.5, 1), // Bright white-yellow
          color2: new Color4(1, 0.5, 0, 1), // Orange
          colorDead: new Color4(0.5, 0.2, 0, 0),
        },
      ],
      [
        "nuke", // Nuclear explosions
        {
          particleCount: 500,
          minSize: 2,
          maxSize: 15,
          minLifeTime: 0.5,
          maxLifeTime: 2,
          emitRate: 1000,
          duration: 1500,
          color1: new Color4(1, 1, 0.8, 1), // White hot
          color2: new Color4(1, 0.4, 0, 1), // Deep orange
          colorDead: new Color4(0.2, 0, 0, 0), // Dark red, transparent
        },
      ],
      [
        "hydrogen", // Hydrogen bomb - bigger
        {
          particleCount: 1000,
          minSize: 3,
          maxSize: 25,
          minLifeTime: 0.8,
          maxLifeTime: 3,
          emitRate: 2000,
          duration: 2500,
          color1: new Color4(1, 1, 1, 1), // Pure white
          color2: new Color4(1, 0.6, 0.2, 1), // Bright orange
          colorDead: new Color4(0.3, 0.1, 0, 0),
        },
      ],
    ]);
  }

  init(scene: Scene): void {
    this.scene = scene;
    this.fxParent = new TransformNode("fx", scene);

    // Create a simple particle texture (white circle)
    this.particleTexture = new Texture(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABF0lEQVRYhe2WsQ6CMBCG/1IHN8bBxAG3+gxufhx3xnfiHYwDxhUHByA4uAiJg0HQhUJqaQnYNsR/adL7ev26XQvkOhfAGsARwBrAiNLDDeABwB3ADMA+pVcrABcAVZXrPgFsk+p1K4BHkuYqLQEcqVy3AhglcZeJGoDYxAaAWCKtJOoxALGJLQCxRGpJVGMAYhNbAGKJtJKoxQDEJrYAxBJpJVGNAYhNbAGIJdJKohIDEJvYAhBLpJVEJQYgNrEFIJZIK4lyDEBsYgtALJFWEuUYgNjEFoBYIq0kSjEAsYktALFEWkmUYgBiE1sAYom0kijGAMQmtgDEEmklUYgBiE1sAQgl0kqiIAPwh8QGgFAirSS+AZqv8xvFEPmVAAAAAElFTkSuQmCC",
      scene,
    );
  }

  tick(): void {
    if (!this.scene) return;

    // Process unit updates for explosions
    const updates = this.game.updatesSinceLastTick();
    const unitUpdates = updates?.[GameUpdateType.Unit];

    if (unitUpdates) {
      for (const update of unitUpdates) {
        const unitView = this.game.unit(update.id);
        if (!unitView) continue;

        // Check if this unit type triggers explosions
        if (!EXPLOSION_UNIT_TYPES.has(unitView.type())) continue;

        // Only trigger explosion when unit becomes inactive (detonates/impacts)
        if (!unitView.isActive() && !this.explodedUnits.has(update.id)) {
          this.explodedUnits.add(update.id);
          this.createExplosion(unitView);
        }
      }
    }

    // Clean up finished explosions
    const now = performance.now();
    this.activeExplosions = this.activeExplosions.filter((exp) => {
      if (now - exp.startTime > exp.duration) {
        exp.system.dispose();
        return false;
      }
      return true;
    });

    // Clean up old exploded unit IDs periodically
    if (this.explodedUnits.size > 1000) {
      this.explodedUnits.clear();
    }
  }

  private createExplosion(unit: UnitView): void {
    if (!this.scene || !this.particleTexture) return;

    // Get position
    const gameX = this.game.x(unit.lastTile());
    const gameY = this.game.y(unit.lastTile());
    const worldX = gameX;
    const worldZ = this.game.height() - 1 - gameY;

    // Determine explosion type
    let configKey = "mini";
    let worldY = 5;

    switch (unit.type()) {
      case UnitType.Shell:
        configKey = "mini";
        worldY = 2;
        break;
      case UnitType.SAMMissile:
        configKey = "sam";
        worldY = 15;
        break;
      case UnitType.AtomBomb:
      case UnitType.MIRVWarhead:
        configKey = "nuke";
        worldY = 5;
        break;
      case UnitType.HydrogenBomb:
        configKey = "hydrogen";
        worldY = 5;
        break;
      case UnitType.MIRV:
        configKey = "nuke";
        worldY = 15;
        break;
    }

    const config = this.explosionConfigs.get(configKey);
    if (!config) return;

    // Create particle system
    const system = new ParticleSystem(
      `explosion_${unit.id()}`,
      config.particleCount,
      this.scene,
    );

    system.particleTexture = this.particleTexture;

    // Emission
    system.emitter = new Vector3(worldX, worldY, worldZ);
    system.minEmitBox = new Vector3(-1, -1, -1);
    system.maxEmitBox = new Vector3(1, 1, 1);

    // Particle properties
    system.minSize = config.minSize;
    system.maxSize = config.maxSize;
    system.minLifeTime = config.minLifeTime;
    system.maxLifeTime = config.maxLifeTime;

    // Colors
    system.color1 = config.color1;
    system.color2 = config.color2;
    system.colorDead = config.colorDead;

    // Emission rate and direction
    system.emitRate = config.emitRate;
    system.direction1 = new Vector3(-3, 5, -3);
    system.direction2 = new Vector3(3, 10, 3);

    // Gravity (particles rise then fall)
    system.gravity = new Vector3(0, -5, 0);

    // Speed
    system.minEmitPower = 2;
    system.maxEmitPower = 8;

    // Angular speed for rotation
    system.minAngularSpeed = 0;
    system.maxAngularSpeed = Math.PI;

    // Blending
    system.blendMode = ParticleSystem.BLENDMODE_ADD;

    // Start and stop after duration
    system.targetStopDuration = config.duration / 1000;
    system.start();

    this.activeExplosions.push({
      system,
      startTime: performance.now(),
      duration: config.duration + 2000, // Extra time for particles to fade
    });
  }

  update(deltaTime: number): void {
    // Particle systems update automatically
  }

  dispose(): void {
    for (const exp of this.activeExplosions) {
      exp.system.dispose();
    }
    this.activeExplosions = [];
    this.particleTexture?.dispose();
    this.fxParent?.dispose();
    this.explodedUnits.clear();
  }
}
