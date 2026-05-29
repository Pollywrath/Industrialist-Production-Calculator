export type ThemeVariableCategory = 'color' | 'layout';

export interface ThemeVariableDefinition {
  name: string;
  defaultValue: string;
  category: ThemeVariableCategory;
}

export type ThemeOverrideMap = Record<string, string>;

const THEME_STORAGE_KEY = 'industrialist_theme_overrides_v1';
const THEME_PERSIST_DEBOUNCE_MS = 120;

let overridesCache: ThemeOverrideMap | null = null;
let persistTimeoutId: number | null = null;

function isThemeVariableName(name: string): boolean {
  return name.startsWith('--theme-');
}

function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  return 'cssRules' in rule;
}

function getVariableCategory(name: string): ThemeVariableCategory {
  return name.startsWith('--theme-color-') ? 'color' : 'layout';
}

function collectThemeVariablesFromRules(
  rules: CSSRuleList,
  target: Map<string, ThemeVariableDefinition>,
): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(':root')) {
      for (const propertyName of Array.from(rule.style)) {
        if (!isThemeVariableName(propertyName)) continue;
        if (target.has(propertyName)) continue;

        const defaultValue = rule.style.getPropertyValue(propertyName).trim();
        target.set(propertyName, {
          name: propertyName,
          defaultValue,
          category: getVariableCategory(propertyName),
        });
      }
      continue;
    }

    if (isGroupingRule(rule)) {
      collectThemeVariablesFromRules(rule.cssRules, target);
    }
  }
}

function sanitizeOverrideMap(raw: unknown): ThemeOverrideMap {
  if (!raw || typeof raw !== 'object') return {};

  const result: ThemeOverrideMap = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  for (let i = 0; i < entries.length; i++) {
    const [name, value] = entries[i];
    if (!isThemeVariableName(name)) continue;
    if (typeof value !== 'string') continue;

    const trimmed = value.trim();
    if (!trimmed) continue;
    result[name] = trimmed;
  }
  return result;
}

function readOverridesFromStorage(): ThemeOverrideMap {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeOverrideMap(parsed);
  } catch {
    return {};
  }
}

function getOverridesCache(): ThemeOverrideMap {
  if (overridesCache) {
    return overridesCache;
  }

  overridesCache = readOverridesFromStorage();
  return overridesCache;
}

export function discoverThemeVariables(): ThemeVariableDefinition[] {
  const discovered = new Map<string, ThemeVariableDefinition>();

  for (const styleSheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = styleSheet.cssRules;
    } catch {
      continue;
    }
    collectThemeVariablesFromRules(cssRules, discovered);
  }

  return Array.from(discovered.values()).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'color' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function loadThemeOverrides(): ThemeOverrideMap {
  return { ...getOverridesCache() };
}

function saveThemeOverrides(overrides: ThemeOverrideMap): void {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    void 0;
  }
}

function schedulePersist(): void {
  if (persistTimeoutId != null) {
    window.clearTimeout(persistTimeoutId);
  }

  persistTimeoutId = window.setTimeout(() => {
    persistTimeoutId = null;
    saveThemeOverrides(getOverridesCache());
  }, THEME_PERSIST_DEBOUNCE_MS);
}

export function applyThemeOverrides(overrides: ThemeOverrideMap): void {
  const sanitized = sanitizeOverrideMap(overrides);
  const rootStyle = document.documentElement.style;

  const entries = Object.entries(sanitized);
  for (let i = 0; i < entries.length; i++) {
    const [name, value] = entries[i];
    rootStyle.setProperty(name, value);
  }
}

export function initializeStoredTheme(): void {
  applyThemeOverrides(loadThemeOverrides());
}

export function setThemeVariableOverride(name: string, value: string): ThemeOverrideMap {
  const overrides = getOverridesCache();
  if (!isThemeVariableName(name)) return { ...overrides };
  const trimmed = value.trim();

  if (trimmed) {
    overrides[name] = trimmed;
    document.documentElement.style.setProperty(name, trimmed);
  } else {
    delete overrides[name];
    document.documentElement.style.removeProperty(name);
  }

  schedulePersist();
  return { ...overrides };
}

export function resetThemeVariableOverride(name: string): ThemeOverrideMap {
  const overrides = getOverridesCache();
  if (!isThemeVariableName(name)) return { ...overrides };
  delete overrides[name];
  document.documentElement.style.removeProperty(name);
  schedulePersist();
  return { ...overrides };
}

export function resetAllThemeOverrides(definitions: ThemeVariableDefinition[]): ThemeOverrideMap {
  const overrides = getOverridesCache();
  const rootStyle = document.documentElement.style;
  for (let i = 0; i < definitions.length; i++) {
    const name = definitions[i].name;
    rootStyle.removeProperty(name);
    delete overrides[name];
  }

  schedulePersist();
  return { ...overrides };
}

export function replaceThemeOverridesForVariables(
  variableNames: string[],
  replacements: ThemeOverrideMap,
): ThemeOverrideMap {
  const overrides = getOverridesCache();
  const rootStyle = document.documentElement.style;

  for (let i = 0; i < variableNames.length; i++) {
    const name = variableNames[i];
    if (!isThemeVariableName(name)) continue;

    delete overrides[name];
    rootStyle.removeProperty(name);
  }

  const sanitizedReplacements = sanitizeOverrideMap(replacements);
  const entries = Object.entries(sanitizedReplacements);
  for (let i = 0; i < entries.length; i++) {
    const [name, value] = entries[i];
    overrides[name] = value;
    rootStyle.setProperty(name, value);
  }

  schedulePersist();
  return { ...overrides };
}
