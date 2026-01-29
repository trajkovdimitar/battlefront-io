import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { EventBus } from "../../../core/EventBus";
import { Theme } from "../../../core/configuration/Config";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { UserSettings } from "../../../core/game/UserSettings";
import { AlternateViewEvent } from "../../InputHandler";
import { renderTroops } from "../../Utils";
import {
  computeAllianceClipPath,
  createAllianceProgressIcon,
  getFirstPlacePlayer,
  getPlayerIcons,
} from "../../graphics/PlayerIcons";
import { CameraController } from "../CameraController";

/**
 * Tracks render state for a single player's name label
 */
class PlayerNameRender {
  public lastUpdate: number = 0;
  public icons: Map<string, HTMLElement> = new Map();

  constructor(
    public player: PlayerView,
    public element: HTMLDivElement,
    public iconsDiv: HTMLDivElement,
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
  private userSettings: UserSettings = new UserSettings();
  private firstPlace: PlayerView | null = null;

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

    // Add traitor flash animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes traitorFlash {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.2;
        }
      }
    `;
    this.container.appendChild(style);

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
    // Update first place player
    this.firstPlace = getFirstPlacePlayer(this.game);

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
    element.style.textAlign = "center";
    element.style.whiteSpace = "nowrap";
    element.style.gap = "0px";

    // Icons container (above the name)
    const iconsDiv = document.createElement("div");
    iconsDiv.style.display = "flex";
    iconsDiv.style.gap = "4px";
    iconsDiv.style.justifyContent = "center";
    iconsDiv.style.alignItems = "center";
    iconsDiv.style.zIndex = "2";
    iconsDiv.style.opacity = "0.8";
    element.appendChild(iconsDiv);

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
      new PlayerNameRender(player, element, iconsDiv, nameSpan, troopsSpan),
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

    // Project to screen using identity matrix since point is already in world space
    const screenPos = Vector3.Project(
      worldPos,
      Matrix.Identity(),
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

    // Match 2D sizing: use baseSize for font calculation, then apply a scale
    const baseSize = Math.max(1, Math.floor(nameLocation.size));
    const distanceScale = 500 / camera.radius;
    const effectiveSize = baseSize * distanceScale;

    // Hide if too small (matches 2D: size < 7)
    if (effectiveSize < 7) {
      render.element.style.display = "none";
      return;
    }

    // Hide if too large (very zoomed in on small territory)
    if (effectiveSize > 100 && camera.radius < 50) {
      render.element.style.display = "none";
      return;
    }

    // Match 2D: fontSize = baseSize * 0.4, then scale the element
    const fontSize = Math.max(4, Math.floor(baseSize * 0.4));
    const elementScale = Math.min(baseSize * 0.25, 3) * distanceScale;

    // Update styles
    const textColor = this.theme.textColor(render.player);
    render.nameSpan.style.color = textColor;
    render.nameSpan.style.fontSize = `${fontSize}px`;
    render.nameSpan.style.lineHeight = `${fontSize}px`;
    render.nameSpan.textContent = render.player.name();

    // Troops: same font size as name (matching 2D)
    render.troopsSpan.style.color = textColor;
    render.troopsSpan.style.fontSize = `${fontSize}px`;
    render.troopsSpan.style.marginTop = "-5%";
    render.troopsSpan.textContent = renderTroops(render.player.troops());

    // Update icons
    this.updateIcons(render, fontSize);

    // Position element with scale transform (matching 2D approach)
    render.element.style.left = `${screenPos.x}px`;
    render.element.style.top = `${screenPos.y}px`;
    render.element.style.transform = `translate(-50%, -50%) scale(${elementScale})`;
    render.element.style.display = "flex";
  }

  /**
   * Update status icons for a player
   */
  private updateIcons(render: PlayerNameRender, fontSize: number): void {
    const iconSize = Math.min(fontSize * 1.5, 48);

    const icons = getPlayerIcons({
      game: this.game,
      player: render.player,
      includeAllianceIcon: true,
      firstPlace: this.firstPlace,
    });

    // Build a set of desired icon IDs
    const desiredIconIds = new Set<string>(icons.map((icon) => icon.id));

    // Remove icons that are no longer needed
    for (const [id, element] of render.icons) {
      if (!desiredIconIds.has(id)) {
        element.remove();
        render.icons.delete(id);
      }
    }

    // Add or update icons
    for (const icon of icons) {
      if (icon.kind === "emoji" && icon.text) {
        let emojiDiv = render.icons.get(icon.id) as HTMLDivElement | undefined;

        if (!emojiDiv) {
          emojiDiv = document.createElement("div");
          emojiDiv.style.position = "absolute";
          emojiDiv.style.top = "50%";
          emojiDiv.style.transform = "translateY(-50%)";
          render.iconsDiv.appendChild(emojiDiv);
          render.icons.set(icon.id, emojiDiv);
        }

        emojiDiv.textContent = icon.text;
        emojiDiv.style.fontSize = `${iconSize}px`;
      } else if (icon.kind === "image" && icon.src) {
        // Special handling for alliance icon with progress indicator
        if (icon.id === "alliance") {
          this.updateAllianceIcon(render, iconSize);
          continue;
        }

        let imgElement = render.icons.get(icon.id) as
          | HTMLImageElement
          | undefined;

        if (!imgElement) {
          imgElement = this.createIconElement(icon.src, iconSize, icon.center);
          render.iconsDiv.appendChild(imgElement);
          render.icons.set(icon.id, imgElement);
        }

        // Update src if it changed
        if (imgElement.src !== icon.src) {
          imgElement.src = icon.src;
        }

        imgElement.style.width = `${iconSize}px`;
        imgElement.style.height = `${iconSize}px`;

        // Traitor flashing animation
        if (icon.id === "traitor") {
          const remainingTicks = render.player.getTraitorRemainingTicks();
          const remainingSeconds = Math.round((remainingTicks / 10) * 2) / 2;

          if (remainingSeconds <= 15) {
            const clampedSeconds = Math.max(0, Math.min(15, remainingSeconds));
            const normalizedTime = clampedSeconds / 15;
            const easedProgress = 1 - Math.pow(1 - normalizedTime, 3);
            const maxDuration = 1.0;
            const minDuration = 0.2;
            const duration =
              minDuration + (maxDuration - minDuration) * easedProgress;

            imgElement.style.animation = `traitorFlash ${duration.toFixed(2)}s infinite`;
            imgElement.style.animationTimingFunction = "ease-in-out";
          } else {
            imgElement.style.animation = "none";
          }
        }
      }
    }
  }

  /**
   * Update alliance icon with progress indicator
   */
  private updateAllianceIcon(render: PlayerNameRender, iconSize: number): void {
    const myPlayer = this.game.myPlayer();
    const allianceView = myPlayer
      ?.alliances()
      .find((a) => a.other === render.player.id());

    let fraction = 0;
    let hasExtensionRequest = false;
    if (allianceView) {
      const remaining = Math.max(0, allianceView.expiresAt - this.game.ticks());
      const duration = Math.max(1, this.game.config().allianceDuration());
      fraction = Math.max(0, Math.min(1, remaining / duration));
      hasExtensionRequest = allianceView.hasExtensionRequest;
    }

    let allianceWrapper = render.icons.get("alliance") as
      | HTMLDivElement
      | undefined;

    if (!allianceWrapper) {
      allianceWrapper = createAllianceProgressIcon(
        iconSize,
        fraction,
        hasExtensionRequest,
        this.userSettings.darkMode(),
      );
      render.iconsDiv.appendChild(allianceWrapper);
      render.icons.set("alliance", allianceWrapper);
    } else {
      allianceWrapper.style.width = `${iconSize}px`;
      allianceWrapper.style.height = `${iconSize}px`;
      allianceWrapper.style.flexShrink = "0";

      const overlay = allianceWrapper.querySelector(
        ".alliance-progress-overlay",
      ) as HTMLDivElement | null;
      if (overlay) {
        overlay.style.clipPath = computeAllianceClipPath(fraction);
      }

      const questionMark = allianceWrapper.querySelector(
        ".alliance-question-mark",
      ) as HTMLImageElement | null;
      if (questionMark) {
        questionMark.style.display = hasExtensionRequest ? "block" : "none";
      }

      const imgs = allianceWrapper.getElementsByTagName("img");
      for (const img of imgs) {
        img.style.width = `${iconSize}px`;
        img.style.height = `${iconSize}px`;
      }
    }
  }

  private createIconElement(
    src: string,
    size: number,
    center: boolean = false,
  ): HTMLImageElement {
    const icon = document.createElement("img");
    icon.src = src;
    icon.style.width = `${size}px`;
    icon.style.height = `${size}px`;
    icon.setAttribute("dark-mode", this.userSettings.darkMode().toString());
    if (center) {
      icon.style.position = "absolute";
      icon.style.top = "50%";
      icon.style.transform = "translateY(-50%)";
    }
    return icon;
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
