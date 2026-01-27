import { EventBus } from "../../core/EventBus";
import { UnitType } from "../../core/game/Game";
import { GameView } from "../../core/game/GameView";
import { MouseDownEvent } from "../InputHandler";
import { BuildUnitIntentEvent } from "../Transport";
import { ITransformHandler } from "../graphics/ITransformHandler";
import { UIState } from "../graphics/UIState";
import { Layer } from "../graphics/layers/Layer";

/**
 * Handles building placement in 3D mode.
 * Listens for clicks when a ghost structure is selected and places the building.
 */
export class BuildHandler3D implements Layer {
  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: ITransformHandler,
    private uiState: UIState,
  ) {}

  init(): void {
    this.eventBus.on(MouseDownEvent, (e) => this.onMouseDown(e));
  }

  tick(): void {
    // No per-tick updates needed
  }

  private onMouseDown(event: MouseDownEvent): void {
    // Only handle if there's a ghost structure selected
    if (this.uiState.ghostStructure === null) return;

    // Convert screen coordinates to game coordinates
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );

    // Validate coordinates
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      return;
    }

    const tile = this.game.ref(cell.x, cell.y);
    const unitType = this.uiState.ghostStructure;

    // Determine rocket direction for bombs
    const rocketDirectionUp =
      unitType === UnitType.AtomBomb || unitType === UnitType.HydrogenBomb
        ? this.uiState.rocketDirectionUp
        : undefined;

    // Emit build event
    this.eventBus.emit(
      new BuildUnitIntentEvent(unitType, tile, rocketDirectionUp),
    );

    // Clear ghost structure
    this.uiState.ghostStructure = null;
  }
}
