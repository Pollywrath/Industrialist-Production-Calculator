import React, { useState } from 'react';

// Default theme (Golden Industrial)
const DEFAULT_THEME = {
  colorPrimary: '#d4a637',
  colorPrimaryHover: '#f5d56a',
  colorPrimaryDark: '#0a0a0a',
  colorSecondary: '#1a1a1a',
  bgMain: '#0a0a0a',
  bgSecondary: '#1a1a1a',
  textPrimary: '#f5d56a',
  textSecondary: '#999999',
  textMuted: '#aaaaaa',
  statValue: '#e0e0e0',
  borderPrimary: '#d4a637',
  borderLight: '#333333',
  borderDivider: '#d4a63755',
  inputBg: '#1a3a2a',
  inputBorder: '#22c55e',
  inputText: '#86efac',
  outputBg: '#3a1a1a',
  outputBorder: '#ef4444',
  outputText: '#fca5a5',
  deleteBg: '#3a1a1a',
  deleteColor: '#ef4444',
  deleteHoverBg: '#ef4444',
  deleteHoverColor: '#0a0a0a',
  nodeBg: '#1a1a1a',
  nodeBorder: '#d4a637',
  nodeTargetBg: '#2d2416',
  nodeTargetBorder: '#f5d56a',
};

// Preset theme templates based on popular color schemes
const THEME_PRESETS = [
  {
    id: 'default',
    name: 'Golden Industrial (Default)',
    description: 'Original golden theme with warm tones',
    theme: DEFAULT_THEME
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Dark purple theme with vibrant accents',
    theme: {
      colorPrimary: '#bd93f9',
      colorPrimaryHover: '#d6acff',
      colorPrimaryDark: '#282a36',
      colorSecondary: '#44475a',
      bgMain: '#282a36',
      bgSecondary: '#44475a',
      textPrimary: '#f8f8f2',
      textSecondary: '#6272a4',
      textMuted: '#6272a4',
      statValue: '#f8f8f2',
      borderPrimary: '#bd93f9',
      borderLight: '#44475a',
      borderDivider: '#bd93f955',
      inputBg: '#1a2a3a',
      inputBorder: '#50fa7b',
      inputText: '#50fa7b',
      outputBg: '#3a1a2a',
      outputBorder: '#ff5555',
      outputText: '#ff79c6',
      deleteBg: '#44475a',
      deleteColor: '#ff5555',
      deleteHoverBg: '#ff5555',
      deleteHoverColor: '#282a36',
      nodeBg: '#44475a',
      nodeBorder: '#bd93f9',
      nodeTargetBg: '#5a4a6a',
      nodeTargetBorder: '#ff79c6',
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Cool arctic bluish palette',
    theme: {
      colorPrimary: '#88c0d0',
      colorPrimaryHover: '#8fbcbb',
      colorPrimaryDark: '#2e3440',
      colorSecondary: '#3b4252',
      bgMain: '#2e3440',
      bgSecondary: '#3b4252',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      textMuted: '#4c566a',
      statValue: '#e5e9f0',
      borderPrimary: '#88c0d0',
      borderLight: '#4c566a',
      borderDivider: '#88c0d055',
      inputBg: '#2a3a3a',
      inputBorder: '#a3be8c',
      inputText: '#a3be8c',
      outputBg: '#3a2a2a',
      outputBorder: '#bf616a',
      outputText: '#d08770',
      deleteBg: '#3b4252',
      deleteColor: '#bf616a',
      deleteHoverBg: '#bf616a',
      deleteHoverColor: '#2e3440',
      nodeBg: '#3b4252',
      nodeBorder: '#88c0d0',
      nodeTargetBg: '#4c5a68',
      nodeTargetBorder: '#8fbcbb',
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    description: 'Precision dark theme with balanced contrast',
    theme: {
      colorPrimary: '#268bd2',
      colorPrimaryHover: '#2aa198',
      colorPrimaryDark: '#002b36',
      colorSecondary: '#073642',
      bgMain: '#002b36',
      bgSecondary: '#073642',
      textPrimary: '#839496',
      textSecondary: '#586e75',
      textMuted: '#657b83',
      statValue: '#93a1a1',
      borderPrimary: '#268bd2',
      borderLight: '#073642',
      borderDivider: '#268bd255',
      inputBg: '#073a3a',
      inputBorder: '#859900',
      inputText: '#859900',
      outputBg: '#3a0707',
      outputBorder: '#dc322f',
      outputText: '#cb4b16',
      deleteBg: '#073642',
      deleteColor: '#dc322f',
      deleteHoverBg: '#dc322f',
      deleteHoverColor: '#002b36',
      nodeBg: '#073642',
      nodeBorder: '#268bd2',
      nodeTargetBg: '#0f4a52',
      nodeTargetBorder: '#2aa198',
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Precision light theme with soft tones',
    theme: {
      colorPrimary: '#268bd2',
      colorPrimaryHover: '#2aa198',
      colorPrimaryDark: '#fdf6e3',
      colorSecondary: '#eee8d5',
      bgMain: '#fdf6e3',
      bgSecondary: '#eee8d5',
      textPrimary: '#657b83',
      textSecondary: '#586e75',
      textMuted: '#93a1a1',
      statValue: '#073642',
      borderPrimary: '#268bd2',
      borderLight: '#93a1a1',
      borderDivider: '#268bd255',
      inputBg: '#e5f5e5',
      inputBorder: '#859900',
      inputText: '#859900',
      outputBg: '#f5e5e5',
      outputBorder: '#dc322f',
      outputText: '#cb4b16',
      deleteBg: '#eee8d5',
      deleteColor: '#dc322f',
      deleteHoverBg: '#dc322f',
      deleteHoverColor: '#fdf6e3',
      nodeBg: '#eee8d5',
      nodeBorder: '#268bd2',
      nodeTargetBg: '#d9d2c2',
      nodeTargetBorder: '#2aa198',
    }
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    description: 'Deep blue dark theme',
    theme: {
      colorPrimary: '#4a9eff',
      colorPrimaryHover: '#70b4ff',
      colorPrimaryDark: '#0a0e1a',
      colorSecondary: '#151a2e',
      bgMain: '#0a0e1a',
      bgSecondary: '#151a2e',
      textPrimary: '#e0e6ff',
      textSecondary: '#8892b0',
      textMuted: '#a8b2d1',
      statValue: '#ccd6f6',
      borderPrimary: '#4a9eff',
      borderLight: '#233554',
      borderDivider: '#4a9eff55',
      inputBg: '#1a2a3a',
      inputBorder: '#64ffda',
      inputText: '#64ffda',
      outputBg: '#3a1a2a',
      outputBorder: '#ff6b9d',
      outputText: '#ffa7c4',
      deleteBg: '#151a2e',
      deleteColor: '#ff6b9d',
      deleteHoverBg: '#ff6b9d',
      deleteHoverColor: '#0a0e1a',
      nodeBg: '#151a2e',
      nodeBorder: '#4a9eff',
      nodeTargetBg: '#1e2a45',
      nodeTargetBorder: '#70b4ff',
    }
  },
  {
    id: 'forest',
    name: 'Forest Green',
    description: 'Natural green theme',
    theme: {
      colorPrimary: '#5fb573',
      colorPrimaryHover: '#7fc794',
      colorPrimaryDark: '#0a1a0f',
      colorSecondary: '#152820',
      bgMain: '#0a1a0f',
      bgSecondary: '#152820',
      textPrimary: '#c8e6c9',
      textSecondary: '#81c784',
      textMuted: '#a5d6a7',
      statValue: '#e0f2e0',
      borderPrimary: '#5fb573',
      borderLight: '#2e4a35',
      borderDivider: '#5fb57355',
      inputBg: '#1a3a2a',
      inputBorder: '#66bb6a',
      inputText: '#a5d6a7',
      outputBg: '#3a1a1a',
      outputBorder: '#ef5350',
      outputText: '#ff8a80',
      deleteBg: '#152820',
      deleteColor: '#ef5350',
      deleteHoverBg: '#ef5350',
      deleteHoverColor: '#0a1a0f',
      nodeBg: '#152820',
      nodeBorder: '#5fb573',
      nodeTargetBg: '#243a2d',
      nodeTargetBorder: '#7fc794',
    }
  },
  {
    id: 'sunset',
    name: 'Sunset Orange',
    description: 'Warm sunset-inspired theme',
    theme: {
      colorPrimary: '#ff8c42',
      colorPrimaryHover: '#ffaa6f',
      colorPrimaryDark: '#1a0f0a',
      colorSecondary: '#281912',
      bgMain: '#1a0f0a',
      bgSecondary: '#281912',
      textPrimary: '#ffe4d1',
      textSecondary: '#ffb88c',
      textMuted: '#ffc9a3',
      statValue: '#fff0e0',
      borderPrimary: '#ff8c42',
      borderLight: '#4a2e1f',
      borderDivider: '#ff8c4255',
      inputBg: '#2a3a1a',
      inputBorder: '#a3e048',
      inputText: '#c6f68d',
      outputBg: '#3a1a1a',
      outputBorder: '#ff5555',
      outputText: '#ff8787',
      deleteBg: '#281912',
      deleteColor: '#ff5555',
      deleteHoverBg: '#ff5555',
      deleteHoverColor: '#1a0f0a',
      nodeBg: '#281912',
      nodeBorder: '#ff8c42',
      nodeTargetBg: '#3d2a1a',
      nodeTargetBorder: '#ffaa6f',
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-inspired futuristic theme',
    theme: {
      colorPrimary: '#00ff9f',
      colorPrimaryHover: '#00ffbf',
      colorPrimaryDark: '#0a0a15',
      colorSecondary: '#1a1a2e',
      bgMain: '#0a0a15',
      bgSecondary: '#1a1a2e',
      textPrimary: '#00ff9f',
      textSecondary: '#00d4aa',
      textMuted: '#00b494',
      statValue: '#d0fff0',
      borderPrimary: '#00ff9f',
      borderLight: '#16213e',
      borderDivider: '#00ff9f55',
      inputBg: '#1a2a3a',
      inputBorder: '#00ff9f',
      inputText: '#00ffbf',
      outputBg: '#3a1a2a',
      outputBorder: '#ff006e',
      outputText: '#ff4d9d',
      deleteBg: '#1a1a2e',
      deleteColor: '#ff006e',
      deleteHoverBg: '#ff006e',
      deleteHoverColor: '#0a0a15',
      nodeBg: '#1a1a2e',
      nodeBorder: '#00ff9f',
      nodeTargetBg: '#2a2a45',
      nodeTargetBorder: '#00ffbf',
    }
  }
];

export const applyTheme = (theme) => {
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVar, value);
  });
};

export const loadTheme = () => {
  try {
    const saved = localStorage.getItem('industrialist_theme');
    return saved ? JSON.parse(saved) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const saveTheme = (theme) => {
  localStorage.setItem('industrialist_theme', JSON.stringify(theme));
};

export const resetToDefaultTheme = () => {
  applyTheme(DEFAULT_THEME);
  saveTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
};

const ThemeEditor = ({ onClose }) => {
  const [theme, setTheme] = useState(loadTheme());
  const [showAdvanced, setShowAdvanced] = useState(false);

  const applyPreset = (preset) => {
    setTheme(preset.theme);
    applyTheme(preset.theme);
    saveTheme(preset.theme);
  };

  const updateColor = (key, value) => {
    const newTheme = { ...theme, [key]: value };
    setTheme(newTheme);
    applyTheme(newTheme);
    saveTheme(newTheme);
  };

  const handleReset = () => {
    const defaultTheme = resetToDefaultTheme();
    setTheme(defaultTheme);
  };

  const themeGroups = [
    {
      title: 'Primary Colors',
      colors: [
        { key: 'colorPrimary', label: 'Primary' },
        { key: 'colorPrimaryHover', label: 'Primary Hover' },
        { key: 'colorPrimaryDark', label: 'Primary Dark' },
        { key: 'colorSecondary', label: 'Secondary' },
      ]
    },
    {
      title: 'Background Colors',
      colors: [
        { key: 'bgMain', label: 'Main Background' },
        { key: 'bgSecondary', label: 'Secondary Background' },
      ]
    },
    {
      title: 'Text Colors',
      colors: [
        { key: 'textPrimary', label: 'Primary Text' },
        { key: 'textSecondary', label: 'Secondary Text' },
        { key: 'textMuted', label: 'Muted Text' },
        { key: 'statValue', label: 'Stat Values (Cycle/Power/Pollution)' },
      ]
    },
    {
      title: 'Border Colors',
      colors: [
        { key: 'borderPrimary', label: 'Primary Border' },
        { key: 'borderLight', label: 'Light Border' },
        { key: 'borderDivider', label: 'Divider' },
      ]
    },
    {
      title: 'Input/Output Colors',
      colors: [
        { key: 'inputBg', label: 'Input Background' },
        { key: 'inputBorder', label: 'Input Border' },
        { key: 'inputText', label: 'Input Text' },
        { key: 'outputBg', label: 'Output Background' },
        { key: 'outputBorder', label: 'Output Border' },
        { key: 'outputText', label: 'Output Text' },
      ]
    },
    {
      title: 'Node Colors',
      colors: [
        { key: 'nodeBg', label: 'Node Background' },
        { key: 'nodeBorder', label: 'Node Border' },
        { key: 'nodeTargetBg', label: 'Target Node Background' },
        { key: 'nodeTargetBorder', label: 'Target Node Border' },
      ]
    },
    {
      title: 'Delete Button',
      colors: [
        { key: 'deleteBg', label: 'Background' },
        { key: 'deleteColor', label: 'Color' },
        { key: 'deleteHoverBg', label: 'Hover Background' },
        { key: 'deleteHoverColor', label: 'Hover Color' },
      ]
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: showAdvanced ? '700px' : '600px', maxHeight: '85vh' }}>
        <h2 className="modal-title">Theme Editor</h2>
        
        {!showAdvanced ? (
          <>
            <div className="modal-content" style={{ maxHeight: '60vh' }}>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '15px', textAlign: 'center' }}>
                  Choose a preset theme or customize your own
                </p>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {THEME_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="theme-preset-card"
                    style={{
                      padding: '15px',
                      background: 'var(--bg-main)',
                      border: '2px solid var(--border-primary)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {preset.name}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {preset.description}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '4px', 
                          background: preset.theme.colorPrimary,
                          border: '1px solid rgba(255,255,255,0.2)'
                        }} />
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '4px', 
                          background: preset.theme.bgMain,
                          border: '1px solid rgba(255,255,255,0.2)'
                        }} />
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '4px', 
                          background: preset.theme.inputBorder,
                          border: '1px solid rgba(255,255,255,0.2)'
                        }} />
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '4px', 
                          background: preset.theme.outputBorder,
                          border: '1px solid rgba(255,255,255,0.2)'
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                onClick={() => setShowAdvanced(true)} 
                className="btn btn-secondary" 
                style={{ flex: 1 }}
              >
                Advanced Editing
              </button>
              <button onClick={onClose} className="btn btn-primary" style={{ flex: 1 }}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <button 
              onClick={() => setShowAdvanced(false)} 
              className="btn btn-secondary btn-back"
            >
              ← Back to Presets
            </button>

            <div className="modal-content" style={{ maxHeight: '55vh' }}>
              {themeGroups.map((group) => (
                <div key={group.title} className="theme-group">
                  <h3 className="theme-group-title">{group.title}</h3>
                  <div className="theme-color-grid">
                    {group.colors.map((color) => (
                      <div key={color.key} className="theme-color-item">
                        <label className="theme-color-label">{color.label}</label>
                        <div className="theme-color-inputs">
                          <input
                            type="color"
                            value={theme[color.key]}
                            onChange={(e) => updateColor(color.key, e.target.value)}
                            className="theme-color-picker"
                          />
                          <input
                            type="text"
                            value={theme[color.key]}
                            onChange={(e) => updateColor(color.key, e.target.value)}
                            className="input theme-color-text"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={handleReset} className="btn btn-secondary" style={{ flex: 1 }}>
                Reset to Default
              </button>
              <button onClick={onClose} className="btn btn-primary" style={{ flex: 1 }}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ThemeEditor;