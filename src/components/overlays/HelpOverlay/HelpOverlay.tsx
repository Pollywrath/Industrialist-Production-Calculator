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
    title: 'Build your first chain',
    summary: 'Add a Gearbox recipe, connect its ingredients, and check the result.',
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
        title: 'In this walkthrough',
        items: [
          'Start with Gearbox and add recipes for the ingredients it needs.',
          'Click an input row to find a producer for that product; the selector is filtered for you.',
          'Mark Gearbox as a target before opening Compute.',
          'When the chain is connected, check its rates, solve for machine counts, and save the layout.',
        ],
      },
      {
        title: 'Canvas Flow',
        items: [
          'Open Add Recipe, choose Search by Product, and search for Gearbox.',
          'Choose a Gearbox recipe, then click an input row to find a recipe that makes that ingredient.',
          'Connect producer outputs to the matching inputs. Use Layout if the graph gets crowded.',
          'Mark Gearbox as a target, run Compute, and review the suggested machine counts before applying them.',
        ],
      },
      {
        title: 'Steam Branch',
        items: [
          'If a recipe needs Steam, add a Boiler and connect its water and steam paths.',
          'Some special recipes need a coolant loop or a temperature setting. Open the node editor to see the controls available for that recipe.',
        ],
      },
    ],
  },
  {
    id: 'reading-recipe-node',
    tabId: 'start',
    title: 'Read a recipe node',
    summary: 'Find recipe rates, connections, machine counts, and node controls.',
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
        title: 'Rows and rates',
        items: [
          'Inputs are on the left; outputs are on the right. Each row shows its product and rate.',
          'Rates follow the unit selected in the controls tray. Temperature appears on rows that use it.',
          'The node header shows its machine count and may show target, power, or pollution details.',
          'Linked-row markers connect related ports, such as the input and output of a coolant loop.',
        ],
      },
      {
        title: 'Interactions',
        items: [
          'Click a row to add or search for a recipe that uses or makes that product.',
          'Drag from an output port to a compatible input port to connect recipes.',
          'Double-click a connected port to balance its machine count against the connected product flow.',
          'Open the node menu to edit its count, handle order, or special recipe settings.',
        ],
      },
    ],
  },
  {
    id: 'saves',
    tabId: 'start',
    title: 'Saves',
    summary: 'Save a layout in this browser or export it for another device.',
    Icon: Save,
    keywords: ['save manager', 'saves', 'save', 'load', 'merge', 'json', 'png', 'export', 'import'],
    sections: [
      {
        title: 'Save Manager',
        items: [
          'Open Save Manager to name and save the current layout.',
          'From a saved layout, you can load it, merge it into the canvas, rename it, delete it, or export it.',
          'Import or export a JSON file to move a layout between browsers or keep a backup.',
          'Export PNG saves an image of the canvas view.',
        ],
      },
      {
        title: 'Local Storage',
        items: [
          'Save Manager data stays in this browser; it is not synced to an account.',
          'Export a JSON file if you need a separate backup.',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    tabId: 'start',
    title: 'Dashboard',
    summary: 'Read the totals and find products that are short or left over.',
    Icon: LayoutDashboard,
    keywords: [
      'dashboard',
      'production stats',
      'more stats',
      'power use',
      'power output',
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
          'Production Stats includes power use and output, machine cost and model count, profit, and Net Pollution.',
          'Change Rate in the controls tray to view quantities per second, minute, hour, or recipe cycle.',
          'Net Pollution includes pollution reductions. The optimizer’s Produced Pollution metric does not subtract them.',
        ],
      },
      {
        title: 'Diagnostics',
        items: [
          'Deficiencies lists connected inputs that need more product than the graph supplies.',
          'Excess Byproducts lists output that has no connected demand.',
          'Expand a product to see the affected nodes. Click a row to center the canvas on that node.',
        ],
      },
    ],
  },
  {
    id: 'controls-tray',
    tabId: 'controls',
    title: 'Controls tray',
    summary: 'Add recipes, change tools, arrange the graph, and open overlays.',
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
          'Add Recipe opens the recipe selector. When the selected nodes can be grouped, the button changes to Add Group.',
          'Delete, Multi-select, and Target change what a click on the canvas does.',
          'Layout arranges the current graph using the selected edge style.',
          'Compute opens the optimizer. Mark at least one recipe node as a target first.',
        ],
      },
      {
        title: 'Actions',
        items: [
          'Machines opens research, difficulty, and machine availability settings.',
          'Rate switches between per-second, per-minute, per-hour, and raw recipe-cycle values.',
          'Clear removes the current graph. Undo and Redo move through its edit history.',
        ],
      },
    ],
  },
  {
    id: 'compute-optimizer',
    tabId: 'start',
    title: 'Compute and optimization',
    summary: 'Choose what the optimizer should change and how it should rank solutions.',
    Icon: Gauge,
    keywords: [
      'compute',
      'optimizer',
      'ratio optimizer',
      'autocomplete',
      'machine count',
      'priority',
      'importance',
      'whole machines',
      'produced pollution',
    ],
    sections: [
      {
        title: 'Choose a mode',
        items: [
          'Adjust ratios keeps the recipes already on the canvas and suggests new machine counts.',
          'Complete Production is experimental. It searches for upstream recipes to supply existing targets.',
          'Each mode remembers its own metric settings. Reset restores the defaults for both modes.',
        ],
      },
      {
        title: 'Set priorities',
        items: [
          'The solver first reduces connected-input shortages, then excess sent to sinks.',
          'After that, it compares the metrics you enable. Lower priority numbers are considered first; Importance weights metrics at the same priority.',
          'Count full machines rounds up machine counts for cost, space, and model count. Leaving it off is faster but can understate those totals.',
          'Adjust machine counts starts with Power Use and Produced Pollution. Complete production starts with Machine Space and Machine Model Count, using fractional machines.',
        ],
      },
      {
        title: 'Review the result',
        items: [
          'Compute shows the proposed counts and metric totals before you apply the result.',
          'The optimizer’s Produced Pollution counts emissions without reductions. The dashboard continues to show Net Pollution.',
        ],
      },
    ],
  },
  {
    id: 'canvas-navigation',
    tabId: 'controls',
    title: 'Canvas navigation',
    summary: 'Pan and zoom the graph, use shortcut keys, and edit connections.',
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
          'Drag the canvas to pan; use the mouse wheel or trackpad to zoom.',
          'Drag a selected node to move it. If several recipe nodes are selected, they move together.',
          'A collapsed group moves with its member nodes.',
        ],
      },
      {
        title: 'Temporary Modes',
        items: [
          'Hold Alt to use Delete temporarily.',
          'Hold Ctrl (Windows/Linux) or Command (Mac) to use Multi-select temporarily.',
          'Hold Shift to use Target temporarily.',
          'Undo with Ctrl/Command+Z. Redo with Ctrl/Command+Y or Ctrl/Command+Shift+Z.',
        ],
      },
      {
        title: 'Edges',
        items: [
          'Click an edge to select it and show its edit points.',
          'Double-click a straight or curved edge to add a bend; orthogonal edges add two bends.',
          'Drag a visible segment handle to adjust an orthogonal route.',
        ],
      },
    ],
  },
  {
    id: 'node-editor',
    tabId: 'controls',
    title: 'Node editor',
    summary: 'Change a node’s machine count, port order, and recipe settings.',
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
          'Open the editor from the node menu button.',
          'Count & Handles lets you change the machine count and reorder inputs or outputs.',
          'Reset Handles restores the recipe’s original port order.',
          'Apply saves this node. Apply to Chain scales connected nodes by the same count ratio.',
        ],
      },
      {
        title: 'Settings',
        items: [
          'Settings appears for recipes with extra controls, such as fuel or temperature.',
          'For temperature-sensitive recipes, connected flow can override the temperature entered here.',
          'A setting can change the recipe’s ports or rates. Check its connections after editing.',
        ],
      },
    ],
  },
  {
    id: 'groups',
    tabId: 'controls',
    title: 'Groups',
    summary: 'Keep related recipes together and simplify a busy canvas.',
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
          'Turn on Multi-select and select the recipe nodes you want to group.',
          'Add Recipe changes to Add Group when the selection can be grouped.',
          'Choose Add Group to create the group.',
        ],
      },
      {
        title: 'Use A Group',
        items: [
          'Drag the group to move it and its recipes together.',
          'Open Group Node Editor to change the label or group settings.',
          'Collapse the group to save space; expand it to see its recipes again.',
          'A collapsed group keeps boundary connections available through its proxy handles.',
        ],
      },
    ],
  },
  {
    id: 'machines-overlay',
    tabId: 'controls',
    title: 'Machines and research',
    summary: 'Set difficulty, manage research unlocks, and control recipe availability.',
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
          'Choose Production, Energy, or Utility to browse that part of the research tree.',
          'Difficulty affects which machines and recipes are available.',
          'Use Ore Nodes and Variant & Limited Machines to show or hide those machines in recipe search.',
        ],
      },
      {
        title: 'Research Graph',
        items: [
          'Select a research node to see its cost, prerequisites, and machine unlocks.',
          'Unlock Chain unlocks that research and its prerequisites.',
          'Lock Chain locks the selected research and its dependents.',
        ],
      },
    ],
  },
  {
    id: 'themes',
    tabId: 'controls',
    title: 'Themes',
    summary: 'Choose a color preset or adjust the canvas and connection styles.',
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
          'Choose a dark or light preset to change the overall look.',
          'Advanced Editing lets you adjust individual theme colors.',
          'Edge Editing controls connection lines and routing.',
        ],
      },
      {
        title: 'Edges',
        items: [
          'Choose solid, dashed, or dotted lines.',
          'Choose straight, curved, or right-angle routes.',
          'Reset All restores the default edge styles.',
        ],
      },
    ],
  },
  {
    id: 'data-overlay',
    tabId: 'controls',
    title: 'Data Manager',
    summary: 'Edit the app’s recipe data or compare it with the wiki data.',
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
          'Choose Editing to change data used by the app.',
          'Select Products, Machines, Recipes, or Researches, then search for a record.',
          'Select a record to edit it, or add a new one from the list.',
          'Save Changes applies pending edits. Discard removes edits that are not saved.',
        ],
      },
      {
        title: 'Reset And Save',
        items: [
          'Restore Baseline Defaults resets the selected record to its built-in values.',
          'Restore Defaults returns the app data to its built-in values.',
          'Save Changes makes the edited data available to recipe search and calculations.',
        ],
      },
      {
        title: 'Comparing',
        items: [
          'Choose Comparing to check app data against the available wiki data.',
          'If no wiki data is loaded, choose Fetch in the toolbar.',
          'The results show records that differ or appear on only one side.',
        ],
      },
    ],
  },
  {
    id: 'compute-refuses',
    tabId: 'troubleshooting',
    title: 'Compute will not start',
    summary: 'Check the target and solver status before trying again.',
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
        title: 'Add a target',
        items: [
          'Compute needs at least one target recipe node.',
          'Choose Target in the controls tray, or hold Shift, then click a recipe node.',
          'The optimizer keeps the target count as a lower bound while it adjusts the rest of the graph.',
        ],
      },
      {
        title: 'Check the run',
        items: [
          'If a run is already active, wait for it to finish or cancel it before starting another.',
          'Review the proposed machine counts before choosing Apply or Discard.',
          'If a run fails, read the diagnostic message and check connected shortages first.',
        ],
      },
    ],
  },
  {
    id: 'missing-recipe',
    tabId: 'troubleshooting',
    title: 'A recipe is missing',
    summary: 'Find out why a recipe or machine is not in the selector.',
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
          'Search by Product if you know an input or output; use Search by Machine if you know the machine.',
          'Check the product, tier, category, subcategory, and recipe-stage filters.',
          'Click an input or output row on the canvas to open the selector for that product.',
        ],
      },
      {
        title: 'Availability Checks',
        items: [
          'In Machines, check the selected difficulty and whether the required research is unlocked.',
          'Check the Ore Nodes and Variant & Limited Machines filters.',
          'If you changed the entry in Data Manager, save the change before searching again.',
        ],
      },
    ],
  },
  {
    id: 'shortages-deficiencies',
    tabId: 'troubleshooting',
    title: 'Shortages and excess',
    summary: 'Use dashboard diagnostics to find where a chain needs attention.',
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
          'Open More Stats. Deficiencies lists connected inputs that need more product than they receive.',
          'Excess Byproducts lists output that is not being used by connected recipes.',
          'Expand a product to see which nodes use or produce it.',
          'Click a row to center the canvas on the related node.',
        ],
      },
      {
        title: 'Common Fixes',
        items: [
          'Add a producer from the deficient input, or increase the count of an upstream machine.',
          'Check that the connection joins the intended output and input.',
          'After changing the graph, wait for it to recalculate before checking the dashboard again.',
        ],
      },
    ],
  },
  {
    id: 'zero-steam-distilled-water',
    tabId: 'troubleshooting',
    title: 'Steam or distilled water is zero',
    summary: 'Check the connections and temperatures used by boilers and condensers.',
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
          'Check that water reaches the Boiler or Heat Exchanger and that its steam output is connected.',
          'If the recipe uses coolant, connect the linked coolant input and output to the same path.',
          'Open the node editor and review water and coolant temperatures and settings.',
          'Steam can be zero if the connected temperatures do not meet the recipe’s conditions.',
        ],
      },
      {
        title: 'Steam Condenser',
        items: [
          'Check that steam reaches the condenser and its water output is connected to a consumer.',
          'Review the condenser’s steam temperature, coolant temperature, and flow settings.',
          'Let the graph recalculate after changing a connection or temperature.',
          'No distilled water is produced when the steam flow or condensation conditions are insufficient.',
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
    keywords: [
      'about',
      'credits',
      'attributions',
      'authors',
      'creators',
      'pollywrath',
      'mamytema',
      'license',
      'wiki',
      'contact',
      'support',
      'github',
    ],
    sections: [
      {
        title: 'Project Info',
        listStyle: 'none',
        items: [
          <span key="project-desc">
            Industrialist Calculator is a production planner for the Roblox game{' '}
            <strong>Industrialist</strong>. Build a recipe graph to check flows, find shortages, and
            plan machine counts.
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
            All recipe data, machine stats, and formulas are based on the Roblox game{' '}
            <strong>Industrialist</strong> by <strong>Mamytema Studios</strong>.
          </span>,
          <span key="wiki-assets">
            Icons and sprites are sourced from the official <strong>Industrialist Wiki</strong> and
            are used under the <strong>Creative Commons CC BY-NC-SA 4.0</strong> license.
          </span>,
          <span key="scip-solve">
            The ratio optimizer uses a custom WebAssembly build of the{' '}
            <strong>SCIP Optimization Suite</strong> and its open-source solver components.{' '}
            <a
              href={`${import.meta.env.BASE_URL}scip/THIRD_PARTY_LICENSES.txt`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles['help-link']}
            >
              Third-party licenses
            </a>
            .
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
            Feedback and pull requests are welcome! Please open a GitHub issue to discuss potential
            changes.
          </span>,
        ],
      },
    ],
  },
];

interface ChangelogPatch {
  hash: string;
  version: string;
  patch: number;
  date?: string;
  subject: string;
  items: string[];
}

interface ChangelogMinorGroup {
  minor: number;
  minorName: string;
  patches: ChangelogPatch[];
}

const typedChangelogData = changelogData as ChangelogMinorGroup[];

const sortedGroups = typedChangelogData.slice().sort((a, b) => b.minor - a.minor);

const CHANGELOG_ARTICLES: HelpArticle[] = sortedGroups.map((group) => {
  const sortedPatches = group.patches.slice().sort((a, b) => a.patch - b.patch);
  const minorName = group.minorName || `Version 0.${group.minor}.x Updates`;

  return {
    id: `changelog-v0${group.minor}`,
    tabId: 'changelog',
    title: `v0.${group.minor}.x: ${minorName}`,
    summary: '',
    Icon: History,
    keywords: [
      'changelog',
      'version',
      'updates',
      'history',
      'release',
      'notes',
      'commit',
      `v0.${group.minor}.x`,
      ...minorName.toLowerCase().split(' '),
    ],
    sections: sortedPatches.map((p) => ({
      title: p.date ? `${p.version} (${p.date})` : p.version,
      items: p.items,
    })),
  };
});

const HELP_ARTICLES: HelpArticle[] = [...BASE_HELP_ARTICLES, ...CHANGELOG_ARTICLES];

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
              placeholder="Search help topics…"
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
              <div className={styles['empty-state']}>No topics match that search.</div>
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
                        Start tutorial
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
              <div className={styles['empty-state']}>Choose a topic to read more.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
