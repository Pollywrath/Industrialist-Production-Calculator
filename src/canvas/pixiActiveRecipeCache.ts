import type { Recipe } from '../types/data';
import type { RecipeNodeType } from '../types/nodes';

export interface PixiRecipeResolutionHelpers {
  resolveProduct(side: 'input' | 'output', index: number): string;
  hasConnection(side: 'input' | 'output', index: number): boolean;
  getFlowRate(side: 'input' | 'output', index: number): number;
}

interface RecipeDependency {
  readonly method: keyof PixiRecipeResolutionHelpers;
  readonly side: 'input' | 'output';
  readonly index: number;
  readonly value: string | boolean | number;
}

interface CacheEntry {
  readonly nodeData: RecipeNodeType['data'];
  readonly globalSettings: Readonly<Record<string, unknown>>;
  readonly dataDbVersion: number;
  readonly inputTemperatures?: Readonly<Record<number, number>>;
  readonly dependencies: readonly RecipeDependency[];
  readonly recipe: Recipe;
}

export interface PixiActiveRecipeCacheInput {
  readonly node: RecipeNodeType;
  readonly globalSettings: Readonly<Record<string, unknown>>;
  readonly dataDbVersion: number;
  readonly inputTemperatures?: Readonly<Record<number, number>>;
  readonly createHelpers: () => PixiRecipeResolutionHelpers;
}

function sameInputTemperatures(
  left: Readonly<Record<number, number>> | undefined,
  right: Readonly<Record<number, number>> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[Number(key)] === right[Number(key)])
  );
}

function sameDependencies(entry: CacheEntry, helpers: PixiRecipeResolutionHelpers): boolean {
  return entry.dependencies.every(({ method, side, index, value }) =>
    Object.is(helpers[method](side, index), value),
  );
}

export function createPixiActiveRecipeCache() {
  const entries = new Map<string, CacheEntry>();
  return {
    get(
      input: PixiActiveRecipeCacheInput,
      resolve: (helpers: PixiRecipeResolutionHelpers) => Recipe | undefined,
    ): Recipe | undefined {
      const helpers = input.createHelpers();
      const cached = entries.get(input.node.id);
      if (
        cached &&
        cached.nodeData === input.node.data &&
        cached.globalSettings === input.globalSettings &&
        cached.dataDbVersion === input.dataDbVersion &&
        sameInputTemperatures(cached.inputTemperatures, input.inputTemperatures) &&
        sameDependencies(cached, helpers)
      ) {
        return cached.recipe;
      }

      const dependencies: RecipeDependency[] = [];
      const trackedHelpers: PixiRecipeResolutionHelpers = {
        resolveProduct: (side, index) => {
          const value = helpers.resolveProduct(side, index);
          dependencies.push({ method: 'resolveProduct', side, index, value });
          return value;
        },
        hasConnection: (side, index) => {
          const value = helpers.hasConnection(side, index);
          dependencies.push({ method: 'hasConnection', side, index, value });
          return value;
        },
        getFlowRate: (side, index) => {
          const value = helpers.getFlowRate(side, index);
          dependencies.push({ method: 'getFlowRate', side, index, value });
          return value;
        },
      };
      const recipe = resolve(trackedHelpers);
      if (recipe) {
        entries.set(input.node.id, {
          nodeData: input.node.data,
          globalSettings: input.globalSettings,
          dataDbVersion: input.dataDbVersion,
          inputTemperatures: input.inputTemperatures,
          dependencies,
          recipe,
        });
      } else {
        entries.delete(input.node.id);
      }
      return recipe;
    },
    retainNodeIds(nodeIds: ReadonlySet<string>) {
      for (const nodeId of entries.keys()) {
        if (!nodeIds.has(nodeId)) entries.delete(nodeId);
      }
    },
  };
}
