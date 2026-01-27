import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { EventBus } from "../../../core/EventBus";
import { Theme } from "../../../core/configuration/Config";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { AlternateViewEvent } from "../../InputHandler";
import { renderTroops } from "../../Utils";
import { CameraController } from "../CameraController";

/**
 * Tracks render state for a single player's name label
 */
class PlayerNameRender {
  public lastUpdate: number = 0;

  constructor(
    public player: PlayerView,
    public element: HTMLDivElement,
    public nameSpan: HTMLSpanElement,
    public troopsSpan: HTMLSpanElement,
  ) {}
}

/**
 * Renders player names on territories in 3D space.
 * Uses HTML overlay elements positioned via 3D-to-screen projection.
 */
export class NameLayer3D {
  private container: HTMLDivElement | null = null;
  private renders: Map<string, PlayerNameRender> = new Map();
  private theme: Theme;
  private isVisible: boolean = true;
  private lastTick: number = 0;
  private tickInterval: number = 100; // Update positions every 100ms

  constructor(
    private game: GameView,
    private scene: Scene,
    private cameraController: CameraController,
    private eventBus: EventBus,
  ) {
    this.theme = this.game.config().theme();
  }

  init(): void {
    // Create container for name labels
    this.container = document.createElement("div");
    this.container.id = "name-layer-3d";
    this.container.style.position = "fixed";
    this.container.style.left = "0";
    this.container.style.top = "0";
    this.container.style.width = "100%";
    this.container.style.height = "100%";
    this.container.style.pointerEvents = "none";
    this.container.style.zIndex = "2";
    this.container.style.overflow = "hidden";
    document.body.appendChild(this.container);

    // Listen for alternate view toggle (Ctrl key)
    this.eventBus.on(AlternateViewEvent, (e) => {
      this.isVisible = !e.alternateView;
      this.updateAllVisibility();
    });
  }

  /**
   * Called each game tick to check for new players
   */
  tick(): void {
    // Add new players
    for (const player of this.game.playerViews()) {
      if (player.isAlive() && !this.renders.has(player.id())) {
        this.createPlayerLabel(player);
      }
    }

    // Remove dead players
    for (const [id, render] of this.renders) {
      if (!render.player.isAlive()) {
        render.element.remove();
        this.renders.delete(id);
      }
    }
  }

  /**
   * Called each frame to update label positions
   */
  update(): void {
    if (!this.container || !this.isVisible) return;

    const now = performance.now();
    if (now - this.lastTick < this.tickInterval) return;
    this.lastTick = now;

    const camera = this.cameraController.getCamera();
    const engine = this.scene.getEngine();

    for (const render of this.renders.values()) {
      this.updatePlayerLabel(render, camera, engine);
    }
  }

  /**
   * Create HTML elements for a player's name label
   */
  private createPlayerLabel(player: PlayerView): void {
    if (!this.container) return;

    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.display = "none"; // Start hidden
    element.style.flexDirection = "column";
    element.style.alignItems = "center";
    element.style.transform = "translate(-50%, -50%)";
    element.style.textAlign = "center";
    element.style.whiteSpace = "nowrap";

    // Player name
    const nameSpan = document.createElement("span");
    nameSpan.style.fontFamily = this.theme.font();
    nameSpan.style.fontWeight = "bold";
    nameSpan.style.textShadow = "1px 1px 2px rgba(0,0,0,0.5)";
    nameSpan.textContent = player.name();
    element.appendChild(nameSpan);

    // Troops count
    const troopsSpan = document.createElement("span");
    troopsSpan.style.fontFamily = this.theme.font();
    troopsSpan.style.textShadow = "1px 1px 2px rgba(0,0,0,0.5)";
    troopsSpan.setAttribute("translate", "no");
    element.appendChild(troopsSpan);

    this.container.appendChild(element);

    this.renders.set(
      player.id(),
      new PlayerNameRender(player, element, nameSpan, troopsSpan),
    );
  }

  /**
   * Update a player label's position and visibility
   */
  private updatePlayerLabel(
    render: PlayerNameRender,
    camera: ArcRotateCamera,
    engine: { getRenderWidth(): number; getRenderHeight(): number },
  ): void {
    const nameLocation = render.player.nameLocation();
    if (!nameLocation) {
      render.element.style.display = "none";
      return;
    }

    // Convert game coordinates to 3D world position
    const worldX = nameLocation.x;
    const worldZ = this.game.height() - 1 - nameLocation.y;
    const worldY = 5; // Slightly above terrain
    const worldPos = new Vector3(worldX, worldY, worldZ);

    // Project to screen
    const screenPos = Vector3.Project(
      worldPos,
      camera.getWorldMatrix(),
      this.scene.getTransformMatrix(),
      camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      ),
    );

    // Check if behind camera (z > 1 means behind)
    if (screenPos.z > 1 || screenPos.z < 0) {
      render.element.style.display = "none";
      return;
    }

    // Check if off screen
    const margin = 50;
    if (
      screenPos.x < -margin ||
      screenPos.x > engine.getRenderWidth() + margin ||
      screenPos.y < -margin ||
      screenPos.y > engine.getRenderHeight() + margin
    ) {
      render.element.style.display = "none";
      return;
    }

    // Calculate effective scale based on camera distance and territory size
    const baseSize = Math.max(1, nameLocation.size);
    const distanceScale = 500 / camera.radius; // Larger when zoomed in
    const effectiveSize = baseSize * distanceScale;

    // Hide if too small
    if (effectiveSize < 5) {
      render.element.style.display = "none";
      return;
    }

    // Hide if too large (very zoomed in on small territory)
    if (effectiveSize > 200 && camera.radius < 100) {
      render.element.style.display = "none";
      return;
    }

    // Calculate font size based on effective size
    const fontSize = Math.max(8, Math.min(32, effectiveSize * 0.4));

    // Update styles
    const textColor = this.theme.textColor(render.player);
    render.nameSpan.style.color = textColor;
    render.nameSpan.style.fontSize = `${fontSize}px`;
    render.nameSpan.textContent = render.player.name();

    render.troopsSpan.style.color = textColor;
    render.troopsSpan.style.fontSize = `${fontSize * 0.8}px`;
    render.troopsSpan.textContent = renderTroops(render.player.troops());

    // Position element
    render.element.style.left = `${screenPos.x}px`;
    render.element.style.top = `${screenPos.y}px`;
    render.element.style.display = "flex";
  }

  /**
   * Update visibility of all labels
   */
  private updateAllVisibility(): void {
    for (const render of this.renders.values()) {
      if (!this.isVisible) {
        render.element.style.display = "none";
      }
    }
  }

  dispose(): void {
    this.container?.remove();
    this.renders.clear();
  }
}
