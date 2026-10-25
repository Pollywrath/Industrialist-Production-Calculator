export const THEME_COLOR = {
  canvasBackground: '--theme-color-canvas-bg',
  nodeBackground: '--theme-color-node-bg',
  nodeBorder: '--theme-color-node-border',
  nodeTargetBackground: '--theme-color-node-target-bg',
  nodeTargetBorder: '--theme-color-node-target-border',
  info: '--theme-color-info',
  inputBackground: '--theme-color-input-bg',
  inputBorder: '--theme-color-input-border',
  inputText: '--theme-color-input-text',
  outputBackground: '--theme-color-output-bg',
  outputBorder: '--theme-color-output-border',
  outputText: '--theme-color-output-text',
  inputPort: '--theme-color-handle-input-supplied',
  inputPortDeficient: '--theme-color-handle-input-deficient',
  outputPort: '--theme-color-handle-output-connected',
  outputPortExcess: '--theme-color-handle-output-excess',
  divider: '--theme-color-border-divider',
  buttonBackground: '--theme-color-bg-secondary',
  buttonBorder: '--theme-color-border-light',
  buttonDots: '--theme-color-text-secondary',
  mutedText: '--theme-color-text-secondary',
  textPrimary: '--theme-color-text-primary',
  machineText: '--theme-color-stat-value',
  gridDots: '--theme-color-grid-dots',
  edge: '--theme-color-edge-stroke',
  selected: '--theme-color-edge-selected-stroke',
  nodeSelected: '--theme-color-node-selected-border',
  portBorder: '--theme-color-handle-border',
  editor: '--theme-color-confirm-info',
  white: '--theme-color-white',
} as const;

export type ThemeColorVariable = (typeof THEME_COLOR)[keyof typeof THEME_COLOR];

export interface CanvasThemeColors {
  readonly canvasBackground: number;
  readonly textPrimary: number;
  readonly mutedText: number;
  readonly inputText: number;
  readonly outputText: number;
  readonly machineText: number;
  readonly nodeBackground: number;
  readonly nodeBorder: number;
  readonly nodeTargetBackground: number;
  readonly nodeTargetBorder: number;
  readonly inputBackground: number;
  readonly inputBorder: number;
  readonly outputBackground: number;
  readonly outputBorder: number;
  readonly divider: number;
  readonly dividerAlpha: number;
  readonly buttonBackground: number;
  readonly buttonBorder: number;
  readonly buttonDots: number;
  readonly inputPort: number;
  readonly inputPortDeficient: number;
  readonly outputPort: number;
  readonly outputPortExcess: number;
  readonly portBorder: number;
  readonly selected: number;
  readonly nodeSelected: number;
  readonly edge: number;
  readonly editor: number;
  readonly white: number;
}

export function getThemeColorCss(variable: ThemeColorVariable) {
  if (typeof document === 'undefined') return '';
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!value) throw new Error(`Theme color ${variable} is not defined by the app theme.`);
  return value;
}

export function getThemeColor(variable: ThemeColorVariable) {
  if (typeof document === 'undefined') return 0;
  return parseThemeColorCss(getThemeColorCss(variable)).color;
}

export interface ParsedThemeColor {
  readonly color: number;
  readonly alpha: number;
}

export function parseThemeColorCss(cssColor: string): ParsedThemeColor {
  const hex = cssColor.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const short = hex.length <= 4;
    const channels = short
      ? [...hex].map((digit) => Number.parseInt(`${digit}${digit}`, 16))
      : hex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16));
    const [red, green, blue, alpha = 255] = channels;
    return { color: (red << 16) | (green << 8) | blue, alpha: alpha / 255 };
  }

  const functional = cssColor.match(/^rgba?\((.*)\)$/i);
  if (functional) {
    const hasSlashAlpha = /\//.test(functional[1]);
    const parts = functional[1]
      .trim()
      .replace(/\s*\/\s*/, ',')
      .split(/\s*,\s*/);
    const tokens =
      parts.length === 1
        ? parts[0].trim().split(/\s+/)
        : hasSlashAlpha && parts.length === 2
          ? [...parts[0].trim().split(/\s+/), parts[1]]
          : parts;
    const channelTokens = tokens.length === 4 ? tokens.slice(0, 3) : tokens;
    const alphaToken = tokens.length === 4 ? tokens[3] : undefined;
    if (channelTokens.length === 3) {
      const channels = channelTokens.map((token) => {
        const percent = token.endsWith('%');
        const value = Number.parseFloat(percent ? token.slice(0, -1) : token);
        return Number.isFinite(value)
          ? Math.round(Math.max(0, Math.min(255, percent ? value * 2.55 : value)))
          : NaN;
      });
      const alphaValue =
        alphaToken === undefined
          ? 1
          : Number.parseFloat(alphaToken.endsWith('%') ? alphaToken.slice(0, -1) : alphaToken) /
            (alphaToken.endsWith('%') ? 100 : 1);
      if (channels.every(Number.isFinite) && Number.isFinite(alphaValue)) {
        return {
          color: (channels[0] << 16) | (channels[1] << 8) | channels[2],
          alpha: Math.max(0, Math.min(1, alphaValue)),
        };
      }
    }
  }

  throw new Error(`Theme color "${cssColor}" must use a hex, rgb, or rgba value.`);
}

export function getThemeColorAlpha(variable: ThemeColorVariable) {
  if (typeof document === 'undefined') return 1;
  return parseThemeColorCss(getThemeColorCss(variable)).alpha;
}

let cachedColors: CanvasThemeColors | undefined;

export function clearCanvasThemeColorsCache() {
  cachedColors = undefined;
}

export function getCanvasThemeColors(): CanvasThemeColors {
  if (cachedColors) return cachedColors;
  cachedColors = {
    canvasBackground: getThemeColor(THEME_COLOR.canvasBackground),
    textPrimary: getThemeColor(THEME_COLOR.textPrimary),
    mutedText: getThemeColor(THEME_COLOR.mutedText),
    inputText: getThemeColor(THEME_COLOR.inputText),
    outputText: getThemeColor(THEME_COLOR.outputText),
    machineText: getThemeColor(THEME_COLOR.machineText),
    nodeBackground: getThemeColor(THEME_COLOR.nodeBackground),
    nodeBorder: getThemeColor(THEME_COLOR.nodeBorder),
    nodeTargetBackground: getThemeColor(THEME_COLOR.nodeTargetBackground),
    nodeTargetBorder: getThemeColor(THEME_COLOR.nodeTargetBorder),
    inputBackground: getThemeColor(THEME_COLOR.inputBackground),
    inputBorder: getThemeColor(THEME_COLOR.inputBorder),
    outputBackground: getThemeColor(THEME_COLOR.outputBackground),
    outputBorder: getThemeColor(THEME_COLOR.outputBorder),
    divider: getThemeColor(THEME_COLOR.divider),
    dividerAlpha: getThemeColorAlpha(THEME_COLOR.divider),
    buttonBackground: getThemeColor(THEME_COLOR.buttonBackground),
    buttonBorder: getThemeColor(THEME_COLOR.buttonBorder),
    buttonDots: getThemeColor(THEME_COLOR.buttonDots),
    inputPort: getThemeColor(THEME_COLOR.inputPort),
    inputPortDeficient: getThemeColor(THEME_COLOR.inputPortDeficient),
    outputPort: getThemeColor(THEME_COLOR.outputPort),
    outputPortExcess: getThemeColor(THEME_COLOR.outputPortExcess),
    portBorder: getThemeColor(THEME_COLOR.portBorder),
    selected: getThemeColor(THEME_COLOR.selected),
    nodeSelected: getThemeColor(THEME_COLOR.nodeSelected),
    edge: getThemeColor(THEME_COLOR.edge),
    editor: getThemeColor(THEME_COLOR.editor),
    white: getThemeColor(THEME_COLOR.white),
  };
  return cachedColors;
}
