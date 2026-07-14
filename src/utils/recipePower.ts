import type { PowerType, Recipe, RecipePowerEffect } from '../types/data';
import { formatPower } from './unitFormatting';

export interface RecipePowerTotals {
  use: number;
  output: number;
  net: number;
  mvUse: number;
  mvOutput: number;
  hvUse: number;
  hvOutput: number;
}

export function getRecipePowerEffects(recipe: Recipe): RecipePowerEffect[] {
  if (Array.isArray(recipe.powerEffects) && recipe.powerEffects.length > 0) {
    return recipe.powerEffects;
  }

  return [
    {
      power_type: recipe.power_type,
      power_use: recipe.power_use,
    },
  ];
}

export function getRecipePowerAccountingEffects(recipe: Recipe): RecipePowerEffect[] {
  if (Array.isArray(recipe.powerAccountingEffects) && recipe.powerAccountingEffects.length > 0) {
    return recipe.powerAccountingEffects;
  }

  return getRecipePowerEffects(recipe);
}

export function getRecipePowerTotals(recipe: Recipe, machineCount = 1): RecipePowerTotals {
  const effects = getRecipePowerAccountingEffects(recipe);
  let use = 0;
  let output = 0;
  let net = 0;
  let mvUse = 0;
  let mvOutput = 0;
  let hvUse = 0;
  let hvOutput = 0;

  const actualMachineCount = recipe.powerIndependentOfMachineCount ? 1 : machineCount;

  for (let i = 0; i < effects.length; i++) {
    const power = effects[i].power_use * actualMachineCount;
    net += power;
    if (effects[i].accounting === 'output_delta') {
      output += power;
      if (effects[i].power_type === 'HV') hvOutput += power;
      else mvOutput += power;
    } else if (power > 0) {
      use += power;
      if (effects[i].power_type === 'HV') hvUse += power;
      else mvUse += power;
    } else if (power < 0) {
      output += Math.abs(power);
      if (effects[i].power_type === 'HV') hvOutput += Math.abs(power);
      else mvOutput += Math.abs(power);
    }
  }

  return {
    use,
    output,
    net,
    mvUse,
    mvOutput,
    hvUse,
    hvOutput,
  };
}

export function getRecipeNetPower(recipe: Recipe): number {
  return getRecipePowerTotals(recipe).net;
}

export function hasRecipePowerOutput(recipe: Recipe): boolean {
  return getRecipePowerEffects(recipe).some((effect) => effect.power_use < 0);
}

function formatEffect(effect: RecipePowerEffect, machineCount: number): string {
  const powerText = formatPower(effect.power_use * machineCount);
  return effect.power_type === 'HV' ? `${powerText} HV` : powerText;
}

function groupEffects(
  effects: RecipePowerEffect[],
  predicate: (effect: RecipePowerEffect) => boolean,
): RecipePowerEffect[] {
  return effects.filter((effect) => predicate(effect) && effect.power_use !== 0);
}

export function formatRecipePowerLine(recipe: Recipe, machineCount = 1): string {
  const actualMachineCount = recipe.powerIndependentOfMachineCount ? 1 : machineCount;
  const effects = getRecipePowerEffects(recipe).filter((effect) => effect.power_use !== 0);

  if (effects.length === 0) {
    return formatPower(0);
  }

  if (effects.length === 1) {
    const effect = effects[0];
    const powerText = formatPower(effect.power_use * actualMachineCount);
    return effect.power_type === 'HV' ? `${powerText} HV` : powerText;
  }

  const uses = groupEffects(effects, (effect) => effect.power_use > 0);
  const outputs = groupEffects(effects, (effect) => effect.power_use < 0);

  if (uses.length === 1 && outputs.length === 1) {
    return `${formatEffect(uses[0], actualMachineCount)} > ${formatEffect(outputs[0], actualMachineCount)}`;
  }

  if (uses.length === 0 && outputs.length > 0) {
    return outputs.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  }

  if (outputs.length === 0 && uses.length > 0) {
    return uses.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  }

  const useText = uses.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  const outputText = outputs.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  return `Uses ${useText} | Outputs ${outputText}`;
}

export function estimatePowerModelCount(recipe: Recipe): number {
  const effects = getRecipePowerEffects(recipe);
  let modelCount = 0;

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.power_use === 0) continue;
    if (effect.power_type === 'HV') {
      modelCount += 2;
    } else if (effect.power_type === 'MV') {
      modelCount += Math.ceil(Math.abs(effect.power_use) / 1500000) * 2;
    }
  }

  return modelCount;
}

export function getPowerTypeForDirection(direction: 'mv_to_hv' | 'hv_to_mv'): {
  inputType: PowerType;
  outputType: PowerType;
} {
  return direction === 'mv_to_hv'
    ? { inputType: 'MV', outputType: 'HV' }
    : { inputType: 'HV', outputType: 'MV' };
}
