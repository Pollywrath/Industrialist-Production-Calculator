import type { TutorialStep } from './types';

export const GROUPS_TUTORIAL_ID = 'groups' as const;

export const GROUP_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    title: 'Groups',
    description:
      'Groups help keep large canvases responsive and easier to read. They also give you a clean way to organize a chain without losing the underlying nodes.',
    highlight: { kind: 'node', alias: 'gearbox' },
    action: { type: 'continue' },
  },
  {
    id: 'enable-multi-select',
    title: 'Enable Multi-Select',
    description: 'Turn on Multi-select. The Add Recipe button will become Add Group while this mode is active.',
    highlight: { kind: 'control', id: 'multi_select' },
    action: { type: 'control', id: 'multi_select' },
  },
  {
    id: 'add-group-mode',
    title: 'Add Group Mode',
    description: 'Add Recipe has changed into Add Group. It becomes available once groupable nodes are selected.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'continue' },
  },
  {
    id: 'select-steel-branch',
    title: 'Select Steel Parts',
    description: 'Select the Steel Plate, Gear, and Steel Rod nodes. These will become the first group.',
    highlight: { kind: 'node', alias: 'steelPlate' },
    secondaryHighlights: [
      { kind: 'node', alias: 'gear' },
      { kind: 'node', alias: 'steelRod' },
    ],
    action: { type: 'node-multi-select', aliases: ['steelPlate', 'gear', 'steelRod'] },
  },
  {
    id: 'create-steel-group',
    title: 'Create The Group',
    description: 'Click Add Group to wrap the selected nodes.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'group-create', alias: 'steelUtilityGroup' },
  },
  {
    id: 'explain-group-node',
    title: 'Group Node',
    description:
      'The group boundary moves with its members. The top bar collapses the group, and the menu button edits group options like the label.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    secondaryHighlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'edit' },
    action: { type: 'continue' },
  },
  {
    id: 'collapse-group',
    title: 'Collapse The Group',
    description: 'Click the group top bar to collapse it.',
    highlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'bar' },
    action: { type: 'group-collapse', alias: 'steelUtilityGroup' },
  },
  {
    id: 'collapsed-group',
    title: 'Collapsed Group',
    description:
      'A collapsed group looks like a recipe node, but it is a proxy. Its rectangles summarize external inputs and outputs, and its handles proxy connections crossing the group boundary.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'open-gearbox-editor',
    title: 'Scale From Gearbox',
    description: 'Open the Gearbox node editor from its menu button.',
    highlight: { kind: 'node-editor-button', alias: 'gearbox' },
    action: { type: 'node-editor-open', alias: 'gearbox' },
  },
  {
    id: 'gearbox-count-15',
    title: 'Set Machine Count',
    description: 'Change the Gearbox machine count to 15.',
    highlight: { kind: 'node-editor', id: 'machine-count' },
    action: { type: 'node-editor-machine-count', alias: 'gearbox', value: 15 },
  },
  {
    id: 'gearbox-apply-chain',
    title: 'Apply To Chain',
    description: 'Apply to Chain scales the connected production chain, including nodes inside collapsed groups.',
    highlight: { kind: 'node-editor', id: 'apply-chain' },
    action: { type: 'node-editor-apply', mode: 'chain' },
  },
  {
    id: 'expand-group',
    title: 'Expand The Group',
    description: 'Go back to the collapsed group and expand it.',
    highlight: { kind: 'group', alias: 'steelUtilityGroup', part: 'expand' },
    action: { type: 'group-expand', alias: 'steelUtilityGroup' },
  },
  {
    id: 'members-scaled',
    title: 'Members Updated',
    description:
      'The nodes inside the group changed with the connected chain. Compute uses the same graph, so grouped nodes still participate normally.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'enable-multi-select-again',
    title: 'Enable Multi-Select Again',
    description: 'Turn Multi-select back on for the second group.',
    highlight: { kind: 'control', id: 'multi_select' },
    action: { type: 'control', id: 'multi_select' },
  },
  {
    id: 'select-support-nodes',
    title: 'Select Support Nodes',
    description: 'Select the PTA, Crankshaft, Boiler, and Gas Refinery nodes for a second group.',
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
    title: 'Create Another Group',
    description: 'Click Add Group again.',
    highlight: { kind: 'control', id: 'add_recipe' },
    action: { type: 'group-create', alias: 'supportGroup' },
  },
  {
    id: 'layout-groups',
    title: 'Run Layout',
    description: 'Run auto layout. Layout respects group membership while organizing the canvas.',
    highlight: { kind: 'control', id: 'layout' },
    action: { type: 'control', id: 'layout' },
  },
  {
    id: 'layout-result',
    title: 'Grouped Layout',
    description:
      'Both groups stay together after layout. This is useful when a canvas grows and you want structure without manually rebuilding the chain.',
    highlight: { kind: 'node', alias: 'steelUtilityGroup' },
    secondaryHighlight: { kind: 'node', alias: 'supportGroup' },
    action: { type: 'continue' },
  },
  {
    id: 'done',
    title: 'Groups Complete',
    description: 'That is the core loop: select nodes, create groups, collapse when you need a compact view, and expand when you need direct access.',
    highlight: { kind: 'node', alias: 'gearbox' },
    action: { type: 'continue' },
  },
];
