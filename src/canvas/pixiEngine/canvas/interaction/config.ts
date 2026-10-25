export interface CanvasInteractionConfig {
  readonly pan?: boolean;
  readonly zoom?: boolean;
  readonly graphEditing?: boolean;
  readonly groupActions?: boolean;
  readonly nodeDragging?: boolean;
  readonly selection?: boolean;
  readonly boxSelection?: boolean;
  readonly multiSelection?: boolean;
  readonly connection?: boolean;
  readonly clickToConnect?: boolean;
  readonly reconnection?: boolean;
  readonly routeEditing?: boolean;
  readonly keyboard?: boolean;
  readonly keyboardNavigation?: boolean;
  readonly keyboardCommands?: boolean;
  readonly spaceToPan?: boolean;
}

export const DEFAULT_CANVAS_INTERACTION_CONFIG: Required<CanvasInteractionConfig> = Object.freeze({
  pan: true,
  zoom: true,
  graphEditing: true,
  groupActions: true,
  nodeDragging: true,
  selection: true,
  boxSelection: true,
  multiSelection: true,
  connection: true,
  clickToConnect: true,
  reconnection: true,
  routeEditing: false,
  keyboard: true,
  keyboardNavigation: true,
  keyboardCommands: true,
  spaceToPan: true,
});

export function resolveCanvasInteractionConfig(config: CanvasInteractionConfig = {}) {
  const keyboard = config.keyboard ?? DEFAULT_CANVAS_INTERACTION_CONFIG.keyboard;
  return {
    ...DEFAULT_CANVAS_INTERACTION_CONFIG,
    ...config,
    groupActions: config.groupActions ?? config.graphEditing ?? true,
    nodeDragging:
      config.nodeDragging ?? config.graphEditing ?? DEFAULT_CANVAS_INTERACTION_CONFIG.nodeDragging,
    keyboardNavigation: config.keyboardNavigation ?? keyboard,
    keyboardCommands: config.keyboardCommands ?? keyboard,
  };
}
