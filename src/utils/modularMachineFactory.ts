import type { Machine } from '../types/data';
import { getSpecialRecipe } from '../data/registry';

export function createVirtualModularMachine(
  subcategory: string,
  componentMachines: Machine[],
  defaultRecipeCost: number,
): Machine {
  const tier = componentMachines[0]?.tier ?? 1;
  const research = componentMachines.map((m) => m.research).find((r) => r !== '') ?? '';

  return {
    id: `m_${subcategory.toLowerCase().replace(/\s+/g, '_')}`,
    name: subcategory,
    cost: defaultRecipeCost,
    tier,
    size: { x: 0, y: 0 },
    variant: 'none',
    limited: false,
    research,
    category: 'Modular',
    subcategory,
  };
}

export function validateModularConsistency(
  machines: Machine[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const modularMachines = machines.filter((m) => m.category === 'Modular');

  const subcategoryGroups = new Map<string, Machine[]>();
  for (const machine of modularMachines) {
    if (!subcategoryGroups.has(machine.subcategory)) {
      subcategoryGroups.set(machine.subcategory, []);
    }
    subcategoryGroups.get(machine.subcategory)!.push(machine);
  }

  for (const [subcategory, group] of subcategoryGroups) {
    if (group.length === 0) continue;

    const firstTier = group[0].tier;
    const nonBlankResearches = group.map((m) => m.research).filter((r) => r !== '');
    const expectedResearch = nonBlankResearches[0] ?? '';

    for (let i = 1; i < group.length; i++) {
      if (group[i].tier !== firstTier) {
        errors.push(
          `Modular subcategory "${subcategory}" has inconsistent tiers: machine "${group[i].id}" has tier ${group[i].tier} but expected ${firstTier}`,
        );
      }
    }

    for (const machine of group) {
      if (machine.research !== '' && machine.research !== expectedResearch) {
        errors.push(
          `Modular subcategory "${subcategory}" has inconsistent research: machine "${machine.id}" has research "${machine.research}" but expected "${expectedResearch}" or to be blank`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildVirtualModularMachines(machines: Machine[]): Machine[] {
  const modularSubcategories = ['Modular Diesel Engine', 'Modular Turbine', 'Tree Farm'];
  const modularComponents = machines.filter((m) => m.category === 'Modular');

  return modularSubcategories.map((subcategory) => {
    const componentMachines = modularComponents.filter((m) => m.subcategory === subcategory);
    const virtualMachineId = `m_${subcategory.toLowerCase().replace(/\s+/g, '_')}`;
    const specialRecipeId = virtualMachineId.replace('m_', 'r_') + '_01';
    const specialRecipe = getSpecialRecipe(specialRecipeId);
    const defaultRecipeCost = specialRecipe?.computeMachineCost
      ? specialRecipe.computeMachineCost(
          Object.entries(specialRecipe.settings).reduce(
            (acc, [key, definition]) => {
              acc[key] = definition.default;
              return acc;
            },
            {} as Record<string, unknown>,
          ),
        )
      : 0;

    return createVirtualModularMachine(subcategory, componentMachines, defaultRecipeCost);
  });
}
