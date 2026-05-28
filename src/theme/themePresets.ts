import type { ThemeOverrideMap } from './themeManager';

export type ThemePresetMode = 'dark' | 'light';

export interface ThemePreset {
  id: string;
  name: string;
  mode: ThemePresetMode;
  description: string;
  sourceUrl: string;
  swatches: string[];
  contrastRatio: number;
  overrides: ThemeOverrideMap;
}

interface PresetColors {
  mode: ThemePresetMode;
  canvasBg: string;
  bgSecondary: string;
  secondary: string;
  primary: string;
  primaryHover: string;
  primaryDark: string;
  textPrimary: string;
  textSecondary: string;
  textDim: string;
  statValue: string;
  borderPrimary: string;
  borderLight: string;
  gridDots: string;
  edgeStroke: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  outputBg: string;
  outputBorder: string;
  outputText: string;
  success: string;
  warning: string;
  error: string;
  tier1: string;
  tier2: string;
  tier3: string;
  tier4: string;
  tier5: string;
  fluid: string;
  item: string;
  research: string;
  nodeTargetBg: string;
  nodeTargetBorder: string;
  textNeutral?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const [, r, g, b] = normalized;
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    };
  }
  return null;
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (channel: number) => clampByte(channel).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixHexColors(baseHex: string, targetHex: string, amount: number): string {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  if (!base || !target) return baseHex;

  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: base.r + (target.r - base.r) * t,
    g: base.g + (target.g - base.g) * t,
    b: base.b + (target.b - base.b) * t,
  });
}

function resolvePerceivableEdgeStroke(colors: PresetColors): string {
  const minimumContrast = 3;
  const baseStroke = colors.edgeStroke;
  const canvas = colors.canvasBg;

  const baseContrast = contrastRatio(baseStroke, canvas);
  if (baseContrast >= minimumContrast) return baseStroke;

  const blendedVisibilityTarget =
    colors.mode === 'dark'
      ? mixHexColors(colors.textSecondary, colors.primaryHover, 0.25)
      : mixHexColors(colors.textPrimary, colors.primary, 0.2);
  const accentTarget = colors.mode === 'dark' ? colors.primaryHover : colors.primary;
  const candidateTargets = [blendedVisibilityTarget, accentTarget, colors.textPrimary];
  const blendSteps = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72];

  let bestColor = baseStroke;
  let bestContrast = baseContrast;

  for (let targetIndex = 0; targetIndex < candidateTargets.length; targetIndex++) {
    const target = candidateTargets[targetIndex];
    for (let stepIndex = 0; stepIndex < blendSteps.length; stepIndex++) {
      const candidate = mixHexColors(baseStroke, target, blendSteps[stepIndex]);
      const candidateContrast = contrastRatio(candidate, canvas);

      if (candidateContrast > bestContrast) {
        bestContrast = candidateContrast;
        bestColor = candidate;
      }
      if (candidateContrast >= minimumContrast) {
        return candidate;
      }
    }
  }

  return bestColor;
}

function buildOverrides(colors: PresetColors): ThemeOverrideMap {
  const overlayAlpha = colors.mode === 'dark' ? 0.86 : 0.72;
  const hoverOverlay =
    colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const translucentDark =
    colors.mode === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.55)';
  const borderLightTranslucent =
    colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.14)';
  const translucentButtonBg =
    colors.mode === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.55)';
  const panelEmptyBg =
    colors.mode === 'dark' ? 'rgba(42, 42, 53, 0.5)' : 'rgba(255, 255, 255, 0.7)';
  const textNeutral = colors.textNeutral ?? colors.textSecondary;
  const edgeStroke = resolvePerceivableEdgeStroke(colors);

  return {
    '--theme-native-color-scheme': colors.mode,

    '--theme-color-canvas-bg': colors.canvasBg,
    '--theme-color-bg-secondary': colors.bgSecondary,
    '--theme-color-overlay-backdrop': rgba(colors.canvasBg, overlayAlpha),

    '--theme-color-primary': colors.primary,
    '--theme-color-primary-hover': colors.primaryHover,
    '--theme-color-primary-dark': colors.primaryDark,
    '--theme-color-secondary': colors.secondary,
    '--theme-color-bg-tertiary': colors.secondary,

    '--theme-color-text-primary': colors.textPrimary,
    '--theme-color-text-secondary': colors.textSecondary,
    '--theme-color-text-dim': colors.textDim,
    '--theme-color-stat-value': colors.statValue,
    '--theme-color-tier-default': colors.primaryHover,

    '--theme-color-border-primary': colors.borderPrimary,
    '--theme-color-border-light': colors.borderLight,
    '--theme-color-border-divider': rgba(colors.borderPrimary, 0.33),
    '--theme-color-grid-dots': colors.gridDots,
    '--theme-color-edge-stroke': edgeStroke,

    '--theme-color-input-bg': colors.inputBg,
    '--theme-color-input-border': colors.inputBorder,
    '--theme-color-input-text': colors.inputText,
    '--theme-color-success': colors.success,

    '--theme-color-output-bg': colors.outputBg,
    '--theme-color-output-border': colors.outputBorder,
    '--theme-color-output-text': colors.outputText,
    '--theme-color-text-error': colors.error,
    '--theme-color-text-neutral': textNeutral,

    '--theme-color-confirm-success': colors.success,
    '--theme-color-confirm-info': colors.primary,
    '--theme-color-confirm-error': colors.error,

    '--theme-color-node-bg': colors.bgSecondary,
    '--theme-color-node-border': colors.borderPrimary,
    '--theme-color-node-target-bg': colors.nodeTargetBg,
    '--theme-color-node-target-border': colors.nodeTargetBorder,

    '--theme-color-handle-input-supplied': colors.success,
    '--theme-color-handle-input-deficient': colors.error,
    '--theme-color-handle-output-connected': colors.error,
    '--theme-color-handle-output-excess': colors.success,

    '--theme-color-tier-1': colors.tier1,
    '--theme-color-tier-2': colors.tier2,
    '--theme-color-tier-3': colors.tier3,
    '--theme-color-tier-4': colors.tier4,
    '--theme-color-tier-5': colors.tier5,

    '--theme-color-fluid': colors.fluid,
    '--theme-color-item': colors.item,
    '--theme-color-research': colors.research,

    '--theme-color-btn-hover-overlay': hoverOverlay,
    '--theme-color-translucent-dark': translucentDark,
    '--theme-color-border-light-translucent': borderLightTranslucent,
    '--theme-color-btn-bg-translucent': translucentButtonBg,
    '--theme-color-panel-empty-bg': panelEmptyBg,

    '--theme-color-warning': colors.warning,
    '--theme-color-error': colors.error,
    '--theme-color-error-translucent': rgba(colors.error, 0.12),
    '--theme-color-warning-translucent': rgba(colors.warning, 0.12),
    '--theme-color-success-translucent': rgba(colors.success, 0.12),
    '--theme-color-white': '#ffffff',
    '--theme-color-black': '#000000',
    '--theme-color-bg-active': colors.secondary,
    '--theme-color-node-selected-border': colors.textPrimary,
    '--theme-color-handle-border': colors.canvasBg,
    '--theme-color-edge-selected-stroke': colors.textPrimary,
  };
}

function makePreset(
  id: string,
  name: string,
  description: string,
  sourceUrl: string,
  colors: PresetColors,
): ThemePreset {
  const overrides = buildOverrides(colors);

  return {
    id,
    name,
    mode: colors.mode,
    description,
    sourceUrl,
    swatches: [colors.canvasBg, colors.bgSecondary, colors.primary, colors.success, colors.error],
    contrastRatio: contrastRatio(colors.textPrimary, colors.canvasBg),
    overrides,
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  makePreset(
    'default',
    'Default',
    'Near-black base with amber highlights and strong industrial contrast.',
    'local:src/index.css',
    {
      mode: 'dark',
      canvasBg: '#0A0A0A',
      bgSecondary: '#1A1A1A',
      secondary: '#1A1A1A',
      primary: '#D4A637',
      primaryHover: '#F5D56A',
      primaryDark: '#0A0A0A',
      textPrimary: '#F5D56A',
      textSecondary: '#999999',
      textDim: '#AAAAAA',
      statValue: '#E0E0E0',
      borderPrimary: '#D4A637',
      borderLight: '#333333',
      gridDots: '#333333',
      edgeStroke: '#333333',
      inputBg: '#1A3A2A',
      inputBorder: '#22C55E',
      inputText: '#86EFAC',
      outputBg: '#3A1A1A',
      outputBorder: '#EF4444',
      outputText: '#FCA5A5',
      success: '#22C55E',
      warning: '#FFAA00',
      error: '#EF4444',
      tier1: '#888888',
      tier2: '#4ADE80',
      tier3: '#60A5FA',
      tier4: '#C084FC',
      tier5: '#FBBF24',
      fluid: '#60A5FA',
      item: '#D4A637',
      research: '#06B6D4',
      nodeTargetBg: '#2D2416',
      nodeTargetBorder: '#F5D56A',
    },
  ),
  makePreset(
    'dracula-classic',
    'Dracula Classic',
    'Deep indigo dark base with vivid pink, cyan, and lime accents.',
    'https://draculatheme.com/spec',
    {
      mode: 'dark',
      canvasBg: '#282A36',
      bgSecondary: '#21222C',
      secondary: '#343746',
      primary: '#FF79C6',
      primaryHover: '#FF92DF',
      primaryDark: '#191A21',
      textPrimary: '#F8F8F2',
      textSecondary: '#CBD0E4',
      textDim: '#A0A8C5',
      statValue: '#F8F8F2',
      borderPrimary: '#BD93F9',
      borderLight: '#44475A',
      gridDots: '#44475A',
      edgeStroke: '#6272A4',
      inputBg: '#1F3B2D',
      inputBorder: '#50FA7B',
      inputText: '#69FF94',
      outputBg: '#3C1F2D',
      outputBorder: '#FF5555',
      outputText: '#FF6E6E',
      success: '#50FA7B',
      warning: '#FFB86C',
      error: '#FF5555',
      tier1: '#6272A4',
      tier2: '#50FA7B',
      tier3: '#8BE9FD',
      tier4: '#BD93F9',
      tier5: '#F1FA8C',
      fluid: '#8BE9FD',
      item: '#FFB86C',
      research: '#BD93F9',
      nodeTargetBg: '#343746',
      nodeTargetBorder: '#F8F8F2',
    },
  ),
  makePreset(
    'alucard-classic',
    'Alucard Classic',
    'Warm parchment light base with violet accents and rich neutrals.',
    'https://draculatheme.com/spec',
    {
      mode: 'light',
      canvasBg: '#FFFBEB',
      bgSecondary: '#EFEDDC',
      secondary: '#ECE9DF',
      primary: '#815CD6',
      primaryHover: '#7862D0',
      primaryDark: '#FFFBEB',
      textPrimary: '#1F1F1F',
      textSecondary: '#5A5545',
      textDim: '#6C664B',
      statValue: '#2C2B31',
      borderPrimary: '#815CD6',
      borderLight: '#CECCC0',
      gridDots: '#BCBAB3',
      edgeStroke: '#6C664B',
      inputBg: '#EAF5E8',
      inputBorder: '#089108',
      inputText: '#14710A',
      outputBg: '#F7E8E5',
      outputBorder: '#DE5735',
      outputText: '#CB3A2A',
      success: '#089108',
      warning: '#A39514',
      error: '#DE5735',
      tier1: '#9893A5',
      tier2: '#089108',
      tier3: '#0081D6',
      tier4: '#815CD6',
      tier5: '#A39514',
      fluid: '#0081D6',
      item: '#A34D14',
      research: '#815CD6',
      nodeTargetBg: '#DEDCCF',
      nodeTargetBorder: '#1F1F1F',
      textNeutral: '#7A7460',
    },
  ),
  makePreset(
    'nord-arctic',
    'Nord Arctic',
    'Cool slate-blue dark base with frosted cyan and muted neutrals.',
    'https://www.nordtheme.com/docs/colors-and-palettes/',
    {
      mode: 'dark',
      canvasBg: '#2E3440',
      bgSecondary: '#3B4252',
      secondary: '#434C5E',
      primary: '#88C0D0',
      primaryHover: '#81A1C1',
      primaryDark: '#2E3440',
      textPrimary: '#ECEFF4',
      textSecondary: '#E5E9F0',
      textDim: '#C3CDDD',
      statValue: '#E5E9F0',
      borderPrimary: '#88C0D0',
      borderLight: '#5C6680',
      gridDots: '#434C5E',
      edgeStroke: '#6B738A',
      inputBg: '#233A3B',
      inputBorder: '#A3BE8C',
      inputText: '#A3BE8C',
      outputBg: '#3F2A31',
      outputBorder: '#BF616A',
      outputText: '#D08770',
      success: '#A3BE8C',
      warning: '#EBCB8B',
      error: '#BF616A',
      tier1: '#7D89A3',
      tier2: '#A3BE8C',
      tier3: '#88C0D0',
      tier4: '#B48EAD',
      tier5: '#EBCB8B',
      fluid: '#88C0D0',
      item: '#D08770',
      research: '#5E81AC',
      nodeTargetBg: '#434C5E',
      nodeTargetBorder: '#E5E9F0',
    },
  ),
  makePreset(
    'solarized-dark',
    'Solarized Dark',
    'Low-glare teal dark base with balanced blue and amber accents.',
    'https://ethanschoonover.com/solarized/',
    {
      mode: 'dark',
      canvasBg: '#002B36',
      bgSecondary: '#073642',
      secondary: '#0A3A47',
      primary: '#268BD2',
      primaryHover: '#2AA198',
      primaryDark: '#002B36',
      textPrimary: '#EEE8D5',
      textSecondary: '#93A1A1',
      textDim: '#657B83',
      statValue: '#EEE8D5',
      borderPrimary: '#268BD2',
      borderLight: '#586E75',
      gridDots: '#586E75',
      edgeStroke: '#586E75',
      inputBg: '#0B3E32',
      inputBorder: '#859900',
      inputText: '#93A91E',
      outputBg: '#3A2C22',
      outputBorder: '#DC322F',
      outputText: '#CB4B16',
      success: '#859900',
      warning: '#B58900',
      error: '#DC322F',
      tier1: '#586E75',
      tier2: '#859900',
      tier3: '#268BD2',
      tier4: '#6C71C4',
      tier5: '#B58900',
      fluid: '#2AA198',
      item: '#CB4B16',
      research: '#6C71C4',
      nodeTargetBg: '#0A3A47',
      nodeTargetBorder: '#EEE8D5',
    },
  ),
  makePreset(
    'solarized-light',
    'Solarized Light',
    'Cream light base with restrained teal, blue, and amber accents.',
    'https://ethanschoonover.com/solarized/',
    {
      mode: 'light',
      canvasBg: '#FDF6E3',
      bgSecondary: '#EEE8D5',
      secondary: '#E7DFC9',
      primary: '#268BD2',
      primaryHover: '#2AA198',
      primaryDark: '#FDF6E3',
      textPrimary: '#586E75',
      textSecondary: '#657B83',
      textDim: '#839496',
      statValue: '#073642',
      borderPrimary: '#268BD2',
      borderLight: '#93A1A1',
      gridDots: '#93A1A1',
      edgeStroke: '#839496',
      inputBg: '#E9F3D6',
      inputBorder: '#859900',
      inputText: '#657B00',
      outputBg: '#F9E4D8',
      outputBorder: '#DC322F',
      outputText: '#CB4B16',
      success: '#859900',
      warning: '#B58900',
      error: '#DC322F',
      tier1: '#93A1A1',
      tier2: '#859900',
      tier3: '#268BD2',
      tier4: '#6C71C4',
      tier5: '#B58900',
      fluid: '#2AA198',
      item: '#CB4B16',
      research: '#6C71C4',
      nodeTargetBg: '#EEE8D5',
      nodeTargetBorder: '#586E75',
      textNeutral: '#7D8D91',
    },
  ),
  makePreset(
    'kanagawa-dragon',
    'Kanagawa Dragon',
    'Soot-dark base with parchment neutrals and muted teal-gold accents.',
    'https://github.com/rebelot/kanagawa.nvim',
    {
      mode: 'dark',
      canvasBg: '#181616',
      bgSecondary: '#1F1F28',
      secondary: '#2A2A37',
      primary: '#C4B28A',
      primaryHover: '#E6C384',
      primaryDark: '#181616',
      textPrimary: '#DCD7BA',
      textSecondary: '#C8C093',
      textDim: '#938056',
      statValue: '#DCD7BA',
      borderPrimary: '#C4B28A',
      borderLight: '#54546D',
      gridDots: '#4A4945',
      edgeStroke: '#727169',
      inputBg: '#22312B',
      inputBorder: '#87A987',
      inputText: '#A3D4D5',
      outputBg: '#43242B',
      outputBorder: '#C4746E',
      outputText: '#E6C0BA',
      success: '#87A987',
      warning: '#DCA561',
      error: '#C4746E',
      tier1: '#727169',
      tier2: '#87A987',
      tier3: '#7FB4CA',
      tier4: '#938AA9',
      tier5: '#DCA561',
      fluid: '#8EA4A2',
      item: '#DCA561',
      research: '#938AA9',
      nodeTargetBg: '#2A2A37',
      nodeTargetBorder: '#DCD7BA',
    },
  ),
  makePreset(
    'gruvbox-dark',
    'Gruvbox Dark',
    'Earthy brown dark base with mustard, moss, and rust accents.',
    'https://github.com/morhetz/gruvbox',
    {
      mode: 'dark',
      canvasBg: '#282828',
      bgSecondary: '#1D2021',
      secondary: '#3C3836',
      primary: '#D79921',
      primaryHover: '#FABD2F',
      primaryDark: '#1D2021',
      textPrimary: '#FBF1C7',
      textSecondary: '#EBDBB2',
      textDim: '#A89984',
      statValue: '#FBF1C7',
      borderPrimary: '#D79921',
      borderLight: '#504945',
      gridDots: '#504945',
      edgeStroke: '#665C54',
      inputBg: '#2F3A1E',
      inputBorder: '#B8BB26',
      inputText: '#B8BB26',
      outputBg: '#4A221D',
      outputBorder: '#FB4934',
      outputText: '#FB4934',
      success: '#B8BB26',
      warning: '#FABD2F',
      error: '#FB4934',
      tier1: '#A89984',
      tier2: '#B8BB26',
      tier3: '#83A598',
      tier4: '#D3869B',
      tier5: '#FABD2F',
      fluid: '#8EC07C',
      item: '#FE8019',
      research: '#83A598',
      nodeTargetBg: '#3C3836',
      nodeTargetBorder: '#EBDBB2',
    },
  ),
  makePreset(
    'github-light-colorblind',
    'Catppuccin Latte',
    'Soft pastel light base with balanced blue, green, and rose accents.',
    'https://catppuccin.com/palette',
    {
      mode: 'light',
      canvasBg: '#EFF1F5',
      bgSecondary: '#E6E9EF',
      secondary: '#DCE0E8',
      primary: '#1E66F5',
      primaryHover: '#7287FD',
      primaryDark: '#EFF1F5',
      textPrimary: '#4C4F69',
      textSecondary: '#5C5F77',
      textDim: '#6C6F85',
      statValue: '#4C4F69',
      borderPrimary: '#1E66F5',
      borderLight: '#BCC0CC',
      gridDots: '#BCC0CC',
      edgeStroke: '#7C7F93',
      inputBg: '#E8F4E8',
      inputBorder: '#40A02B',
      inputText: '#2F7D1F',
      outputBg: '#F7E7EB',
      outputBorder: '#D20F39',
      outputText: '#B01536',
      success: '#40A02B',
      warning: '#DF8E1D',
      error: '#D20F39',
      tier1: '#7C7F93',
      tier2: '#40A02B',
      tier3: '#1E66F5',
      tier4: '#8839EF',
      tier5: '#DF8E1D',
      fluid: '#179299',
      item: '#FE640B',
      research: '#8839EF',
      nodeTargetBg: '#DCE0E8',
      nodeTargetBorder: '#4C4F69',
      textNeutral: '#7C7F93',
    },
  ),
  makePreset(
    'night-owl',
    'Night Owl',
    'Inky navy dark base with bright blue, aqua, and magenta accents.',
    'https://github.com/sdras/night-owl-vscode-theme',
    {
      mode: 'dark',
      canvasBg: '#011627',
      bgSecondary: '#001A2E',
      secondary: '#102A43',
      primary: '#82AAFF',
      primaryHover: '#C792EA',
      primaryDark: '#011627',
      textPrimary: '#D6DEEB',
      textSecondary: '#AEC2D5',
      textDim: '#7F9CB3',
      statValue: '#E6EDF7',
      borderPrimary: '#82AAFF',
      borderLight: '#1D3A53',
      gridDots: '#1D3A53',
      edgeStroke: '#30506D',
      inputBg: '#0C2B24',
      inputBorder: '#21C7A8',
      inputText: '#7FE8D4',
      outputBg: '#3A1C35',
      outputBorder: '#FF5874',
      outputText: '#FF9AAE',
      success: '#21C7A8',
      warning: '#E3D26F',
      error: '#FF5874',
      tier1: '#7F9CB3',
      tier2: '#21C7A8',
      tier3: '#82AAFF',
      tier4: '#C792EA',
      tier5: '#E3D26F',
      fluid: '#7FDBFF',
      item: '#F78C6C',
      research: '#C792EA',
      nodeTargetBg: '#102A43',
      nodeTargetBorder: '#D6DEEB',
    },
  ),
  makePreset(
    'verdant-forge',
    'Verdant Forge',
    'Deep forest dark base with vivid green highlights and cool cyan accents.',
    'custom:verdant-forge',
    {
      mode: 'dark',
      canvasBg: '#0F1712',
      bgSecondary: '#16241C',
      secondary: '#1F2F25',
      primary: '#66D97A',
      primaryHover: '#9AF2AF',
      primaryDark: '#0F1712',
      textPrimary: '#E9F9EC',
      textSecondary: '#B8D8BF',
      textDim: '#94B39B',
      statValue: '#E9F9EC',
      borderPrimary: '#66D97A',
      borderLight: '#315140',
      gridDots: '#2A4637',
      edgeStroke: '#446352',
      inputBg: '#173224',
      inputBorder: '#55C46D',
      inputText: '#A7F3BB',
      outputBg: '#3B211F',
      outputBorder: '#E87064',
      outputText: '#F6B3AA',
      success: '#55C46D',
      warning: '#E0B25E',
      error: '#E87064',
      tier1: '#86A693',
      tier2: '#55C46D',
      tier3: '#63C6F2',
      tier4: '#9E8BFF',
      tier5: '#E6C86D',
      fluid: '#63C6F2',
      item: '#B8D67A',
      research: '#53B5D4',
      nodeTargetBg: '#253A2F',
      nodeTargetBorder: '#E9F9EC',
    },
  ),
  makePreset(
    'steampunk-brass',
    'Steampunk Brass',
    'Soot-dark base with brass, copper, and olive accents.',
    'custom:steampunk-brass',
    {
      mode: 'dark',
      canvasBg: '#1A130F',
      bgSecondary: '#251B14',
      secondary: '#32231A',
      primary: '#C99A43',
      primaryHover: '#E6BC67',
      primaryDark: '#1A130F',
      textPrimary: '#F2DFC2',
      textSecondary: '#D2BA97',
      textDim: '#A98F6D',
      statValue: '#F2DFC2',
      borderPrimary: '#C99A43',
      borderLight: '#5C4634',
      gridDots: '#4D3B2D',
      edgeStroke: '#6B5440',
      inputBg: '#2B3021',
      inputBorder: '#9BB179',
      inputText: '#C7DE9F',
      outputBg: '#4B2A1F',
      outputBorder: '#D9774C',
      outputText: '#F1B08F',
      success: '#9BB179',
      warning: '#D9A85B',
      error: '#D9774C',
      tier1: '#8F7A63',
      tier2: '#9BB179',
      tier3: '#6AA4C6',
      tier4: '#B489B5',
      tier5: '#D9A85B',
      fluid: '#6AA4C6',
      item: '#C99A43',
      research: '#8BB7C9',
      nodeTargetBg: '#3A2A1F',
      nodeTargetBorder: '#F2DFC2',
    },
  ),
  makePreset(
    'cyberpunk-neon',
    'Cyberpunk Neon',
    'Deep violet dark base with bright magenta and cyan neon accents.',
    'custom:cyberpunk-neon',
    {
      mode: 'dark',
      canvasBg: '#0D0A1E',
      bgSecondary: '#151231',
      secondary: '#201A45',
      primary: '#FF4FD8',
      primaryHover: '#FF7EE8',
      primaryDark: '#0D0A1E',
      textPrimary: '#F5E7FF',
      textSecondary: '#CAB8E6',
      textDim: '#9A86BF',
      statValue: '#F5E7FF',
      borderPrimary: '#00E7FF',
      borderLight: '#3A2F63',
      gridDots: '#34295A',
      edgeStroke: '#5A4A8A',
      inputBg: '#0F2D33',
      inputBorder: '#00E7FF',
      inputText: '#9EF7FF',
      outputBg: '#3A1533',
      outputBorder: '#FF4FD8',
      outputText: '#FF9FEF',
      success: '#22D8A8',
      warning: '#FFC34D',
      error: '#FF4FD8',
      tier1: '#8C7BAD',
      tier2: '#22D8A8',
      tier3: '#00E7FF',
      tier4: '#B88CFF',
      tier5: '#FFC34D',
      fluid: '#00E7FF',
      item: '#FF7A5C',
      research: '#B88CFF',
      nodeTargetBg: '#251E4F',
      nodeTargetBorder: '#F5E7FF',
    },
  ),
  makePreset(
    'one-dark',
    'One Dark',
    'Charcoal dark base with balanced blue, green, and purple accents.',
    'https://github.com/one-dark/vscode-one-dark-theme',
    {
      mode: 'dark',
      canvasBg: '#282C34',
      bgSecondary: '#21252B',
      secondary: '#2C313C',
      primary: '#61AFEF',
      primaryHover: '#528BFF',
      primaryDark: '#21252B',
      textPrimary: '#ABB2BF',
      textSecondary: '#D7DAE0',
      textDim: '#9DA5B4',
      statValue: '#D7DAE0',
      borderPrimary: '#4D78CC',
      borderLight: '#3B4048',
      gridDots: '#3B4048',
      edgeStroke: '#5C6370',
      inputBg: '#24362B',
      inputBorder: '#98C379',
      inputText: '#98C379',
      outputBg: '#3B2428',
      outputBorder: '#E06C75',
      outputText: '#E06C75',
      success: '#98C379',
      warning: '#E5C07B',
      error: '#E06C75',
      tier1: '#7F848E',
      tier2: '#98C379',
      tier3: '#61AFEF',
      tier4: '#C678DD',
      tier5: '#E5C07B',
      fluid: '#56B6C2',
      item: '#D19A66',
      research: '#C678DD',
      nodeTargetBg: '#2C313C',
      nodeTargetBorder: '#D7DAE0',
    },
  ),
  makePreset(
    'rose-pine-moon',
    'Rose Pine Moon',
    'Muted indigo dark base with soft rose and lilac accents.',
    'https://rosepinetheme.com/palette',
    {
      mode: 'dark',
      canvasBg: '#232136',
      bgSecondary: '#2A273F',
      secondary: '#393552',
      primary: '#C4A7E7',
      primaryHover: '#EA9A97',
      primaryDark: '#232136',
      textPrimary: '#E0DEF4',
      textSecondary: '#B9B4D0',
      textDim: '#908CAA',
      statValue: '#E0DEF4',
      borderPrimary: '#C4A7E7',
      borderLight: '#56526E',
      gridDots: '#56526E',
      edgeStroke: '#6E6A86',
      inputBg: '#2A3248',
      inputBorder: '#9CCFD8',
      inputText: '#9CCFD8',
      outputBg: '#4A2944',
      outputBorder: '#EB6F92',
      outputText: '#EB6F92',
      success: '#3E8FB0',
      warning: '#F6C177',
      error: '#EB6F92',
      tier1: '#908CAA',
      tier2: '#9CCFD8',
      tier3: '#3E8FB0',
      tier4: '#C4A7E7',
      tier5: '#F6C177',
      fluid: '#9CCFD8',
      item: '#EA9A97',
      research: '#C4A7E7',
      nodeTargetBg: '#393552',
      nodeTargetBorder: '#E0DEF4',
    },
  ),
  makePreset(
    'everforest-light',
    'Everforest Light',
    'Warm cream light base with gentle green and aqua accents.',
    'https://github.com/sainnhe/everforest',
    {
      mode: 'light',
      canvasBg: '#FDF6E3',
      bgSecondary: '#F4F0D9',
      secondary: '#EFEBD4',
      primary: '#35A77C',
      primaryHover: '#3A94C5',
      primaryDark: '#FDF6E3',
      textPrimary: '#5C6A72',
      textSecondary: '#6F7A80',
      textDim: '#939F91',
      statValue: '#4F5B61',
      borderPrimary: '#35A77C',
      borderLight: '#C9C6B4',
      gridDots: '#C9C6B4',
      edgeStroke: '#A6B0A0',
      inputBg: '#E9F0E9',
      inputBorder: '#35A77C',
      inputText: '#2F7C5C',
      outputBg: '#FBE8E1',
      outputBorder: '#F85552',
      outputText: '#D74C49',
      success: '#35A77C',
      warning: '#DFA000',
      error: '#F85552',
      tier1: '#A6B0A0',
      tier2: '#35A77C',
      tier3: '#3A94C5',
      tier4: '#DF69BA',
      tier5: '#DFA000',
      fluid: '#3A94C5',
      item: '#F57D26',
      research: '#DF69BA',
      nodeTargetBg: '#EFEBD4',
      nodeTargetBorder: '#5C6A72',
      textNeutral: '#939F91',
    },
  ),
  makePreset(
    'gruvbox-light',
    'Gruvbox Light',
    'Warm sand light base with earthy mustard and rust accents.',
    'https://github.com/morhetz/gruvbox',
    {
      mode: 'light',
      canvasBg: '#FBF1C7',
      bgSecondary: '#F2E5BC',
      secondary: '#EBDCB2',
      primary: '#B57614',
      primaryHover: '#D79921',
      primaryDark: '#FBF1C7',
      textPrimary: '#282828',
      textSecondary: '#3C3836',
      textDim: '#7C6F64',
      statValue: '#282828',
      borderPrimary: '#B57614',
      borderLight: '#BDAE93',
      gridDots: '#BDAE93',
      edgeStroke: '#A89984',
      inputBg: '#E4E6BF',
      inputBorder: '#79740E',
      inputText: '#79740E',
      outputBg: '#F2D8C9',
      outputBorder: '#9D0006',
      outputText: '#9D0006',
      success: '#79740E',
      warning: '#B57614',
      error: '#9D0006',
      tier1: '#A89984',
      tier2: '#79740E',
      tier3: '#076678',
      tier4: '#8F3F71',
      tier5: '#B57614',
      fluid: '#427B58',
      item: '#AF3A03',
      research: '#076678',
      nodeTargetBg: '#EBDCB2',
      nodeTargetBorder: '#282828',
      textNeutral: '#665C54',
    },
  ),
  makePreset(
    'rose-pine-dawn',
    'Rose Pine Dawn',
    'Ivory light base with mauve, rose, and soft teal accents.',
    'https://rosepinetheme.com/palette',
    {
      mode: 'light',
      canvasBg: '#FAF4ED',
      bgSecondary: '#FFFAF3',
      secondary: '#F2E9E1',
      primary: '#907AA9',
      primaryHover: '#B4637A',
      primaryDark: '#FAF4ED',
      textPrimary: '#464261',
      textSecondary: '#797593',
      textDim: '#9893A5',
      statValue: '#464261',
      borderPrimary: '#907AA9',
      borderLight: '#CECACD',
      gridDots: '#DFDAD9',
      edgeStroke: '#CECACD',
      inputBg: '#E7F1EE',
      inputBorder: '#6D8F89',
      inputText: '#4E746E',
      outputBg: '#F6E1E3',
      outputBorder: '#B4637A',
      outputText: '#B4637A',
      success: '#6D8F89',
      warning: '#EA9D34',
      error: '#B4637A',
      tier1: '#9893A5',
      tier2: '#6D8F89',
      tier3: '#56949F',
      tier4: '#907AA9',
      tier5: '#EA9D34',
      fluid: '#56949F',
      item: '#D7827E',
      research: '#286983',
      nodeTargetBg: '#F2E9E1',
      nodeTargetBorder: '#464261',
      textNeutral: '#9893A5',
    },
  ),
  makePreset(
    'one-light',
    'One Light',
    'Neutral gray light base with crisp blue, green, and orange accents.',
    'https://github.com/akamud/vscode-theme-onelight',
    {
      mode: 'light',
      canvasBg: '#FAFAFA',
      bgSecondary: '#EAEAEB',
      secondary: '#E5E5E6',
      primary: '#526FFF',
      primaryHover: '#5871EF',
      primaryDark: '#FAFAFA',
      textPrimary: '#383A42',
      textSecondary: '#424243',
      textDim: '#696C77',
      statValue: '#383A42',
      borderPrimary: '#526FFF',
      borderLight: '#DBDBDC',
      gridDots: '#DBDBDC',
      edgeStroke: '#9D9D9F',
      inputBg: '#EEF6EC',
      inputBorder: '#B7D8B6',
      inputText: '#50A14F',
      outputBg: '#FDE3DA',
      outputBorder: '#E45649',
      outputText: '#E45649',
      success: '#50A14F',
      warning: '#986801',
      error: '#E45649',
      tier1: '#A0A1A7',
      tier2: '#50A14F',
      tier3: '#4078F2',
      tier4: '#A626A4',
      tier5: '#C18401',
      fluid: '#0184BC',
      item: '#986801',
      research: '#4078F2',
      nodeTargetBg: '#E5E5E6',
      nodeTargetBorder: '#383A42',
      textNeutral: '#696C77',
    },
  ),
  makePreset(
    'sunset-horizon',
    'Sunset Horizon',
    'Warm peach light base with coral, orange, and dusk-purple accents.',
    'custom:sunset-horizon',
    {
      mode: 'light',
      canvasBg: '#FFF1E6',
      bgSecondary: '#FFE2D2',
      secondary: '#FFD2C6',
      primary: '#E25544',
      primaryHover: '#FF7A59',
      primaryDark: '#FFF1E6',
      textPrimary: '#3B2434',
      textSecondary: '#5B3B4F',
      textDim: '#7B5A70',
      statValue: '#3B2434',
      borderPrimary: '#E25544',
      borderLight: '#D4A99C',
      gridDots: '#D4A99C',
      edgeStroke: '#B07D83',
      inputBg: '#E4F4EA',
      inputBorder: '#3F9C6D',
      inputText: '#2E764F',
      outputBg: '#FDE1D9',
      outputBorder: '#D9503A',
      outputText: '#B7432F',
      success: '#3F9C6D',
      warning: '#D98A3A',
      error: '#D9503A',
      tier1: '#9C7E86',
      tier2: '#3F9C6D',
      tier3: '#5A93D6',
      tier4: '#9E6AD4',
      tier5: '#D98A3A',
      fluid: '#5A93D6',
      item: '#D96B2B',
      research: '#8A5DD1',
      nodeTargetBg: '#FFD2C6',
      nodeTargetBorder: '#3B2434',
      textNeutral: '#7B5A70',
    },
  ),
];
