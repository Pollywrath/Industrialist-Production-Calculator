import type { EdgeAnimationStyle, EdgeLineStyle, EdgePathStyle, FlowEdgeSettings } from './model';
import { DEFAULT_FLOW_EDGE_SETTINGS } from './model';

export const FLOW_EDGE_TYPE = 'flow' as const;

export const routingStyles: readonly EdgePathStyle[] = ['straight', 'bezier', 'orthogonal'];
export const lineStyles: readonly EdgeLineStyle[] = ['solid', 'dashed', 'dotted'];
export const animationStyles: readonly EdgeAnimationStyle[] = [
  'none',
  'moving-dashes',
  'pulse-arrow',
];

export function validateFlowEdgeSettings(settings: FlowEdgeSettings) {
  if (!routingStyles.includes(settings.routingStyle))
    throw new Error(`Unknown routing style "${settings.routingStyle}".`);
  if (!lineStyles.includes(settings.lineStyle))
    throw new Error(`Unknown edge line style "${settings.lineStyle}".`);
  if (!animationStyles.includes(settings.animationStyle))
    throw new Error(`Unknown edge animation style "${settings.animationStyle}".`);
}

export interface FlowEdgeTypeDefinition {
  readonly type: typeof FLOW_EDGE_TYPE;
  readonly defaults: FlowEdgeSettings;
  readonly routingStyles: readonly EdgePathStyle[];
  readonly lineStyles: readonly EdgeLineStyle[];
  readonly animationStyles: readonly EdgeAnimationStyle[];
  validateSettings(settings: FlowEdgeSettings): void;
}

export const flowEdgeType: FlowEdgeTypeDefinition = {
  type: FLOW_EDGE_TYPE,
  defaults: DEFAULT_FLOW_EDGE_SETTINGS,
  routingStyles,
  lineStyles,
  animationStyles,
  validateSettings: validateFlowEdgeSettings,
};
