import type { Recipe } from './data';

export type SettingType = 'number' | 'select' | 'product';

export interface BaseSettingDefinition {
  type: SettingType;
  label: string;
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
}

export interface ProductSettingDefinition extends BaseSettingDefinition {
  type: 'product';
  default: string; // product_id
}

export type SettingDefinition =
  | NumberSettingDefinition
  | SelectSettingDefinition
  | ProductSettingDefinition;

export interface SpecialRecipe {
  id: string;
  name: string;
  machine_id: string;
  settings: Record<string, SettingDefinition>;
  compute: (settings: Record<string, unknown>, globalSettings?: Record<string, unknown>) => Recipe;
}
