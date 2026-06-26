import type { SaveData } from '../types/saves';
import type { TutorialAlias, TutorialId, TutorialStep } from './types';
import {
  FIRST_PRODUCTION_CHAIN_COMPLETED_KEY,
  FIRST_PRODUCTION_CHAIN_PROMPT_KEY,
  FIRST_PRODUCTION_CHAIN_RECIPE_IDS,
  FIRST_PRODUCTION_CHAIN_STEPS,
  FIRST_PRODUCTION_CHAIN_TUTORIAL_ID,
} from './firstProductionChain';
import { GROUPS_TUTORIAL_ID, GROUP_TUTORIAL_STEPS } from './groupsTutorial';
import {
  DATA_OVERLAY_TUTORIAL_ID,
  DATA_OVERLAY_TUTORIAL_STEPS,
  DATA_TUTORIAL_RESET_OVERRIDE_IDS,
} from './dataOverlayTutorial';
import gearboxTutorialSaveRaw from './Gearbox_Tutorial_save.json?raw';

export interface TutorialDataScope {
  recipeIds?: readonly string[];
  overrideIds?: readonly string[];
}

export type TutorialInitialCanvas =
  | { type: 'empty' }
  | {
      type: 'save-data';
      data: SaveData;
      initialAliases?: Partial<Record<TutorialAlias, string>>;
    };

export interface TutorialDefinition {
  id: TutorialId;
  steps: TutorialStep[];
  dataScope?: TutorialDataScope;
  initialCanvas: TutorialInitialCanvas;
  useSandboxSettings?: boolean;
  promptStorageKey?: string;
  completedStorageKey?: string;
  saveCleanupStepId?: string;
  restoreRootDataOnFinish?: boolean;
}

const gearboxSave = JSON.parse(gearboxTutorialSaveRaw) as { data: SaveData };

const gearboxInitialAliases: Partial<Record<TutorialAlias, string>> = {
  gearbox: 'n-mqrln7xh-0',
  crankshaft: 'n-mqrlnms4-1',
  steelRod: 'n-mqrlodtg-2',
  gear: 'n-mqrlogxq-3',
  steelPlate: 'n-mqrlojfg-4',
  steelIngot: 'n-mqrlom5o-5',
  ironMix: 'n-mqrlp4dp-6',
  coalForIronMix: 'n-mqrlp76d-7',
  ironPowder: 'n-mqrlpekd-8',
  rawIron: 'n-mqrlphb1-9',
  plasticCasing: 'n-mqrlpslw-a',
  plasticPellets: 'n-mqrlpw32-b',
  pta: 'n-mqrlq0zi-c',
  aceticAcid: 'n-mqrlq39q-d',
  ethanol: 'n-mqrlq5yk-e',
  crudeOilForEthanol: 'n-mqrlq7rx-f',
  waterForEthanol: 'n-mqrlqaz3-g',
  steamCracker: 'n-mqrlqecd-h',
  meg: 'n-mqrlqq3p-i',
  crudeOilForSteamCracker: 'n-mqrlr1xq-j',
  boiler: 'n-mqrlr4m6-k',
  gasBurner: 'n-mqrlrmj9-l',
  waterForGasBurner: 'n-mqrlrxce-m',
  gasRefinery: 'n-mqrlrzgl-n',
  condenser: 'n-mqrls0uw-o',
  naturalGas: 'n-mqrls2dz-p',
  vanDepot: 'n-mqrlss6q-q',
};

export const TUTORIAL_DEFINITIONS: Record<TutorialId, TutorialDefinition> = {
  [FIRST_PRODUCTION_CHAIN_TUTORIAL_ID]: {
    id: FIRST_PRODUCTION_CHAIN_TUTORIAL_ID,
    steps: FIRST_PRODUCTION_CHAIN_STEPS,
    dataScope: { recipeIds: FIRST_PRODUCTION_CHAIN_RECIPE_IDS },
    initialCanvas: { type: 'empty' },
    useSandboxSettings: true,
    promptStorageKey: FIRST_PRODUCTION_CHAIN_PROMPT_KEY,
    completedStorageKey: FIRST_PRODUCTION_CHAIN_COMPLETED_KEY,
    saveCleanupStepId: 'save-create',
    restoreRootDataOnFinish: true,
  },
  [GROUPS_TUTORIAL_ID]: {
    id: GROUPS_TUTORIAL_ID,
    steps: GROUP_TUTORIAL_STEPS,
    dataScope: { recipeIds: FIRST_PRODUCTION_CHAIN_RECIPE_IDS },
    initialCanvas: {
      type: 'save-data',
      data: gearboxSave.data,
      initialAliases: gearboxInitialAliases,
    },
    useSandboxSettings: true,
    restoreRootDataOnFinish: true,
  },
  [DATA_OVERLAY_TUTORIAL_ID]: {
    id: DATA_OVERLAY_TUTORIAL_ID,
    steps: DATA_OVERLAY_TUTORIAL_STEPS,
    dataScope: { overrideIds: DATA_TUTORIAL_RESET_OVERRIDE_IDS },
    initialCanvas: { type: 'empty' },
    useSandboxSettings: true,
    restoreRootDataOnFinish: false,
  },
};

export function getTutorialDefinition(id: TutorialId | null): TutorialDefinition | null {
  return id ? TUTORIAL_DEFINITIONS[id] : null;
}
