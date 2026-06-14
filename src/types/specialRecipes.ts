import type { ProductType, Recipe } from './data';

export type SettingType = 'number' | 'select' | 'product';

export interface BaseSettingDefinition {
  type: SettingType;
  label: string;
  dynamicLabel?: (settings: Record<string, unknown>, globalSettings?: Record<string, unknown>) => string;
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

export interface SpecialRecipe {
  id: string;
  name: string;
  machine_id: string;
  isSellTrash?: boolean;
  description?: string;
  settings: Record<string, SettingDefinition>;
  inputTemperatureSettings?: Record<number, string>;
  potentialInputs?: string[];
  potentialOutputs?: string[];
  potentialInputProductTypes?: ProductType[];
  potentialOutputProductTypes?: ProductType[];
  flowDependentInputs?: boolean;
  pollutionIndependentOfMachineCount?: boolean;
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
  computeModelCount?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
  ) => number;
}
