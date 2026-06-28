import type { PowerType, Recipe, RecipePowerEffect } from '../types/data';
import { formatPower } from './unitFormatting';

export interface RecipePowerTotals {
  consumption: number;
  production: number;
  net: number;
}

export function getRecipePowerEffects(recipe: Recipe): RecipePowerEffect[] {
  if (Array.isArray(recipe.powerEffects) && recipe.powerEffects.length > 0) {
    return recipe.powerEffects;
  }

  return [
    {
      power_type: recipe.power_type,
      power_consumption: recipe.power_consumption,
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
  let consumption = 0;
  let production = 0;
  let net = 0;

  const actualMachineCount = recipe.powerIndependentOfMachineCount ? 1 : machineCount;

  for (let i = 0; i < effects.length; i++) {
    const power = effects[i].power_consumption * actualMachineCount;
    net += power;
    if (effects[i].accounting === 'production_delta') {
      production += power;
    } else if (power > 0) {
      consumption += power;
    } else if (power < 0) {
      production += Math.abs(power);
    }
  }

  return { consumption, production, net };
}

export function getRecipeNetPower(recipe: Recipe): number {
  return getRecipePowerTotals(recipe).net;
}

export function hasRecipePowerProduction(recipe: Recipe): boolean {
  return getRecipePowerEffects(recipe).some((effect) => effect.power_consumption < 0);
}

function formatEffect(effect: RecipePowerEffect, machineCount: number): string {
  const powerText = formatPower(effect.power_consumption * machineCount);
  return effect.power_type === 'HV' ? `${powerText} HV` : powerText;
}

function groupEffects(effects: RecipePowerEffect[], predicate: (effect: RecipePowerEffect) => boolean): RecipePowerEffect[] {
  return effects.filter((effect) => predicate(effect) && effect.power_consumption !== 0);
}

export function formatRecipePowerLine(recipe: Recipe, machineCount = 1): string {
  const actualMachineCount = recipe.powerIndependentOfMachineCount ? 1 : machineCount;
  const effects = getRecipePowerEffects(recipe).filter((effect) => effect.power_consumption !== 0);

  if (effects.length === 0) {
    return formatPower(0);
  }

  if (effects.length === 1) {
    const effect = effects[0];
    const powerText = formatPower(effect.power_consumption * actualMachineCount);
    return effect.power_type === 'HV' ? `${powerText} HV` : powerText;
  }

  const consumers = groupEffects(effects, (effect) => effect.power_consumption > 0);
  const producers = groupEffects(effects, (effect) => effect.power_consumption < 0);

  if (consumers.length === 1 && producers.length === 1) {
    return `${formatEffect(consumers[0], actualMachineCount)} > ${formatEffect(producers[0], actualMachineCount)}`;
  }

  if (consumers.length === 0 && producers.length > 0) {
    return producers.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  }

  if (producers.length === 0 && consumers.length > 0) {
    return consumers.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  }

  const consumeText = consumers.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  const produceText = producers.map((effect) => formatEffect(effect, actualMachineCount)).join(' + ');
  return `Consumes ${consumeText} | Produces ${produceText}`;
}

export function estimatePowerModelCount(recipe: Recipe): number {
  const effects = getRecipePowerEffects(recipe);
  let modelCount = 0;

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.power_consumption === 0) continue;
    if (effect.power_type === 'HV') {
      modelCount += 2;
    } else if (effect.power_type === 'MV') {
      modelCount += Math.ceil(Math.abs(effect.power_consumption) / 1500000) * 2;
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
