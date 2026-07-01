import { useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Database,
  Gauge,
  Group,
  HelpCircle,
  History,
  Info,
  LayoutDashboard,
  MousePointerSquareDashed,
  Network,
  PackageSearch,
  Palette,
  Save,
  Search,
  Settings,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useTutorialStore } from '../../../stores/useTutorialStore';
import type { TutorialId } from '../../../tutorials/types';
import { FIRST_PRODUCTION_CHAIN_TUTORIAL_ID } from '../../../tutorials/firstProductionChain';
import { GROUPS_TUTORIAL_ID } from '../../../tutorials/groupsTutorial';
import { DATA_OVERLAY_TUTORIAL_ID } from '../../../tutorials/dataOverlayTutorial';
import styles from './HelpOverlay.module.css';
import { CATEGORIZED_TIPS } from './tips';
import changelogData from './changelog.json';

const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  MousePointerSquareDashed,
  Zap,
  Settings,
  Save,
};

type HelpTabId = 'start' | 'controls' | 'troubleshooting' | 'tips' | 'changelog' | 'credits';

interface HelpTab {
  id: HelpTabId;
  label: string;
}

interface HelpSection {
  title: string;
  items: ReactNode[];
  listStyle?: 'ordered' | 'unordered' | 'none';
}

interface HelpArticle {
  id: string;
  tabId: HelpTabId;
  title: string;
  summary: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  hasTutorial?: boolean;
  tutorialId?: TutorialId;
  keywords: string[];
  sections: HelpSection[];
}

const HELP_TABS: HelpTab[] = [
  { id: 'start', label: 'Start' },
  { id: 'controls', label: 'Controls' },
  { id: 'troubleshooting', label: 'Troubleshoot' },
  { id: 'tips', label: 'Tips' },
  { id: 'changelog', label: 'Changelog' },
  { id: 'credits', label: 'Credits' },
];

const BASE_HELP_ARTICLES: HelpArticle[] = [
  {
    id: 'starter-gearbox-canvas',
    tabId: 'start',
    title: 'First Production Chain',
    summary: 'A first canvas walkthrough using Gearbox as the example product.',
    Icon: Target,
    tutorialId: FIRST_PRODUCTION_CHAIN_TUTORIAL_ID,
    keywords: [
      'first run',
      'gearbox',
      'add recipe',
      'recipe selector',
      'target',
      'layout',
      'compute',
    ],
    sections: [
      {
        title: 'What It Covers',
        items: [
          'Use Add Recipe to open the Recipe Selector and start from a product search.',
          'Use Gearbox as the example target to show product selection, connected inputs, and upstream producers.',
          'Use the Target tool or Shift-click so Compute has a target node to optimize around.',
          'Use Layout, Compute, Production Stats, More Stats, and Save Manager after the chain exists.',
        ],
      },
      {
        title: 'Canvas Flow',
        items: [
          'Click Add Recipe, use Search by Product, search for Gearbox, then choose a recipe card.',
          'Click the Gearbox node inputs to add producers filtered to the clicked product and side.',
          'Connect visible output handles to matching input handles, then use Layout to organize the graph.',
          'Click Compute after at least one node is marked as a target, then review the proposed machine count changes.',
        ],
      },
      {
        title: 'Steam Branch',
        items: [
          'If an upstream recipe uses Steam, add a Boiler and connect Water into the Boiler input.',
          'Connect the Boiler Steam output to the Steam input on the consuming node.',
          'Open Node Editor on special recipe nodes when their Settings tab is visible and a temperature or coolant setting needs review.',
        ],
      },
    ],
  },
  {
    id: 'reading-recipe-node',
    tabId: 'start',
    title: 'Reading A Recipe Node',
    summary: 'What the rows, badges, handles, and node menu represent on the canvas.',
    Icon: Network,
    keywords: [
      'recipe node',
      'node',
      'handles',
      'inputs',
      'outputs',
      'target',
      'power',
      'pollution',
      'temperature',
    ],
    sections: [
      {
        title: 'Scale/Sinks',
        items: [
          'Input rows are on the left side of a recipe node and output rows are on the right side.',
          'Rows show product names, rates in the selected rate mode, and temperature labels when the recipe exposes temperature data.',
          'The node header can show target status, machine information, machine count, cycle time, power, and pollution details.',
          'Some special recipes draw product-link indicators between related rows, such as linked coolant or steam paths.',
        ],
      },
      {
        title: 'Interactions',
        items: [
          'Click an input or output row to open Recipe Selector filtered around that product and side.',
          'Drag from an output handle to a matching input handle to create a connection.',
          'Double-click a connected handle to run the balancer for that connected product system.',
          'Use the node menu button to open Node Editor unless Delete mode is active.',
        ],
      },
    ],
  },
  {
    id: 'saves',
    tabId: 'start',
    title: 'Saves',
    summary: 'How Save Manager handles local saves, imports, exports, and PNG export.',
    Icon: Save,
    keywords: ['save manager', 'saves', 'save', 'load', 'merge', 'json', 'png', 'export', 'import'],
    sections: [
      {
        title: 'Save Manager',
        items: [
          'Open Save Manager from the overlay tray to name and save the current canvas.',
          'Existing save cards can load, merge, overwrite, rename, delete, or export a saved graph.',
          'Import JSON adds a saved graph from a file, while export JSON writes a save file for sharing or backup.',
          'EXPORT PNG captures the current canvas view as an image.',
        ],
      },
      {
        title: 'Local Storage',
        items: [
          'Saves are stored in the browser data for this app, not in a cloud account.',
          'Use exported JSON files if you want a backup outside the browser.',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    tabId: 'start',
    title: 'Dashboard',
    summary: 'What Production Stats, More Stats, deficiencies, and byproducts show.',
    Icon: LayoutDashboard,
    keywords: [
      'dashboard',
      'production stats',
      'more stats',
      'power consumption',
      'power production',
      'machine cost',
      'profit',
      'pollution',
      'deficiencies',
      'shortages',
      'excess',
    ],
    sections: [
      {
        title: 'Production Stats',
        items: [
          'Production Stats shows Power Consumption, Power Production, Minimum Model Count, Machine Cost, Profit, and Net Pollution.',
          'The Rate control changes whether quantities are displayed per second, per minute, per hour, or as raw cycle quantities.',
          'Global Pollution in More Stats feeds the same global settings store used by recipes that depend on that value.',
        ],
      },
      {
        title: 'Diagnostics',
        items: [
          'Deficiencies (Shortages) lists connected products where demand is greater than solved supply.',
          'Excess Byproducts lists products where solved output is greater than connected demand.',
          'Expand a diagnostic group to see node rows, then click a row to center the related node or its collapsed group.',
        ],
      },
    ],
  },
  {
    id: 'controls-tray',
    tabId: 'controls',
    title: 'Controls Tray',
    summary: 'The main action strip for adding nodes, modes, layout, compute, overlays, and rate display.',
    Icon: MousePointerSquareDashed,
    keywords: [
      'controls tray',
      'add recipe',
      'delete',
      'multi-select',
      'target',
      'layout',
      'compute',
      'machines',
      'rate',
      'clear',
      'undo',
      'redo',
    ],
    sections: [
      {
        title: 'Tools',
        items: [
          'Add Recipe opens Recipe Selector; while Multi-select has groupable nodes selected, it becomes Add Group.',
          'Delete, Multi-select, and Target are mode tools that change what clicking nodes or handles does.',
          'Layout runs the auto layout pass on the current graph and respects the selected edge path style.',
          'Compute opens the optimizer flow when at least one recipe node is marked as a target.',
        ],
      },
      {
        title: 'Actions',
        items: [
          'Machines opens the research and machine unlock overlay.',
          'Rate cycles between /sec, /min, /hr, and Raw display modes.',
          'Clear, Undo, and Redo act on the current canvas history.',
        ],
      },
    ],
  },
  {
    id: 'canvas-navigation',
    tabId: 'controls',
    title: 'Canvas Navigation',
    summary: 'Canvas movement, temporary tool keys, node dragging, and edge editing.',
    Icon: Network,
    keywords: [
      'canvas',
      'navigation',
      'pan',
      'zoom',
      'drag',
      'keyboard',
      'alt',
      'shift',
      'control',
      'edge',
      'bezier',
      'orthogonal',
    ],
    sections: [
      {
        title: 'Moving Around',
        items: [
          'Pan and zoom the React Flow canvas, then drag nodes into position.',
          'When multiple recipe nodes are selected, dragging one selected node moves the selected batch.',
          'Collapsed groups can be moved as grouped canvas objects.',
        ],
      },
      {
        title: 'Temporary Modes',
        items: [
          'Hold Alt for temporary Delete mode.',
          'Hold Ctrl or Command for temporary Multi-select mode.',
          'Hold Shift for temporary Target mode.',
          'Use Ctrl or Command with Z for undo, and Ctrl or Command with Y or Shift+Z for redo.',
        ],
      },
      {
        title: 'Edges',
        items: [
          'Click an edge to select it.',
          'Double-click selected straight or bezier edges to add editable control points.',
          'Orthogonal edges expose segment handles while selected and while the pointer is near an editable segment.',
        ],
      },
    ],
  },
  {
    id: 'node-editor',
    tabId: 'controls',
    title: 'Node Editor',
    summary: 'Editing machine count, handle order, and special recipe settings.',
    Icon: Settings,
    keywords: [
      'node editor',
      'count',
      'handles',
      'settings',
      'machine count',
      'reset handles',
      'apply',
      'apply to chain',
    ],
    sections: [
      {
        title: 'Count And Handles',
        items: [
          'Open Node Editor from the node menu button.',
          'Count & Handles lets you edit machine count and adjust input or output handle order.',
          'Reset Handles restores the recipe handle order for that node.',
          'Apply saves the node edits; Apply to Chain scales connected nodes based on the machine count ratio.',
        ],
      },
      {
        title: 'Settings',
        items: [
          'The Settings tab appears only for recipes backed by a special recipe definition.',
          'Temperature-aware settings can reflect connected input temperatures from the current solved graph state.',
          'Changing settings can change the active recipe rows, labels, or quantities for that node.',
        ],
      },
    ],
  },
  {
    id: 'groups',
    tabId: 'controls',
    title: 'Groups',
    summary: 'Creating groups, editing labels, collapsing, and using proxy handles.',
    Icon: Group,
    tutorialId: GROUPS_TUTORIAL_ID,
    keywords: [
      'groups',
      'group',
      'add group',
      'multi-select',
      'collapse',
      'expand',
      'proxy handles',
      'group node editor',
    ],
    sections: [
      {
        title: 'Create A Group',
        items: [
          'Turn on Multi-select, then click the recipe nodes that should belong together.',
          'When the selection can be grouped, Add Recipe changes to Add Group.',
          'Click Add Group to wrap the selected nodes into a group node.',
        ],
      },
      {
        title: 'Use A Group',
        items: [
          'Drag the group to move the group and its member nodes together.',
          'Open Group Node Editor to edit Group Label.',
          'Collapse a group to show its compact view; use EXPAND to restore the full view.',
          'Collapsed groups expose proxy input and output handles for connections that cross the group boundary.',
        ],
      },
    ],
  },
  {
    id: 'machines-overlay',
    tabId: 'controls',
    title: 'Machines Overlay',
    summary: 'Research category tabs, difficulty settings, unlock chains, and machine availability.',
    Icon: PackageSearch,
    keywords: [
      'machines',
      'research',
      'production',
      'energy',
      'utility',
      'difficulty',
      'ore nodes',
      'variant',
      'limited',
      'unlock chain',
      'lock chain',
    ],
    sections: [
      {
        title: 'Filters And Settings',
        items: [
          'Use Production, Energy, and Utility to switch between research graph categories.',
          'Difficulty changes the active game difficulty used by machine and recipe availability.',
          'Ore Nodes and Variant & Limited Machines toggle whether those machines appear in selectors.',
        ],
      },
      {
        title: 'Research Graph',
        items: [
          'Click a research node to inspect its category, RP cost, prerequisites, and unlocked machines.',
          'Unlock Chain unlocks the selected research and its prerequisite path.',
          'Lock Chain locks the selected research chain again.',
        ],
      },
    ],
  },
  {
    id: 'themes',
    tabId: 'controls',
    title: 'Themes',
    summary: 'Presets, advanced theme variables, and edge line/path styling.',
    Icon: Palette,
    keywords: [
      'theme',
      'themes',
      'presets',
      'advanced editing',
      'edge editing',
      'solid',
      'dashed',
      'dotted',
      'straight',
      'bezier',
      'orthogonal',
    ],
    sections: [
      {
        title: 'Theme Tabs',
        items: [
          'Presets contains the available dark and light theme presets.',
          'Advanced Editing exposes grouped theme variables for custom color editing.',
          'Edge Editing controls edge line style and path style.',
        ],
      },
      {
        title: 'Edges',
        items: [
          'Line Style can be Solid, Dashed, or Dotted.',
          'Path Style can be Straight Line, Bezier Curve, or Orthogonal.',
          'Reset All clears custom edge style overrides.',
        ],
      },
    ],
  },
  {
    id: 'data-overlay',
    tabId: 'controls',
    title: 'Data Overlay',
    summary: 'Editing app data and comparing it against wiki buckets.',
    Icon: Database,
    tutorialId: DATA_OVERLAY_TUTORIAL_ID,
    keywords: [
      'data',
      'data manager',
      'editing',
      'comparing',
      'products',
      'machines',
      'recipes',
      'researches',
      'research',
      'pending',
      'wiki',
      'fetch',
    ],
    sections: [
      {
        title: 'Editing',
        items: [
          'Open Data Manager and stay on Editing to change app data.',
          'Use Products, Machines, Recipes, or Researches to choose the kind of record to edit.',
          'Search the list, select a record, or add a new record from the list panel.',
          'Edited records show Pending until you use Save Changes; Discard drops unsaved edits.',
        ],
      },
      {
        title: 'Reset And Save',
        items: [
          'Restore Baseline Defaults resets the selected record form back to its baseline data.',
          'Restore Defaults starts the global restore flow for app data.',
          'Save Changes commits pending data edits so selectors and calculations use the updated data.',
        ],
      },
      {
        title: 'Comparing',
        items: [
          'Switch to Comparing to check Products, Machines, Recipes, or Research against wiki data buckets.',
          'Use Fetch in the toolbar when the tab says No Wiki Data Fetched.',
          'Comparison results mark records that are changed, only in the app, or only in the wiki data.',
        ],
      },
    ],
  },
  {
    id: 'compute-refuses',
    tabId: 'troubleshooting',
    title: 'Compute Refuses To Run',
    summary: 'Why the optimizer may stop before solving and what to check first.',
    Icon: AlertTriangle,
    keywords: [
      'compute',
      'solver',
      'optimizer',
      'lp solver',
      'target',
      'no target',
      'solver busy',
      'apply',
      'discard',
    ],
    sections: [
      {
        title: 'Target Required',
        items: [
          'Compute shows No Target Nodes Selected when no recipe node is marked as a target.',
          'Use the Target tool, or hold Shift, then click at least one recipe node.',
          'Targets anchor the ratio optimization so the solver knows what output the graph should preserve.',
        ],
      },
      {
        title: 'Solver State',
        items: [
          'Solver Busy appears when an optimization run is already in progress.',
          'After a successful run, review the proposed machine count changes before using Apply or Discard.',
          'If the optimizer reports failure diagnostics, inspect the listed root causes and connected shortages.',
        ],
      },
    ],
  },
  {
    id: 'missing-recipe',
    tabId: 'troubleshooting',
    title: 'Missing Recipe',
    summary: 'Checks for recipes or machines that do not appear in Recipe Selector.',
    Icon: Search,
    keywords: [
      'missing recipe',
      'recipe selector',
      'search by product',
      'search by machine',
      'filters',
      'machine overlay',
      'difficulty',
      'research',
      'ore nodes',
      'variant',
      'limited',
    ],
    sections: [
      {
        title: 'Selector Checks',
        items: [
          'Switch between Search by Product and Search by Machine depending on what you know.',
          'Clear product type, tier, category, subcategory, or recipe stage filters that may hide the result.',
          'Clicking a node row opens Recipe Selector already filtered around that row, product, and side.',
        ],
      },
      {
        title: 'Availability Checks',
        items: [
          'Open Machines and verify the needed research is unlocked for the current difficulty.',
          'Check Ore Nodes if the missing item depends on ore node machines.',
          'Check Variant & Limited Machines if the missing machine is a variant or limited machine.',
          'If the entry was edited in Data Manager, confirm the pending data edits were saved.',
        ],
      },
    ],
  },
  {
    id: 'shortages-deficiencies',
    tabId: 'troubleshooting',
    title: 'Shortages And Deficiencies',
    summary: 'How to read shortage diagnostics and find the nodes involved.',
    Icon: Gauge,
    keywords: [
      'shortages',
      'deficiencies',
      'excess',
      'byproducts',
      'dashboard',
      'more stats',
      'diagnostics',
      'supply',
      'demand',
    ],
    sections: [
      {
        title: 'Dashboard Diagnostics',
        items: [
          'Open More Stats and check Deficiencies (Shortages) for products with more solved demand than supply.',
          'Check Excess Byproducts for products where solved output is greater than connected demand.',
          'Expand a diagnostic group to see the affected node rows.',
          'Click a diagnostic row to center the node, or the collapsed group that contains it.',
        ],
      },
      {
        title: 'Common Fixes',
        items: [
          'Add another producer from the deficient input row or increase an upstream machine count.',
          'Check that the edge connects the correct output product to the correct input product.',
          'Use Compute again after changing counts or connections so the dashboard reflects the latest solved graph.',
        ],
      },
    ],
  },
  {
    id: 'zero-steam-distilled-water',
    tabId: 'troubleshooting',
    title: 'Zero Steam Or Distilled Water',
    summary: 'Checks for Boiler, Heat Exchanger, and Steam Condenser outputs that solve to zero.',
    Icon: Zap,
    keywords: [
      'boiler',
      'heat exchanger',
      'steam condenser',
      'steam',
      'distilled water',
      'coolant',
      'temperature',
      'water',
      'zero output',
    ],
    sections: [
      {
        title: 'Boiler And Heat Exchanger',
        items: [
          'Confirm Water is connected to the water input and Steam is connected from the steam output.',
          'If coolant is enabled, keep the linked coolant input and output connected to the same coolant product path.',
          'Open Node Editor and review Settings such as water temperature, coolant temperature, and coolant enablement when present.',
          'A zero Steam result can be valid when the current temperature and connection state do not satisfy the special recipe conditions.',
        ],
      },
      {
        title: 'Steam Condenser',
        items: [
          'Confirm Steam reaches the condenser input and the distilled water output is connected where it is needed.',
          'Review condenser Settings such as steam temperature, coolant temperature, and steam flow when visible.',
          'Run Compute or wait for the canvas solve after changing connected temperatures or flow rates.',
          'A zero distilled water result can be valid when the solved steam flow or condensation conditions are not met.',
        ],
      },
    ],
  },
  ...CATEGORIZED_TIPS.map((cat) => ({
    id: cat.id,
    tabId: 'tips' as const,
    title: cat.title,
    summary: cat.summary,
    Icon: ICON_MAP[cat.icon] || Zap,
    keywords: ['tips', 'hints', 'tricks', ...cat.title.toLowerCase().split(' ')],
    sections: [
      {
        title: cat.title,
        items: cat.tips,
      },
    ],
  })),
  {
    id: 'about-credits',
    tabId: 'credits',
    title: 'About & Credits',
    summary: 'Developer credits, game asset attributions, and contact links.',
    Icon: Info,
    keywords: ['about', 'credits', 'attributions', 'authors', 'creators', 'pollywrath', 'mamytema', 'license', 'wiki', 'contact', 'support', 'github'],
    sections: [
      {
        title: 'Project Info',
        listStyle: 'none',
        items: [
          <span key="project-desc">
            Industrialist Calculator is an interactive, flowchart-based calculator and factory solver for the Roblox game <strong>Industrialist</strong>. It is designed to help players design layouts, calculate production rates, and optimize factory setups.
          </span>,
        ],
      },
      {
        title: 'Credits & Attributions',
        listStyle: 'unordered',
        items: [
          <span key="creator">
            Created and maintained by <strong>Pollywrath</strong> (
            <a
              href="https://github.com/pollywrath"
              target="_blank"
              rel="noopener noreferrer"
              className={styles['help-link']}
            >
              GitHub Profile
            </a>
            ).
          </span>,
          <span key="game-ip">
            All recipe data, machine stats, and formulas are based on the Roblox game <strong>Industrialist</strong> by <strong>Mamytema Studios</strong>.
          </span>,
          <span key="wiki-assets">
            Icons and sprites are sourced from the official <strong>Industrialist Wiki</strong> and are used under the <strong>Creative Commons CC BY-NC-SA 4.0</strong> license.
          </span>,
          <span key="scip-solve">
            The LP Solver uses a WebAssembly build of the <strong>SCIP Optimization Suite</strong> (licensed under Apache 2.0), adapted from Jacob Strieb's Poker Chipper repository.
          </span>,
        ],
      },
      {
        title: 'Contact & Support',
        listStyle: 'unordered',
        items: [
          <span key="repo-link">
            Submit bug reports, feature requests, or view the source code on the official{' '}
            <a
              href="https://github.com/Pollywrath/Industrialist-Production-Calculator"
              target="_blank"
              rel="noopener noreferrer"
              className={styles['help-link']}
            >
              GitHub Repository
            </a>
            .
          </span>,
          <span key="feedback">
            Feedback and pull requests are welcome! Please open a GitHub issue to discuss potential changes.
          </span>,
        ],
      },
    ],
  },
];

interface ChangelogCommit {
  hash: string;
  version: string;
  minor: number;
  minorName?: string;
  patch: number;
  date?: string;
  subject: string;
  items: string[];
}

const typedChangelogData = changelogData as ChangelogCommit[];

const commitsByMinor = new Map<number, ChangelogCommit[]>();
for (let i = 0; i < typedChangelogData.length; i++) {
  const commit = typedChangelogData[i];
  if (!commitsByMinor.has(commit.minor)) {
    commitsByMinor.set(commit.minor, []);
  }
  commitsByMinor.get(commit.minor)!.push(commit);
}

const CHANGELOG_ARTICLES: HelpArticle[] = [];
const sortedMinors = Array.from(commitsByMinor.keys()).sort((a, b) => b - a);

for (let i = 0; i < sortedMinors.length; i++) {
  const minor = sortedMinors[i];
  const commits = commitsByMinor.get(minor)!;
  commits.sort((a, b) => a.patch - b.patch);

  const minorName = commits[0]?.minorName || `Version 0.${minor}.x Updates`;

  CHANGELOG_ARTICLES.push({
    id: `changelog-v0${minor}`,
    tabId: 'changelog',
    title: `v0.${minor}.x: ${minorName}`,
    summary: `Version 0.${minor}.x updates including ${minorName.toLowerCase()} and other changes.`,
    Icon: History,
    keywords: ['changelog', 'version', 'updates', 'history', 'release', 'notes', 'commit', `v0.${minor}.x`, ...minorName.toLowerCase().split(' ')],
    sections: commits.map(c => ({
      title: c.date ? `${c.version} (${c.date})` : c.version,
      items: c.items
    }))
  });
}

const HELP_ARTICLES: HelpArticle[] = [
  ...BASE_HELP_ARTICLES,
  ...CHANGELOG_ARTICLES
];

function articleMatches(article: HelpArticle, query: string): boolean {
  const haystack = [
    article.title,
    article.summary,
    ...article.keywords,
    ...article.sections.flatMap((section) => [section.title, ...section.items]),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

export function HelpOverlay() {
  const isHelpOverlayOpen = useUIStore((s) => s.isHelpOverlayOpen);

  if (!isHelpOverlayOpen) return null;

  return <HelpOverlayModal />;
}

function HelpOverlayModal() {
  const setHelpOverlayOpen = useUIStore((s) => s.setHelpOverlayOpen);
  const [activeTab, setActiveTab] = useState<HelpTabId>('start');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');

  const startTutorial = (tutorialId: TutorialId) => {
    setHelpOverlayOpen(false);
    void useTutorialStore.getState().startTutorial(tutorialId, 'help');
  };

  const query = searchQuery.trim().toLowerCase();
  const visibleArticles = HELP_ARTICLES.filter((article) => {
    if (query) return articleMatches(article, query);
    return article.tabId === activeTab;
  });
  const selectedArticle =
    visibleArticles.find((article) => article.id === selectedArticleId) ?? visibleArticles[0];

  return createPortal(
    <div className={styles['help-overlay']} onClick={() => setHelpOverlayOpen(false)}>
      <div className={styles['help-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['help-header']}>
          <div className={styles['help-title']}>
            <HelpCircle size={18} />
            <span>Help</span>
          </div>
          <button className={styles['help-close']} onClick={() => setHelpOverlayOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className={styles['help-toolbar']}>
          <div className={styles['search-box']}>
            <Search size={14} className={styles['search-icon']} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help..."
              className={styles['search-input']}
            />
            {searchQuery && (
              <button className={styles['search-clear']} onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className={styles['help-tabs']}>
          {HELP_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles['tab-btn']} ${activeTab === tab.id && !query ? styles['is-active'] : ''}`}
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id && !query}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles['help-content']}>
          <div className={styles['article-list']} aria-label="Help topics">
            {visibleArticles.length === 0 ? (
              <div className={styles['empty-state']}>No help topics have been added yet.</div>
            ) : (
              visibleArticles.map((article) => {
                const Icon = article.Icon;
                const isActive = selectedArticle?.id === article.id;

                return (
                  <button
                    key={article.id}
                    className={`${styles['article-card']} ${isActive ? styles['is-active'] : ''}`}
                    onClick={() => setSelectedArticleId(article.id)}
                  >
                    <Icon size={16} className={styles['article-icon']} />
                    <span className={styles['article-card-text']}>
                      <span className={styles['article-card-header']}>
                        <span className={styles['article-card-title']}>{article.title}</span>
                        {(article.hasTutorial || article.tutorialId) && (
                          <span className={styles['tutorial-badge']}>Tutorial</span>
                        )}
                      </span>
                      <span className={styles['article-card-summary']}>{article.summary}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className={styles['article-detail']}>
            {selectedArticle ? (
              <>
                <div className={styles['article-detail-header']}>
                  <selectedArticle.Icon size={20} />
                  <div className={styles['article-detail-title-block']}>
                    <div className={styles['article-detail-title-row']}>
                      <h2 className={styles['article-detail-title']}>{selectedArticle.title}</h2>
                      {(selectedArticle.hasTutorial || selectedArticle.tutorialId) && (
                        <span className={styles['tutorial-badge']}>Tutorial</span>
                      )}
                    </div>
                    <p className={styles['article-detail-summary']}>{selectedArticle.summary}</p>
                    {selectedArticle.tutorialId && (
                      <button
                        className={styles['tutorial-start-btn']}
                        onClick={() => startTutorial(selectedArticle.tutorialId!)}
                      >
                        Start Tutorial
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles['article-sections']}>
                  {selectedArticle.sections.map((section) => (
                    <section key={section.title} className={styles['article-section']}>
                      <h3 className={styles['section-title']}>{section.title}</h3>
                      {section.listStyle === 'none' ? (
                        <div className={styles['section-text-container']}>
                          {section.items.map((item, idx) => (
                            <div key={idx} className={styles['section-text-item']}>
                              {item}
                            </div>
                          ))}
                        </div>
                      ) : section.listStyle === 'unordered' ? (
                        <ul className={styles['section-list-unordered']}>
                          {section.items.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <ol className={styles['section-list']}>
                          {section.items.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ol>
                      )}
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles['empty-state']}>Select a help topic.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
