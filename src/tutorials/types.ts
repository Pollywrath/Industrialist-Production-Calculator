export type TutorialId = 'first-production-chain' | 'groups' | 'data-overlay';

export type TutorialAlias =
  | 'gearbox'
  | 'crankshaft'
  | 'steelRod'
  | 'gear'
  | 'steelPlate'
  | 'steelIngot'
  | 'ironMix'
  | 'coalForIronMix'
  | 'ironPowder'
  | 'rawIron'
  | 'plasticCasing'
  | 'plasticPellets'
  | 'pta'
  | 'aceticAcid'
  | 'ethanol'
  | 'crudeOilForEthanol'
  | 'waterForEthanol'
  | 'steamCracker'
  | 'meg'
  | 'crudeOilForSteamCracker'
  | 'boiler'
  | 'gasBurner'
  | 'waterForGasBurner'
  | 'gasRefinery'
  | 'condenser'
  | 'naturalGas'
  | 'vanDepot'
  | 'steelUtilityGroup'
  | 'supportGroup'
  | 'coalDrillTutorial';

export type TutorialHighlight =
  | { kind: 'selector'; selector: string }
  | { kind: 'control'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'node'; alias: TutorialAlias }
  | { kind: 'node-editor-button'; alias: TutorialAlias }
  | { kind: 'rect'; alias: TutorialAlias; side: 'input' | 'output'; index: number }
  | { kind: 'handle'; alias: TutorialAlias; side: 'input' | 'output'; index: number }
  | {
      kind: 'edge';
      sourceAlias: TutorialAlias;
      sourceIndex: number;
      targetAlias: TutorialAlias;
      targetIndex: number;
    }
  | { kind: 'recipe-card'; recipeId: string }
  | { kind: 'product-row'; productId: string }
  | { kind: 'diagnostic'; status: 'deficiency' | 'excess'; productId: string; nodeAlias?: TutorialAlias }
  | { kind: 'node-editor'; id: string }
  | { kind: 'solver'; id: string }
  | { kind: 'save'; id: string }
  | { kind: 'dashboard'; id: string }
  | { kind: 'group'; alias: TutorialAlias; part?: 'bar' | 'edit' | 'expand' }
  | { kind: 'data'; selector: string };

export type TutorialAction =
  | { type: 'continue' }
  | { type: 'control'; id: string }
  | { type: 'overlay'; id: string }
  | { type: 'selector-tab'; tab: 'product' | 'machine' }
  | { type: 'selector-search'; query: string }
  | { type: 'selector-product'; productId: string }
  | { type: 'selector-filter'; filter: 'producer' | 'consumer' | 'outlet' | 'heatPower'; value: boolean }
  | { type: 'selector-recipe'; recipeId: string; alias?: TutorialAlias }
  | { type: 'node-rect'; alias: TutorialAlias; side: 'input' | 'output'; index: number }
  | { type: 'node-handle-double'; alias: TutorialAlias; side: 'input' | 'output'; index: number }
  | {
      type: 'edge-connect';
      sourceAlias: TutorialAlias;
      sourceIndex: number;
      targetAlias: TutorialAlias;
      targetIndex: number;
    }
  | { type: 'node-editor-open'; alias: TutorialAlias }
  | { type: 'node-editor-tab'; tab: 'count' | 'settings' }
  | { type: 'node-editor-machine-count'; alias: TutorialAlias; value: number }
  | { type: 'node-editor-setting'; key: string; value?: unknown }
  | { type: 'node-editor-apply'; mode: 'local' | 'chain' }
  | { type: 'dashboard-diagnostic'; status: 'deficiency' | 'excess'; productId: string; nodeAlias?: TutorialAlias }
  | { type: 'target-node'; alias: TutorialAlias }
  | { type: 'node-multi-select'; aliases: TutorialAlias[] }
  | { type: 'group-create'; alias: TutorialAlias }
  | { type: 'group-collapse'; alias: TutorialAlias }
  | { type: 'group-expand'; alias: TutorialAlias }
  | { type: 'solver-results' }
  | { type: 'solver-apply' }
  | { type: 'save-name'; value: string }
  | { type: 'save-create'; source: 'button' }
  | { type: 'data-main-tab'; tab: 'editing' | 'comparing' }
  | { type: 'data-edit-tab'; tab: 'products' | 'machines' | 'recipes' | 'researches' }
  | { type: 'data-search'; entity: 'product' | 'machine' | 'recipe' | 'research'; query: string }
  | { type: 'data-select'; entity: 'product' | 'machine' | 'recipe' | 'research'; id: string }
  | { type: 'data-add'; entity: 'product' | 'machine' | 'recipe' | 'research' }
  | { type: 'data-command'; id: string }
  | { type: 'data-field'; field: string; value: string | number | boolean }
  | { type: 'data-restore'; entity: 'product' | 'machine' | 'recipe' | 'research'; id: string }
  | { type: 'data-save' }
  | { type: 'data-close' };

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  highlight: TutorialHighlight;
  secondaryHighlight?: TutorialHighlight;
  secondaryHighlights?: TutorialHighlight[];
  action: TutorialAction;
  disableActiveInteraction?: boolean;
  popoverSide?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TutorialActionEvent {
  type: TutorialAction['type'];
  [key: string]: unknown;
}
