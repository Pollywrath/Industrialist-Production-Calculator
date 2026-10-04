import type { TutorialStep } from './types';

export const GROUPS_TUTORIAL_ID = 'groups' as const;

export const GROUP_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    title: 'Keep related recipes together',
    description:
      'We’ll group a few connected recipes, collapse them, and then scale the chain to see how the group behaves.',
    highlight: { kind: 'node', alias: 'gearbox' },
    action: { type: 'continue' },
  },
  {
    id: 'enable-multi-select',
    title: 'Select several recipes',
    description:
      'Turn on Multi-select. Once you select recipes that can be grouped, Add Recipe changes to Add Group.',
    highlight: { kind: 'control', id: 'multi_select' },
    action: { type: 'control', id: 'multi_select' },
  },
  {
    id: 'add-group-mode',
    title: 'Add Group appears',
    description:
      'The selected recipes can be grouped. Choose Add Group to put them inside one movable group.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'continue' },
  },
  {
    id: 'select-steel-branch',
    title: 'Pick the steel branch',
    description:
      'Select Steel Plate, Gear, and Steel Rod. We’ll put these three recipes in the first group.',
    highlight: { kind: 'node', alias: 'steelPlate' },
    secondaryHighlights: [
      { kind: 'node', alias: 'gear' },
      { kind: 'node', alias: 'steelRod' },
    ],
    action: { type: 'node-multi-select', aliases: ['steelPlate', 'gear', 'steelRod'] },
  },
  {
    id: 'create-steel-group',
    title: 'Create the group',
    description: 'Choose Add Group. The selected recipes will move together from now on.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'group-create', alias: 'steelUtilityGroup' },
  },
  {
    id: 'explain-group-node',
    title: 'Meet the group node',
    description:
      'Drag the group to move its recipes. Use the top bar to collapse it, or open its menu to change the label.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    secondaryHighlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'edit' },
    action: { type: 'continue' },
  },
  {
    id: 'collapse-group',
    title: 'Collapse the group',
    description: 'Click the top bar to hide the recipes inside.',
    highlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'bar' },
    action: { type: 'group-collapse', alias: 'steelUtilityGroup' },
  },
  {
    id: 'collapsed-group',
    title: 'Connections stay visible',
    description:
      'The collapsed group shows the products crossing its boundary. Its proxy ports keep those outside connections available.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'open-gearbox-editor',
    title: 'Change the Gearbox count',
    description: 'Open the Gearbox editor from its menu button.',
    highlight: { kind: 'node-editor-button', alias: 'gearbox' },
    action: { type: 'node-editor-open', alias: 'gearbox' },
  },
  {
    id: 'gearbox-count-15',
    title: 'Set the count to 15',
    description: 'Set Gearbox to 15 machines.',
    highlight: { kind: 'node-editor', id: 'machine-count' },
    action: { type: 'node-editor-machine-count', alias: 'gearbox', value: 15 },
  },
  {
    id: 'gearbox-apply-chain',
    title: 'Scale the connected chain',
    description:
      'Choose Apply to Chain. Connected machines scale by the same ratio, including recipes inside collapsed groups.',
    highlight: { kind: 'node-editor', id: 'apply-chain' },
    action: { type: 'node-editor-apply', mode: 'chain' },
  },
  {
    id: 'expand-group',
    title: 'Open the group again',
    description: 'Expand the steel group to see its recipes.',
    highlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'expand' },
    action: { type: 'group-expand', alias: 'steelUtilityGroup' },
  },
  {
    id: 'members-scaled',
    title: 'The group kept its recipes',
    description:
      'The steel recipes scaled with the rest of the chain. Grouping changes the view, not how the solver uses those nodes.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'enable-multi-select-again',
    title: 'Make another group',
    description: 'Turn Multi-select back on to choose recipes for a second group.',
    highlight: { kind: 'control', id: 'multi_select' },
    action: { type: 'control', id: 'multi_select' },
  },
  {
    id: 'select-support-nodes',
    title: 'Choose support recipes',
    description: 'Select PTA, Crankshaft, Boiler, and Gas Refinery for the second group.',
    highlight: { kind: 'node', alias: 'pta' },
    secondaryHighlights: [
      { kind: 'node', alias: 'crankshaft' },
      { kind: 'node', alias: 'boiler' },
      { kind: 'node', alias: 'gasRefinery' },
    ],
    action: { type: 'node-multi-select', aliases: ['pta', 'crankshaft', 'boiler', 'gasRefinery'] },
  },
  {
    id: 'create-support-group',
    title: 'Create the second group',
    description: 'Choose Add Group to collect those support recipes.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'group-create', alias: 'supportGroup' },
  },
  {
    id: 'layout-groups',
    title: 'Arrange the canvas',
    description: 'Run Layout to organize the recipes while keeping each group together.',
    highlight: { kind: 'control', id: 'layout' },
    action: { type: 'control', id: 'layout' },
  },
  {
    id: 'layout-result',
    title: 'The groups stay together',
    description:
      'Auto Layout moved the graph without separating either group. Expand a group whenever you need to edit its recipes.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    secondaryHighlight: { kind: 'node', alias: 'supportGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'done',
    title: 'That’s grouping',
    description:
      'Select related recipes, add a group, and collapse it when you want more room on the canvas.',
    highlight: { kind: 'node', alias: 'gearbox' },
    action: { type: 'continue' },
  },
];
