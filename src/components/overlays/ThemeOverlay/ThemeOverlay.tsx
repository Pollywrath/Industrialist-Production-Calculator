import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette, RotateCcw, Undo2, X } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import {
  DEFAULT_EDGE_LINE_STYLE,
  DEFAULT_EDGE_PATH_STYLE,
  hasCustomEdgeStyleSettings,
  useEdgeThemeStore,
  type EdgeAnimationStyle,
  type EdgeLineStyle,
  type EdgePathStyle,
} from '../../../stores/useEdgeThemeStore';
import {
  discoverThemeVariables,
  loadThemeOverrides,
  replaceThemeOverridesForVariables,
  resetAllThemeOverrides,
  resetThemeVariableOverride,
  setThemeVariableOverride,
  type ThemeVariableDefinition,
} from '../../../theme/themeManager';
import { THEME_PRESETS, type ThemePreset } from '../../../theme/themePresets';
import { detectPixiBackendCapabilities } from '../../../canvas/pixiCapabilities';
import {
  getActiveRendererLabel,
  isRendererChoiceAvailable,
  useCanvasRendererStore,
  type CanvasRendererPreference,
  type RendererAvailability,
} from '../../../stores/useCanvasRendererStore';
import styles from './ThemeOverlay.module.css';

interface VariableGroup {
  id: string;
  label: string;
  description: string;
  variables: ThemeVariableDefinition[];
}

interface VariableFieldMeta {
  name: string;
  label: string;
  hint?: string;
}

interface VariableGroupConfig {
  id: string;
  label: string;
  description: string;
  variables: VariableFieldMeta[];
}

interface EdgeOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

interface RendererOptionProps {
  preference: CanvasRendererPreference;
  selected: boolean;
  availability: RendererAvailability;
  label: string;
  description: string;
  onChoose(preference: CanvasRendererPreference): void;
}

function RendererOption({
  preference,
  selected,
  availability,
  label,
  description,
  onChoose,
}: RendererOptionProps) {
  const status =
    availability === 'available'
      ? 'Available'
      : availability === 'unavailable'
        ? 'Unavailable on this device'
        : 'Checking support…';

  return (
    <button
      type="button"
      className={`${styles['renderer-option']} ${selected ? styles['is-active'] : ''}`}
      onClick={() => onChoose(preference)}
      disabled={!isRendererChoiceAvailable(preference, availability)}
      aria-pressed={selected}
    >
      <span className={styles['renderer-option-top']}>
        <span className={styles['renderer-option-label']}>{label}</span>
        <span className={styles['renderer-option-status']}>{status}</span>
      </span>
      <span className={styles['renderer-option-description']}>{description}</span>
    </button>
  );
}

const ADVANCED_GROUPS: VariableGroupConfig[] = [
  {
    id: 'surfaces',
    label: 'App Surfaces',
    description: 'Main backgrounds, overlays, and panel layers.',
    variables: [
      { name: '--theme-color-canvas-bg', label: 'Canvas Background' },
      { name: '--theme-color-bg-secondary', label: 'Panel Background' },
      { name: '--theme-color-bg-tertiary', label: 'Elevated Surface' },
      { name: '--theme-color-secondary', label: 'Section Surface' },
      { name: '--theme-color-bg-active', label: 'Active Surface' },
      { name: '--theme-color-overlay-backdrop', label: 'Overlay Backdrop' },
      { name: '--theme-color-panel-empty-bg', label: 'Empty Panel Fill' },
    ],
  },
  {
    id: 'text',
    label: 'Text & Readability',
    description: 'Primary and supporting text colors used across the app.',
    variables: [
      { name: '--theme-color-text-primary', label: 'Primary Text' },
      { name: '--theme-color-text-secondary', label: 'Secondary Text' },
      { name: '--theme-color-text-dim', label: 'Muted Text' },
      { name: '--theme-color-text-neutral', label: 'Neutral Text' },
      { name: '--theme-color-stat-value', label: 'Stat Value Text' },
      { name: '--theme-color-text-error', label: 'Error Text' },
    ],
  },
  {
    id: 'brand',
    label: 'Brand & Interactive',
    description: 'Primary action colors and translucent button overlays.',
    variables: [
      { name: '--theme-color-primary', label: 'Primary Accent' },
      { name: '--theme-color-primary-hover', label: 'Primary Accent (Hover)' },
      { name: '--theme-color-primary-dark', label: 'Primary Contrast Text' },
      { name: '--theme-color-tier-default', label: 'Default Tier Accent' },
      { name: '--theme-color-btn-hover-overlay', label: 'Button Hover Overlay' },
      {
        name: '--theme-color-btn-bg-translucent',
        label: 'Translucent Button Background',
      },
      { name: '--theme-color-translucent-dark', label: 'Translucent Dark Overlay' },
    ],
  },
  {
    id: 'borders',
    label: 'Borders, Grid & Edges',
    description: 'Linework colors for borders, grid dots, and edge strokes.',
    variables: [
      { name: '--theme-color-border-primary', label: 'Primary Border' },
      { name: '--theme-color-border-light', label: 'Secondary Border' },
      { name: '--theme-color-border-divider', label: 'Divider Border' },
      { name: '--theme-color-border-light-translucent', label: 'Translucent Border' },
      { name: '--theme-color-grid-dots', label: 'Canvas Grid Dots' },
      { name: '--theme-color-edge-stroke', label: 'Edge Stroke' },
      { name: '--theme-color-edge-selected-stroke', label: 'Selected Edge Stroke' },
      { name: '--theme-color-handle-border', label: 'Handle Outline' },
    ],
  },
  {
    id: 'nodes',
    label: 'Nodes & Targets',
    description: 'Node body, target, and selection styling.',
    variables: [
      { name: '--theme-color-node-bg', label: 'Node Background' },
      { name: '--theme-color-node-border', label: 'Node Border' },
      { name: '--theme-color-node-target-bg', label: 'Node Target Background' },
      { name: '--theme-color-node-target-border', label: 'Node Target Border' },
      { name: '--theme-color-node-selected-border', label: 'Selected Node Border' },
    ],
  },
  {
    id: 'io-input',
    label: 'Input Channel',
    description: 'Input ports, bars, and supplied/deficient indicators.',
    variables: [
      { name: '--theme-color-input-bg', label: 'Input Background' },
      { name: '--theme-color-input-border', label: 'Input Border' },
      { name: '--theme-color-input-text', label: 'Input Text' },
      { name: '--theme-color-handle-input-supplied', label: 'Input Handle (Supplied)' },
      { name: '--theme-color-handle-input-deficient', label: 'Input Handle (Deficient)' },
    ],
  },
  {
    id: 'io-output',
    label: 'Output Channel',
    description: 'Output ports, bars, and connected/excess indicators.',
    variables: [
      { name: '--theme-color-output-bg', label: 'Output Background' },
      { name: '--theme-color-output-border', label: 'Output Border' },
      { name: '--theme-color-output-text', label: 'Output Text' },
      {
        name: '--theme-color-handle-output-connected',
        label: 'Output Handle (Connected)',
      },
      { name: '--theme-color-handle-output-excess', label: 'Output Handle (Excess)' },
    ],
  },
  {
    id: 'status',
    label: 'Status & Alerts',
    description: 'Success, warning, error, and confirmation palette roles.',
    variables: [
      { name: '--theme-color-success', label: 'Success' },
      { name: '--theme-color-warning', label: 'Warning' },
      { name: '--theme-color-error', label: 'Error' },
      { name: '--theme-color-success-translucent', label: 'Success Background Tint' },
      { name: '--theme-color-warning-translucent', label: 'Warning Background Tint' },
      { name: '--theme-color-error-translucent', label: 'Error Background Tint' },
      { name: '--theme-color-confirm-success', label: 'Confirm Dialog Success' },
      { name: '--theme-color-confirm-info', label: 'Confirm Dialog Info' },
      { name: '--theme-color-confirm-error', label: 'Confirm Dialog Error' },
    ],
  },
  {
    id: 'domain',
    label: 'Domain Palette',
    description: 'Tier colors and domain-specific categories (fluid/item/research).',
    variables: [
      { name: '--theme-color-tier-1', label: 'Tier 1' },
      { name: '--theme-color-tier-2', label: 'Tier 2' },
      { name: '--theme-color-tier-3', label: 'Tier 3' },
      { name: '--theme-color-tier-4', label: 'Tier 4' },
      { name: '--theme-color-tier-5', label: 'Tier 5' },
      { name: '--theme-color-fluid', label: 'Fluid' },
      { name: '--theme-color-item', label: 'Item' },
      { name: '--theme-color-research', label: 'Research' },
    ],
  },
  {
    id: 'constants',
    label: 'Constant Helpers',
    description: 'Reference colors used in a few utility contexts.',
    variables: [
      { name: '--theme-color-white', label: 'White Constant' },
      { name: '--theme-color-black', label: 'Black Constant' },
    ],
  },
];

const EDGE_LINE_OPTIONS: EdgeOption<EdgeLineStyle>[] = [
  {
    value: 'solid',
    label: 'Solid',
    description: 'Draw each connection as an unbroken line.',
  },
  {
    value: 'dashed',
    label: 'Dashed',
    description: 'Use a dash pattern for each connection.',
  },
  {
    value: 'dotted',
    label: 'Dotted',
    description: 'Use a dotted pattern for each connection.',
  },
];

const EDGE_ANIMATION_OPTIONS: EdgeOption<EdgeAnimationStyle>[] = [
  {
    value: 'none',
    label: 'No Animation',
    description: 'Keep the selected line pattern static.',
  },
  {
    value: 'moving-dashes',
    label: 'Moving Dashes or Dots',
    description: 'Move the selected dash or dot pattern toward each target.',
  },
  {
    value: 'pulse-arrow',
    label: 'Pulse Arrows',
    description: 'Show arrows moving toward each target.',
  },
];

const EDGE_PATH_OPTIONS: EdgeOption<EdgePathStyle>[] = [
  {
    value: 'straight',
    label: 'Straight Line',
    description: 'Direct one-segment connection.',
  },
  {
    value: 'bezier',
    label: 'Bezier Curve',
    description: 'Smooth curved edge between nodes.',
  },
  {
    value: 'orthogonal',
    label: 'Orthogonal',
    description: 'Right-angle routing with horizontal and vertical segments.',
  },
];

const VARIABLE_META_BY_NAME = (() => {
  const map = new Map<
    string,
    {
      groupId: string;
      label: string;
      hint?: string;
      order: number;
    }
  >();

  for (let groupIndex = 0; groupIndex < ADVANCED_GROUPS.length; groupIndex++) {
    const group = ADVANCED_GROUPS[groupIndex];
    for (let fieldIndex = 0; fieldIndex < group.variables.length; fieldIndex++) {
      const field = group.variables[fieldIndex];
      map.set(field.name, {
        groupId: group.id,
        label: field.label,
        hint: field.hint,
        order: groupIndex * 100 + fieldIndex,
      });
    }
  }
  return map;
})();

const GROUP_META_BY_ID = new Map(
  ADVANCED_GROUPS.map((group) => [
    group.id,
    { id: group.id, label: group.label, description: group.description },
  ]),
);

function toTitleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function fallbackVariableLabel(name: string): string {
  const tokenLabels: Record<string, string> = {
    bg: 'Background',
    btn: 'Button',
    io: 'IO',
  };
  const base = name.replace(/^--theme-color-/, '');
  return base
    .split('-')
    .map((token) => {
      if (/^\d+$/.test(token)) return token;
      return tokenLabels[token] ?? toTitleCase(token);
    })
    .join(' ');
}

function toColorInputValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-f]{8}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }
  if (/^#[0-9a-f]{4}$/.test(normalized)) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return null;
}

function sourceAttributionLabel(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.host.replace(/^www\./, '');

    if (host === 'github.com') {
      const repoParts = parsed.pathname
        .split('/')
        .filter((part) => part.length > 0)
        .slice(0, 2);
      if (repoParts.length === 2) {
        return `${host}/${repoParts[0]}/${repoParts[1]}`;
      }
    }

    return host;
  } catch {
    return sourceUrl;
  }
}

function hasStoredColorOverrides(): boolean {
  const overrides = loadThemeOverrides();
  return Object.keys(overrides).some((name) => name.startsWith('--theme-color-'));
}

function VariableRow({
  definition,
  value,
  label,
  hint,
  onValueChange,
  onReset,
}: {
  definition: ThemeVariableDefinition;
  value: string;
  label: string;
  hint?: string;
  onValueChange: (name: string, nextValue: string) => void;
  onReset: (name: string) => void;
}) {
  const colorValue = definition.category === 'color' ? toColorInputValue(value) : null;

  return (
    <div className={styles['variable-row']}>
      <div className={styles['variable-meta']}>
        <span className={styles['variable-label']}>{label}</span>
        {hint ? <span className={styles['variable-hint']}>{hint}</span> : null}
        <code className={styles['variable-name']}>{definition.name}</code>
      </div>
      <div className={styles['variable-controls']}>
        {definition.category === 'color' && (
          <span
            className={styles['color-swatch']}
            style={{ '--swatch-bg': value } as React.CSSProperties}
          />
        )}
        {colorValue && (
          <input
            type="color"
            value={colorValue}
            className={styles['color-input']}
            onChange={(e) => onValueChange(definition.name, e.target.value)}
          />
        )}
        <input
          type="text"
          value={value}
          className={styles['value-input']}
          onChange={(e) => onValueChange(definition.name, e.target.value)}
        />
        <button
          className={styles['row-reset-btn']}
          onClick={() => onReset(definition.name)}
          title="Reset variable"
        >
          <Undo2 size={14} />
        </button>
      </div>
    </div>
  );
}

function PresetCard({
  preset,
  isActive,
  onApply,
}: {
  preset: ThemePreset;
  isActive: boolean;
  onApply: () => void;
}) {
  return (
    <button
      className={`${styles['preset-card']} ${isActive ? styles['is-active'] : ''}`}
      onClick={onApply}
      title={`Apply ${preset.name}`}
    >
      <div className={styles['preset-card-top']}>
        <span className={styles['preset-mode']}>{preset.mode === 'dark' ? 'DARK' : 'LIGHT'}</span>
      </div>
      <div className={styles['preset-name']}>{preset.name}</div>
      <div className={styles['preset-description']}>{preset.description}</div>
      <div className={styles['preset-swatches']}>
        {preset.swatches.map((swatch, index) => (
          <span
            key={`${preset.id}-swatch-${index}`}
            className={styles['preset-swatch']}
            style={{ '--preset-swatch-bg': swatch } as React.CSSProperties}
          />
        ))}
      </div>
      <div className={styles['preset-source']}>{sourceAttributionLabel(preset.sourceUrl)}</div>
    </button>
  );
}

export function ThemeOverlay() {
  const isThemeOverlayOpen = useUIStore((s) => s.isThemeOverlayOpen);

  if (!isThemeOverlayOpen) return null;

  return <ThemeOverlayModal />;
}

function ThemeOverlayModal() {
  const setThemeOverlayOpen = useUIStore((s) => s.setThemeOverlayOpen);
  const variables = discoverThemeVariables();
  const [overrides, setOverrides] = useState(loadThemeOverrides);
  const [activeView, setActiveView] = useState<'presets' | 'advanced' | 'edges' | 'renderer'>(
    'presets',
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(() =>
    hasStoredColorOverrides() ? null : 'default',
  );
  const lineStyle = useEdgeThemeStore((s) => s.lineStyle);
  const pathStyle = useEdgeThemeStore((s) => s.pathStyle);
  const animationStyle = useEdgeThemeStore((s) => s.animationStyle);
  const setLineStyle = useEdgeThemeStore((s) => s.setLineStyle);
  const setPathStyle = useEdgeThemeStore((s) => s.setPathStyle);
  const setAnimationStyle = useEdgeThemeStore((s) => s.setAnimationStyle);
  const resetEdgeStyles = useEdgeThemeStore((s) => s.resetEdgeStyles);
  const rendererPreference = useCanvasRendererStore((s) => s.preference);
  const activeRenderer = useCanvasRendererStore((s) => s.activeRenderer);
  const webgpuAvailability = useCanvasRendererStore((s) => s.webgpuAvailability);
  const webglAvailability = useCanvasRendererStore((s) => s.webglAvailability);
  const setRendererPreference = useCanvasRendererStore((s) => s.setPreference);
  const setBackendAvailability = useCanvasRendererStore((s) => s.setBackendAvailability);

  useEffect(() => {
    if (activeView !== 'renderer') return;
    let cancelled = false;
    void detectPixiBackendCapabilities()
      .then((capabilities) => {
        if (cancelled) return;
        setBackendAvailability('webgpu', capabilities.webgpu ? 'available' : 'unavailable');
        setBackendAvailability('webgl', capabilities.webgl ? 'available' : 'unavailable');
      })
      .catch((error: unknown) => {
        console.warn('PixiJS backend availability could not be checked.', error);
        if (cancelled) return;
        setBackendAvailability('webgpu', 'unavailable');
        setBackendAvailability('webgl', 'unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, setBackendAvailability]);

  const colorVariables = variables.filter((variable) => variable.category === 'color');

  const hasColorOverrides = colorVariables.some((variable) => variable.name in overrides);
  const hasEdgeOverrides = hasCustomEdgeStyleSettings({ lineStyle, pathStyle, animationStyle });
  const hasCustomizations = hasColorOverrides || hasEdgeOverrides;
  const colorVariableNames = colorVariables.map((variable) => variable.name);

  const groupedColorVariables: VariableGroup[] = (() => {
    const groups = new Map<string, VariableGroup>();

    for (let i = 0; i < colorVariables.length; i++) {
      const variable = colorVariables[i];
      const fieldMeta = VARIABLE_META_BY_NAME.get(variable.name);
      const groupMeta = fieldMeta
        ? GROUP_META_BY_ID.get(fieldMeta.groupId)
        : {
            id: 'misc',
            label: 'Uncategorized',
            description: 'Variables without an explicit group.',
          };

      if (!groupMeta) continue;

      const existing = groups.get(groupMeta.id);
      if (existing) {
        existing.variables.push(variable);
      } else {
        groups.set(groupMeta.id, {
          id: groupMeta.id,
          label: groupMeta.label,
          description: groupMeta.description,
          variables: [variable],
        });
      }
    }

    const ordered: VariableGroup[] = [];
    for (let i = 0; i < ADVANCED_GROUPS.length; i++) {
      const group = groups.get(ADVANCED_GROUPS[i].id);
      if (!group) continue;
      ordered.push(group);
    }

    const misc = groups.get('misc');
    if (misc) ordered.push(misc);

    for (let i = 0; i < ordered.length; i++) {
      const group = ordered[i];
      group.variables.sort((a, b) => {
        const aMeta = VARIABLE_META_BY_NAME.get(a.name);
        const bMeta = VARIABLE_META_BY_NAME.get(b.name);

        if (aMeta && bMeta) return aMeta.order - bMeta.order;
        if (aMeta) return -1;
        if (bMeta) return 1;

        const aLabel = fallbackVariableLabel(a.name);
        const bLabel = fallbackVariableLabel(b.name);
        return aLabel.localeCompare(bLabel);
      });
    }

    return ordered;
  })();

  const darkPresets = THEME_PRESETS.filter((preset) => preset.mode === 'dark');
  const lightPresets = THEME_PRESETS.filter((preset) => preset.mode === 'light');

  const getValueFor = (variable: ThemeVariableDefinition): string =>
    overrides[variable.name] ?? variable.defaultValue;

  const applyValue = (name: string, nextValue: string) => {
    const nextOverrides = setThemeVariableOverride(name, nextValue);
    setOverrides(nextOverrides);
    setActivePresetId(null);
  };

  const resetOne = (name: string) => {
    const nextOverrides = resetThemeVariableOverride(name);
    setOverrides(nextOverrides);
    setActivePresetId(null);
  };

  const applyPreset = (preset: ThemePreset) => {
    const nextOverrides = replaceThemeOverridesForVariables(colorVariableNames, preset.overrides);
    setOverrides(nextOverrides);
    setActivePresetId(preset.id);
  };

  const resetAll = async () => {
    const confirmed = await useUIStore.getState().confirm({
      title: 'Reset Theme Editor',
      message:
        'Reset all color settings and edge display settings back to defaults? This will remove current customizations.',
      confirmLabel: 'Reset Theme',
      cancelLabel: 'Keep Theme',
      intent: 'error',
    });

    if (!confirmed) return;

    resetAllThemeOverrides(colorVariables);
    const nextOverrides = resetThemeVariableOverride('--theme-native-color-scheme');
    setOverrides(nextOverrides);
    resetEdgeStyles();
    setActivePresetId('default');
  };

  return createPortal(
    <div className={styles['theme-overlay']} onClick={() => setThemeOverlayOpen(false)}>
      <div className={styles['theme-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['theme-header']}>
          <div className={styles['theme-title']}>
            <Palette size={18} />
            <span>Theme Editor</span>
          </div>
          <button className={styles['theme-close']} onClick={() => setThemeOverlayOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className={styles['theme-tabs']}>
          <button
            className={`${styles['tab-btn']} ${activeView === 'presets' ? styles['is-active'] : ''}`}
            onClick={() => setActiveView('presets')}
          >
            Presets
          </button>
          <button
            className={`${styles['tab-btn']} ${activeView === 'advanced' ? styles['is-active'] : ''}`}
            onClick={() => setActiveView('advanced')}
          >
            Advanced Editing
          </button>
          <button
            className={`${styles['tab-btn']} ${activeView === 'edges' ? styles['is-active'] : ''}`}
            onClick={() => setActiveView('edges')}
          >
            Edge Editing
          </button>
          <button
            className={`${styles['tab-btn']} ${activeView === 'renderer' ? styles['is-active'] : ''}`}
            onClick={() => setActiveView('renderer')}
          >
            Renderer
          </button>
        </div>

        <div className={styles['theme-content']}>
          {activeView === 'presets' ? (
            colorVariables.length === 0 ? (
              <div className={styles['empty-state']}>
                No color theme variables were discovered from `:root`. Confirm `src/index.css` is
                loaded.
              </div>
            ) : (
              <div className={styles['presets-view']}>
                <div className={styles['presets-intro']}>
                  Select a preset first. Available sets: {darkPresets.length} dark and{' '}
                  {lightPresets.length} light.
                </div>
                <div className={styles['preset-mode-section']}>
                  <div className={styles['preset-mode-title']}>
                    Dark Presets ({darkPresets.length})
                  </div>
                  <div className={styles['preset-grid']}>
                    {darkPresets.map((preset) => (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        isActive={preset.id === activePresetId}
                        onApply={() => applyPreset(preset)}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles['preset-mode-section']}>
                  <div className={styles['preset-mode-title']}>
                    Light Presets ({lightPresets.length})
                  </div>
                  <div className={styles['preset-grid']}>
                    {lightPresets.map((preset) => (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        isActive={preset.id === activePresetId}
                        onApply={() => applyPreset(preset)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : activeView === 'advanced' ? (
            colorVariables.length === 0 ? (
              <div className={styles['empty-state']}>
                No color theme variables were discovered from `:root`. Confirm `src/index.css` is
                loaded.
              </div>
            ) : (
              <div className={styles['advanced-groups']}>
                <div className={styles['advanced-intro']}>
                  Color variables are grouped by where they appear in the UI.
                </div>
                {groupedColorVariables.map((group) => (
                  <section key={group.id} className={styles['section']}>
                    <h3 className={styles['section-title']}>{group.label}</h3>
                    <p className={styles['section-description']}>{group.description}</p>
                    <div className={styles['variables-list']}>
                      {group.variables.map((variable) => {
                        const fieldMeta = VARIABLE_META_BY_NAME.get(variable.name);
                        const label = fieldMeta?.label ?? fallbackVariableLabel(variable.name);
                        return (
                          <VariableRow
                            key={variable.name}
                            definition={variable}
                            value={getValueFor(variable)}
                            label={label}
                            hint={fieldMeta?.hint}
                            onValueChange={applyValue}
                            onReset={resetOne}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : activeView === 'edges' ? (
            <div className={styles['advanced-groups']}>
              <div className={styles['advanced-intro']}>
                Choose how every edge is drawn on the canvas.
              </div>
              <section className={styles['section']}>
                <h3 className={styles['section-title']}>Line Style</h3>
                <p className={styles['section-description']}>
                  Choose whether connections use solid, dashed, or dotted lines.
                </p>
                <div className={styles['edge-option-list']}>
                  {EDGE_LINE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`${styles['edge-option-btn']} ${
                        lineStyle === option.value ? styles['is-active'] : ''
                      }`}
                      onClick={() => setLineStyle(option.value)}
                      aria-pressed={lineStyle === option.value}
                    >
                      <span className={styles['edge-option-label']}>{option.label}</span>
                      <span className={styles['edge-option-description']}>
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              {activeRenderer !== 'react-flow' && (
                <section className={styles['section']}>
                  <h3 className={styles['section-title']}>Pixi Animation</h3>
                  <p className={styles['section-description']}>
                    These animation options apply while either PixiJS backend is active. React Flow
                    uses the selected line pattern to show direction.
                  </p>
                  <div className={styles['edge-option-list']}>
                    {EDGE_ANIMATION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className={`${styles['edge-option-btn']} ${
                          animationStyle === option.value ? styles['is-active'] : ''
                        }`}
                        onClick={() => setAnimationStyle(option.value)}
                        aria-pressed={animationStyle === option.value}
                      >
                        <span className={styles['edge-option-label']}>{option.label}</span>
                        <span className={styles['edge-option-description']}>
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className={styles['section']}>
                <h3 className={styles['section-title']}>Path Style</h3>
                <p className={styles['section-description']}>
                  Control whether edges render as straight lines, curves, or orthogonal routes.
                </p>
                <div className={styles['edge-option-list']}>
                  {EDGE_PATH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`${styles['edge-option-btn']} ${
                        pathStyle === option.value ? styles['is-active'] : ''
                      }`}
                      onClick={() => setPathStyle(option.value)}
                      aria-pressed={pathStyle === option.value}
                    >
                      <span className={styles['edge-option-label']}>{option.label}</span>
                      <span className={styles['edge-option-description']}>
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
                <div className={styles['edge-auto-note']}>
                  Default app settings: {DEFAULT_EDGE_LINE_STYLE} line + {DEFAULT_EDGE_PATH_STYLE}{' '}
                  path, with {animationStyle} available on PixiJS.
                </div>
                {activeRenderer === 'react-flow' && (
                  <div className={styles['edge-auto-note']}>
                    React Flow animates dashed and dotted patterns toward the target. Solid lines
                    stay static.
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className={styles['advanced-groups']}>
              <div className={styles['advanced-intro']}>
                Choose the canvas renderer for this browser. The preference stays on this device;
                unsupported PixiJS backends are disabled.
              </div>
              <div className={styles['renderer-status']} role="status">
                Active renderer: <strong>{getActiveRendererLabel(activeRenderer)}</strong>
                {activeRenderer && activeRenderer !== rendererPreference && (
                  <span> · Requested: {getActiveRendererLabel(rendererPreference)}</span>
                )}
              </div>
              <div className={styles['renderer-option-list']}>
                <RendererOption
                  preference="pixi-webgpu"
                  selected={rendererPreference === 'pixi-webgpu'}
                  availability={webgpuAvailability}
                  label="PixiJS · WebGPU"
                  description="Modern browser GPU API. PixiJS renders the graph in a GPU scene and supports the full Pixi edge animation set."
                  onChoose={setRendererPreference}
                />
                <RendererOption
                  preference="pixi-webgl"
                  selected={rendererPreference === 'pixi-webgl'}
                  availability={webglAvailability}
                  label="PixiJS · WebGL"
                  description="WebGL GPU API for a wider range of browsers and devices. Major performance caveats are treated as unavailable."
                  onChoose={setRendererPreference}
                />
                <RendererOption
                  preference="react-flow"
                  selected={rendererPreference === 'react-flow'}
                  availability="available"
                  label="React Flow"
                  description="DOM and SVG based graph rendering with broad browser compatibility. Dashed and dotted lines animate; pulse arrows are unavailable."
                  onChoose={setRendererPreference}
                />
              </div>
              {activeRenderer === 'react-flow' && rendererPreference !== 'react-flow' && (
                <div className={styles['renderer-fallback-detail']}>
                  The requested PixiJS backends could not start. React Flow is active, and your
                  PixiJS preference is saved for the next attempt.
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles['theme-footer']}>
          <button
            className={`${styles['reset-all-btn']} ${!hasCustomizations ? styles['is-disabled'] : ''}`}
            onClick={resetAll}
            disabled={!hasCustomizations}
          >
            <RotateCcw size={14} />
            <span>Reset All</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
