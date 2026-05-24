import type { Recipe, PowerType } from '../types/data';
import type { SpecialRecipe, SettingDefinition } from '../types/specialRecipes';

export interface SpecialRecipeConfig {
  id: string;
  name: string;
  recipeName?: string;
  machineId: string;
  isSellTrash?: boolean;
  settings?: Record<string, SettingDefinition>;
  inputTemperatureSettings?: Record<number, string>;
  powerConsumption:
    | number
    | ((
        settings: Record<string, unknown>,
        globalSettings?: Record<string, unknown>,
        nodeId?: string,
        helpers?: {
          resolveProduct: (side: 'input' | 'output', index: number) => string;
          hasConnection: (side: 'input' | 'output', index: number) => boolean;
        },
      ) => number);
  powerType:
    | PowerType
    | ((
        settings: Record<string, unknown>,
        globalSettings?: Record<string, unknown>,
        nodeId?: string,
        helpers?: {
          resolveProduct: (side: 'input' | 'output', index: number) => string;
          hasConnection: (side: 'input' | 'output', index: number) => boolean;
        },
      ) => PowerType);
  pollution:
    | number
    | ((
        settings: Record<string, unknown>,
        globalSettings?: Record<string, unknown>,
        nodeId?: string,
        helpers?: {
          resolveProduct: (side: 'input' | 'output', index: number) => string;
          hasConnection: (side: 'input' | 'output', index: number) => boolean;
        },
      ) => number);
  inputs:
    | Recipe['inputs']
    | ((
        settings: Record<string, unknown>,
        globalSettings?: Record<string, unknown>,
        nodeId?: string,
        helpers?: {
          resolveProduct: (side: 'input' | 'output', index: number) => string;
          hasConnection: (side: 'input' | 'output', index: number) => boolean;
        },
      ) => Recipe['inputs']);
  outputs:
    | Recipe['outputs']
    | ((
        settings: Record<string, unknown>,
        globalSettings?: Record<string, unknown>,
        nodeId?: string,
        helpers?: {
          resolveProduct: (side: 'input' | 'output', index: number) => string;
          hasConnection: (side: 'input' | 'output', index: number) => boolean;
        },
      ) => Recipe['outputs']);
  cycleTime?: number;
  computeCycleTime?: (
    settings: Record<string, unknown>,
    globalSettings?: Record<string, unknown>,
    nodeId?: string,
    helpers?: {
      resolveProduct: (side: 'input' | 'output', index: number) => string;
      hasConnection: (side: 'input' | 'output', index: number) => boolean;
    },
  ) => number;
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

export function createSpecialRecipe(config: SpecialRecipeConfig): SpecialRecipe {
  return {
    id: config.id,
    name: config.name,
    machine_id: config.machineId,
    settings: config.settings ?? {},
    inputTemperatureSettings: config.inputTemperatureSettings,
    compute: (settings, globalSettings, nodeId, helpers) => {
      const cycleTime = config.computeCycleTime
        ? config.computeCycleTime(settings, globalSettings, nodeId, helpers)
        : (config.cycleTime ?? 1);

      const power_consumption =
        typeof config.powerConsumption === 'function'
          ? config.powerConsumption(settings, globalSettings, nodeId, helpers)
          : config.powerConsumption;

      const power_type =
        typeof config.powerType === 'function'
          ? config.powerType(settings, globalSettings, nodeId, helpers)
          : config.powerType;

      const pollution =
        typeof config.pollution === 'function'
          ? config.pollution(settings, globalSettings, nodeId, helpers)
          : config.pollution;

      const inputs =
        typeof config.inputs === 'function'
          ? config.inputs(settings, globalSettings, nodeId, helpers)
          : config.inputs;

      const outputs =
        typeof config.outputs === 'function'
          ? config.outputs(settings, globalSettings, nodeId, helpers)
          : config.outputs;

      return {
        id: config.id,
        name: config.recipeName ?? config.name,
        machine_id: config.machineId,
        cycle_time: cycleTime,
        power_consumption,
        power_type,
        pollution,
        inputs,
        outputs,
        isSellTrash: config.isSellTrash,
      };
    },
    computeMachineCost: config.computeMachineCost,
    computeModelCount: config.computeModelCount,
  };
}
