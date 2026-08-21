import type { ProductType, Recipe } from './data';
import type { ResearchInfrastructureStats } from '../utils/researchInfrastructure';

export type SettingType = 'number' | 'select' | 'product';

export interface BaseSettingDefinition {
  type: SettingType;
  label: string;
  dynamicLabel?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    context?: { researchInfrastructure: ResearchInfrastructureStats },
  ) => string;
}

export interface NumberSettingDefinition extends BaseSettingDefinition {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface SelectSettingDefinition extends BaseSettingDefinition {
  type: 'select';
  default: unknown;
  options: { label: string; value: unknown }[];
  getOptions?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
  ) => { label: string; value: unknown }[];
}

export interface ProductSettingDefinition extends BaseSettingDefinition {
  type: 'product';
  default: string;
  productType?: ProductType;
}

export type SettingDefinition =
  | NumberSettingDefinition
  | SelectSettingDefinition
  | ProductSettingDefinition;

export interface SpecialRecipeAutocompleteContext {
  globalSettings?: Record<string, unknown>;
  powerOutputGoal: number | null;
}

export interface SpecialRecipeAutocompleteSizingContext {
  globalSettings?: Record<string, unknown>;
  machineCount: number;
}

export interface AutocompleteTemperatureRange {
  min?: number;
  max?: number;
}

export interface SpecialRecipe {
  id: string;
  name: string;
  machine_id: string;
  isSellTrash?: boolean;
  autocompleteDisposalPriority?: 'primary' | 'secondary' | 'last-resort';
  description?: string;
  settings: Record<string, SettingDefinition>;
  inputTemperatureSettings?: Record<number, string>;
  potentialInputs?: string[];
  potentialOutputs?: string[];
  potentialInputProductTypes?: ProductType[];
  potentialOutputProductTypes?: ProductType[];
  flowDependentInputs?: boolean;
  pollutionIndependentOfMachineCount?: boolean;
  getAutocompleteSettings?: (
    defaults: Record<string, unknown>,
    context: SpecialRecipeAutocompleteContext,
  ) => Record<string, unknown>[];
  resolveAutocompleteSettings?: (
    settings: Record<string, unknown>,
    context: SpecialRecipeAutocompleteContext,
  ) => Record<string, unknown>;
  sizeAutocompleteSettings?: (
    settings: Record<string, unknown>,
    context: SpecialRecipeAutocompleteSizingContext,
  ) => Record<string, unknown>;
  getAutocompleteInputTemperatureRange?: (
    settings: Record<string, unknown>,
    inputIndex: number,
    productId: string,
  ) => AutocompleteTemperatureRange | null;
  getAutocompleteLinkedInputProducts?: (
    settings: Record<string, unknown>,
    inputIndex: number,
  ) => string[] | null;
  allowAutocompleteLinkedOutputRecirculation?: boolean;
  preventAutocompleteRecipeChaining?: boolean;
  resolveSettings?: (productId: string) => Record<string, unknown> | null;
  compute: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
    helpers?: {
      resolveProduct: (side: 'input' | 'output', index: number) => string;
      hasConnection: (side: 'input' | 'output', index: number) => boolean;
      getFlowRate?: (side: 'input' | 'output', index: number) => number;
    },
  ) => Recipe;
  computeMachineCost?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
  computeMachineCostIndependentOfMachineCount?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
  computeModelCount?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
  computeModelCountIndependentOfMachineCount?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
  computeMachineSpace?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
  computeMachineSpaceIndependentOfMachineCount?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
}
