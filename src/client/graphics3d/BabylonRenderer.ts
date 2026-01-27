import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

// Import shaders as side effects - required for tree-shaking builds
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/default.vertex";

import { EventBus } from "../../core/EventBus";
import { GameView } from "../../core/game/GameView";
import { UserSettings } from "../../core/game/UserSettings";
import { GameStartingModal } from "../GameStartingModal";
import { UIState } from "../graphics/UIState";
import { AlertFrame } from "../graphics/layers/AlertFrame";
import { BuildMenu } from "../graphics/layers/BuildMenu";
import { ChatDisplay } from "../graphics/layers/ChatDisplay";
import { ChatModal } from "../graphics/layers/ChatModal";
import { ControlPanel } from "../graphics/layers/ControlPanel";
import { EmojiTable } from "../graphics/layers/EmojiTable";
import { EventsDisplay } from "../graphics/layers/EventsDisplay";
import { GameLeftSidebar } from "../graphics/layers/GameLeftSidebar";
import { GameRightSidebar } from "../graphics/layers/GameRightSidebar";
import { HeadsUpMessage } from "../graphics/layers/HeadsUpMessage";
import { ImmunityTimer } from "../graphics/layers/ImmunityTimer";
import { Layer } from "../graphics/layers/Layer";
import { Leaderboard } from "../graphics/layers/Leaderboard";
import { MainRadialMenu } from "../graphics/layers/MainRadialMenu";
import { MultiTabModal } from "../graphics/layers/MultiTabModal";
import { PerformanceOverlay } from "../graphics/layers/PerformanceOverlay";
import { PlayerInfoOverlay } from "../graphics/layers/PlayerInfoOverlay";
import { PlayerPanel } from "../graphics/layers/PlayerPanel";
import { ReplayPanel } from "../graphics/layers/ReplayPanel";
import { SettingsModal } from "../graphics/layers/SettingsModal";
import { SpawnTimer } from "../graphics/layers/SpawnTimer";
import { TeamStats } from "../graphics/layers/TeamStats";
import { UnitDisplay } from "../graphics/layers/UnitDisplay";
import { WinModal } from "../graphics/layers/WinModal";
import { BuildHandler3D } from "./BuildHandler3D";
import { CameraController } from "./CameraController";
import { TransformHandler3D } from "./TransformHandler3D";
import { FxLayer3D } from "./layers/FxLayer3D";
import { Layer3D } from "./layers/Layer3D";
import { StructureLayer3D } from "./layers/StructureLayer3D";
import { TerrainLayer3D } from "./layers/TerrainLayer3D";
import { UnitLayer3D } from "./layers/UnitLayer3D";

/**
 * Factory function to create the 3D renderer.
 * Matches the interface of the 2D createRenderer function.
 */
export function createRenderer3D(
  canvas: HTMLCanvasElement,
  game: GameView,
  eventBus: EventBus,
): BabylonRenderer {
  const userSettings = new UserSettings();

  const uiState = {
    attackRatio: 20,
    ghostStructure: null,
    rocketDirectionUp: true,
  } as UIState;

  // Hide the game starting modal
  const startingModal = document.querySelector(
    "game-starting-modal",
  ) as GameStartingModal;
  startingModal.hide();

  // Set up UI components (same as 2D renderer)
  // Note: transformHandler assignments happen after renderer is created
  const emojiTable = document.querySelector("emoji-table") as EmojiTable;
  if (!emojiTable || !(emojiTable instanceof EmojiTable)) {
    console.error("EmojiTable element not found in the DOM");
  }
  emojiTable.game = game;
  emojiTable.initEventBus(eventBus);

  const buildMenu = document.querySelector("build-menu") as BuildMenu;
  if (!buildMenu || !(buildMenu instanceof BuildMenu)) {
    console.error("BuildMenu element not found in the DOM");
  }
  buildMenu.game = game;
  buildMenu.eventBus = eventBus;
  buildMenu.uiState = uiState;

  const leaderboard = document.querySelector("leader-board") as Leaderboard;
  if (!leaderboard || !(leaderboard instanceof Leaderboard)) {
    console.error("LeaderBoard element not found in the DOM");
  }
  leaderboard.eventBus = eventBus;
  leaderboard.game = game;

  const gameLeftSidebar = document.querySelector(
    "game-left-sidebar",
  ) as GameLeftSidebar;
  if (!gameLeftSidebar || !(gameLeftSidebar instanceof GameLeftSidebar)) {
    console.error("GameLeftSidebar element not found in the DOM");
  }
  gameLeftSidebar.game = game;

  const teamStats = document.querySelector("team-stats") as TeamStats;
  if (!teamStats || !(teamStats instanceof TeamStats)) {
    console.error("TeamStats element not found in the DOM");
  }
  teamStats.eventBus = eventBus;
  teamStats.game = game;

  const controlPanel = document.querySelector("control-panel") as ControlPanel;
  if (!(controlPanel instanceof ControlPanel)) {
    console.error("ControlPanel element not found in the DOM");
  }
  controlPanel.eventBus = eventBus;
  controlPanel.uiState = uiState;
  controlPanel.game = game;

  const eventsDisplay = document.querySelector(
    "events-display",
  ) as EventsDisplay;
  if (!(eventsDisplay instanceof EventsDisplay)) {
    console.error("events display not found");
  }
  eventsDisplay.eventBus = eventBus;
  eventsDisplay.game = game;
  eventsDisplay.uiState = uiState;

  const chatDisplay = document.querySelector("chat-display") as ChatDisplay;
  if (!(chatDisplay instanceof ChatDisplay)) {
    console.error("chat display not found");
  }
  chatDisplay.eventBus = eventBus;
  chatDisplay.game = game;

  const playerInfo = document.querySelector(
    "player-info-overlay",
  ) as PlayerInfoOverlay;
  if (!(playerInfo instanceof PlayerInfoOverlay)) {
    console.error("player info overlay not found");
  }
  playerInfo.eventBus = eventBus;
  playerInfo.game = game;

  const winModal = document.querySelector("win-modal") as WinModal;
  if (!(winModal instanceof WinModal)) {
    console.error("win modal not found");
  }
  winModal.eventBus = eventBus;
  winModal.game = game;

  const replayPanel = document.querySelector("replay-panel") as ReplayPanel;
  if (!(replayPanel instanceof ReplayPanel)) {
    console.error("replay panel not found");
  }
  replayPanel.eventBus = eventBus;
  replayPanel.game = game;

  const gameRightSidebar = document.querySelector(
    "game-right-sidebar",
  ) as GameRightSidebar;
  if (!(gameRightSidebar instanceof GameRightSidebar)) {
    console.error("Game Right bar not found");
  }
  gameRightSidebar.game = game;
  gameRightSidebar.eventBus = eventBus;

  const settingsModal = document.querySelector(
    "settings-modal",
  ) as SettingsModal;
  if (!(settingsModal instanceof SettingsModal)) {
    console.error("settings modal not found");
  }
  settingsModal.userSettings = userSettings;
  settingsModal.eventBus = eventBus;

  const unitDisplay = document.querySelector("unit-display") as UnitDisplay;
  if (!(unitDisplay instanceof UnitDisplay)) {
    console.error("unit display not found");
  }
  unitDisplay.game = game;
  unitDisplay.eventBus = eventBus;
  unitDisplay.uiState = uiState;

  const playerPanel = document.querySelector("player-panel") as PlayerPanel;
  if (!(playerPanel instanceof PlayerPanel)) {
    console.error("player panel not found");
  }
  playerPanel.g = game;
  playerPanel.initEventBus(eventBus);
  playerPanel.emojiTable = emojiTable;
  playerPanel.uiState = uiState;

  const chatModal = document.querySelector("chat-modal") as ChatModal;
  if (!(chatModal instanceof ChatModal)) {
    console.error("chat modal not found");
  }
  chatModal.g = game;
  chatModal.initEventBus(eventBus);

  const multiTabModal = document.querySelector(
    "multi-tab-modal",
  ) as MultiTabModal;
  if (!(multiTabModal instanceof MultiTabModal)) {
    console.error("multi-tab modal not found");
  }
  multiTabModal.game = game;

  const headsUpMessage = document.querySelector(
    "heads-up-message",
  ) as HeadsUpMessage;
  if (!(headsUpMessage instanceof HeadsUpMessage)) {
    console.error("heads-up message not found");
  }
  headsUpMessage.game = game;

  const performanceOverlay = document.querySelector(
    "performance-overlay",
  ) as PerformanceOverlay;
  if (!(performanceOverlay instanceof PerformanceOverlay)) {
    console.error("performance overlay not found");
  }
  performanceOverlay.eventBus = eventBus;
  performanceOverlay.userSettings = userSettings;

  const alertFrame = document.querySelector("alert-frame") as AlertFrame;
  if (!(alertFrame instanceof AlertFrame)) {
    console.error("alert frame not found");
  }
  alertFrame.game = game;

  const spawnTimer = document.querySelector("spawn-timer") as SpawnTimer;
  if (!(spawnTimer instanceof SpawnTimer)) {
    console.error("spawn timer not found");
  }
  spawnTimer.game = game;

  const immunityTimer = document.querySelector(
    "immunity-timer",
  ) as ImmunityTimer;
  if (!(immunityTimer instanceof ImmunityTimer)) {
    console.error("immunity timer not found");
  }
  immunityTimer.game = game;

  // Collect all UI layers that need to be initialized and ticked
  // These are HTML custom elements that implement the Layer interface
  const uiLayers: Layer[] = [
    eventsDisplay,
    chatDisplay,
    buildMenu,
    spawnTimer,
    immunityTimer,
    leaderboard,
    gameLeftSidebar,
    unitDisplay,
    gameRightSidebar,
    controlPanel,
    playerInfo,
    winModal,
    replayPanel,
    settingsModal,
    teamStats,
    playerPanel,
    headsUpMessage,
    multiTabModal,
    alertFrame,
    performanceOverlay,
  ];

  // Create renderer first (this creates the 3D transform handler internally)
  const renderer = new BabylonRenderer(
    canvas,
    game,
    eventBus,
    uiState,
    uiLayers,
  );

  // Now update UI components that need the 3D transform handler
  const transformHandler = renderer.transformHandler;
  emojiTable.transformHandler = transformHandler;
  buildMenu.transformHandler = transformHandler;
  playerInfo.transform = transformHandler;
  spawnTimer.transformHandler = transformHandler;

  // Create MainRadialMenu (needs transformHandler so must be after renderer creation)
  const mainRadialMenu = new MainRadialMenu(
    eventBus,
    game,
    transformHandler,
    emojiTable,
    buildMenu,
    uiState,
    playerPanel,
  );
  renderer.addUILayer(mainRadialMenu);

  // Create BuildHandler3D for hotkey building
  const buildHandler = new BuildHandler3D(
    game,
    eventBus,
    transformHandler,
    uiState,
  );
  renderer.addUILayer(buildHandler);

  return renderer;
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
  private uiLayers: Layer[] = [];
  private lastFrameTime: number = 0;

  // Compatibility properties for ClientGameRunner
  public uiState: UIState;
  public transformHandler: TransformHandler3D;

  constructor(
    private canvas: HTMLCanvasElement,
    private game: GameView,
    private eventBus: EventBus,
    uiState: UIState,
    uiLayers: Layer[],
  ) {
    this.uiState = uiState;
    this.uiLayers = uiLayers;

    // Create Babylon engine
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    // Create scene
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.4, 0.6, 0.8, 1); // Light sky blue background

    // Create camera
    this.cameraController = new CameraController(this.scene, canvas, {
      mapWidth: game.width(),
      mapHeight: game.height(),
      initialRadius: Math.max(game.width(), game.height()) * 0.6,
      maxRadius: Math.max(game.width(), game.height()) * 1.5,
    });

    // Create 3D-aware transform handler for coordinate conversion
    this.transformHandler = new TransformHandler3D(
      game,
      eventBus,
      canvas,
      this.cameraController,
      this.scene,
    );

    // Create lighting
    this.setupLighting();

    // Create layers
    this.layers = [
      new TerrainLayer3D(game),
      new StructureLayer3D(game),
      new UnitLayer3D(game, eventBus, this.transformHandler),
      new FxLayer3D(game),
    ];
  }

  /**
   * Set up scene lighting
   */
  private setupLighting(): void {
    // Strong ambient light to match the flat 2D look
    const ambientLight = new HemisphericLight(
      "ambientLight",
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambientLight.intensity = 1.2; // Brighter ambient
    ambientLight.groundColor = new Color3(0.8, 0.8, 0.8); // Bright ground reflection

    // Soft directional sun light
    const sunLight = new DirectionalLight(
      "sunLight",
      new Vector3(-0.3, -1, -0.3).normalize(),
      this.scene,
    );
    sunLight.intensity = 0.5; // Softer shadows
    sunLight.diffuse = new Color3(1, 1, 1);

    // Future: add shadows
    // const shadowGenerator = new ShadowGenerator(2048, sunLight);
  }

  /**
   * Initialize the renderer and start the render loop.
   * Called after game is ready.
   */
  initialize(): void {
    // Initialize all 3D layers
    for (const layer of this.layers) {
      layer.init(this.scene);
    }

    // Initialize all HTML UI layers
    for (const layer of this.uiLayers) {
      layer.init?.();
    }

    // Add canvas to the document if not already there (same as 2D renderer)
    if (!document.body.contains(this.canvas)) {
      document.body.appendChild(this.canvas);
    }

    // Handle window resize
    window.addEventListener("resize", () => {
      this.resizeCanvas();
    });
    this.resizeCanvas();

    // Center the 2D transform handler for UI overlays
    this.transformHandler.centerAll(0.9);

    // Center camera on map
    this.cameraController.centerOnMap();

    // Start render loop
    this.lastFrameTime = performance.now();
    this.engine.runRenderLoop(() => this.renderLoop());

    console.log(
      `[BabylonRenderer] Initialized with map size ${this.game.width()}x${this.game.height()}`,
    );
  }

  /**
   * Resize canvas to match window dimensions
   */
  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.transformHandler.updateCanvasBoundingRect();
    this.engine.resize();
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
    // Tick 3D layers
    for (const layer of this.layers) {
      layer.tick(null); // Layers can query game state directly
    }

    // Tick HTML UI layers
    for (const layer of this.uiLayers) {
      layer.tick?.();
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
   * Add a UI layer after initialization
   */
  addUILayer(layer: Layer): void {
    this.uiLayers.push(layer);
    layer.init?.();
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
