import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow, type Edge } from '@xyflow/react';
import {
  getAllRecipes,
  getRecipe,
  getMachineName,
  getProductName,
  getAllProducts,
  getAllMachines,
} from '../../../data/lookup';
import type { Recipe } from '../../../types/data';
import useControlStore from '../../../stores/useControlStore';
import useFlowStore from '../../../stores/useFlowStore';
import useFlowResultStore from '../../../stores/useFlowResultStore';
import { useShallow } from 'zustand/shallow';
import { nextNodeId, nextEdgeId } from '../../../utils/idGenerator';
import VirtualList from '../../shared/VirtualList';
import { cleanMachineCount } from '../../../utils/recipeComputation';
import ProductTab from './ProductTab';
import MachineTab from './MachineTab';
import RecipeCard from './RecipeCard';
import styles from './RecipeSelector.module.css';

const staticRecipes = getAllRecipes();
const staticMachines = getAllMachines();
const uniqueTiers = Array.from(new Set(staticMachines.map((m) => m.tier))).sort((a, b) => a - b);

function sortItems<T>(items: T[], field: keyof T, order: 'asc' | 'desc'): T[] {
  return [...items].sort((a, b) => {
    const valA = a[field];
    const valB = b[field];

    if (typeof valA === 'string' && typeof valB === 'string') {
      const strA = valA.toLowerCase();
      const strB = valB.toLowerCase();
      return order === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    }

    const numA = Number(valA || 0);
    const numB = Number(valB || 0);
    return order === 'asc' ? numA - numB : numB - numA;
  });
}

const FULL_CATEGORY_MAP: Record<string, string[]> = {
  Extractor: ['Fluid Extractor', 'Item Extractor'],
  Factory: [
    'Assembler',
    'Furnace',
    'Misc',
    'Molder',
    'Plant',
    'Processor',
    'Refinery',
    'Separator',
  ],
  Logic: ['Logic Gate', 'Logic Input', 'Logic Output', 'Miscellaneous'],
  Miscellaneous: ['Decoration', 'Depot', 'Other', 'Research'],
  Modular: ['Modular Diesel Engine', 'Modular Turbine', 'Tree Farm'],
  Power: [
    'Battery',
    'Large Power Plant',
    'Misc',
    'Non-Renewable',
    'Power Rate Calculator',
    'Renewable',
    'Transfer Pole',
  ],
  'Storage Silo': ['Fluid SIlo', 'Item Silo'],
};

const uniqueCategories = Object.keys(FULL_CATEGORY_MAP).sort();
const uniqueSubcategories = Array.from(new Set(Object.values(FULL_CATEGORY_MAP).flat())).sort();

export default function RecipeSelector() {
  const isRecipeSelectorOpen = useControlStore((s) => s.isRecipeSelectorOpen);
  if (!isRecipeSelectorOpen) return null;
  return <RecipeSelectorModal />;
}

function RecipeSelectorModal() {
  const setRecipeSelectorOpen = useControlStore((s) => s.setRecipeSelectorOpen);
  const preselectedProductId = useControlStore((s) => s.preselectedProductId);
  const preselectedSourceSide = useControlStore((s) => s.preselectedSourceSide);
  const preselectedNodeId = useControlStore((s) => s.preselectedNodeId);
  const preselectedHandleIndex = useControlStore((s) => s.preselectedHandleIndex);
  const rateMode = useControlStore((s) => s.rateMode);
  const preselectedNodeData = useFlowStore(
    useShallow((s) => {
      if (!preselectedNodeId) return null;
      const node = s.nodes.find((n) => n.id === preselectedNodeId);
      if (!node) return null;
      return {
        recipeId: node.data?.recipeId,
        machineCount: node.data?.machineCount,
      };
    }),
  );
  const { screenToFlowPosition } = useReactFlow();
  const [stage, setStage] = useState<'select' | 'recipes'>(() => {
    return preselectedProductId ? 'recipes' : 'select';
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return preselectedProductId || null;
  });
  const [activeTab, setActiveTab] = useState<'product' | 'machine'>(() => {
    return preselectedProductId ? 'product' : 'product';
  });
  const [search, setSearch] = useState('');
  const [productSortField, setProductSortField] = useState<'name' | 'sell_price' | 'rp_multiplier'>(
    'name',
  );
  const [productSortOrder, setProductSortOrder] = useState<'asc' | 'desc'>('asc');
  const [machineSortField, setMachineSortField] = useState<'name' | 'cost'>('name');
  const [machineSortOrder, setMachineSortOrder] = useState<'asc' | 'desc'>('asc');
  const [productTypeFilter, setProductTypeFilter] = useState<'All' | 'Item' | 'Fluid'>('All');
  const [machineTierFilter, setMachineTierFilter] = useState<string>('All');
  const [machineCategoryFilter, setMachineCategoryFilter] = useState<string>('All');
  const [machineSubcategoryFilter, setMachineSubcategoryFilter] = useState<string>('All');

  const availableSubcategories =
    machineCategoryFilter === 'All'
      ? uniqueSubcategories
      : (FULL_CATEGORY_MAP[machineCategoryFilter] || []).slice().sort();
  const [filterProducers, setFilterProducers] = useState(() => {
    if (preselectedProductId && preselectedSourceSide) {
      return preselectedSourceSide === 'input';
    }
    return true;
  });
  const [filterConsumers, setFilterConsumers] = useState(() => {
    if (preselectedProductId && preselectedSourceSide) {
      return preselectedSourceSide === 'output';
    }
    return true;
  });
  const [filterSellTrash, setFilterSellTrash] = useState(() => {
    if (preselectedProductId && preselectedSourceSide) {
      return false;
    }
    return true;
  });
  const [filterHeatPower, setFilterHeatPower] = useState(() => {
    if (preselectedProductId && preselectedSourceSide) {
      return false;
    }
    return true;
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const recipes = staticRecipes;

  useEffect(() => {
    if (inputRef.current && stage === 'select') {
      inputRef.current.focus();
    }
  }, [activeTab, stage]);

  let filteredProducts: ReturnType<typeof getAllProducts> = [];
  if (activeTab === 'product') {
    let list = getAllProducts();

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }

    if (productTypeFilter !== 'All') {
      list = list.filter((p) => p.type === productTypeFilter);
    }

    filteredProducts = sortItems(list, productSortField, productSortOrder);
  }

  let filteredMachines: ReturnType<typeof getAllMachines> = [];
  if (activeTab === 'machine') {
    let list = getAllMachines();

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((m) => m.name.toLowerCase().includes(q));
    }

    if (machineTierFilter !== 'All') {
      const tNum = parseInt(machineTierFilter, 10);
      list = list.filter((m) => m.tier === tNum);
    }
    if (machineCategoryFilter !== 'All') {
      list = list.filter((m) => m.category === machineCategoryFilter);
    }

    if (machineSubcategoryFilter !== 'All') {
      list = list.filter((m) => m.subcategory === machineSubcategoryFilter);
    }
    filteredMachines = sortItems(list, machineSortField, machineSortOrder);
  }

  const handleProductSort = (field: 'name' | 'sell_price' | 'rp_multiplier') => {
    if (productSortField === field) {
      setProductSortOrder(productSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setProductSortField(field);
      setProductSortOrder('asc');
    }
  };

  const handleMachineSort = (field: 'name' | 'cost') => {
    if (machineSortField === field) {
      setMachineSortOrder(machineSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setMachineSortField(field);
      setMachineSortOrder('asc');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setStage('recipes');
    setFilterProducers(true);
    setFilterConsumers(true);
    setFilterSellTrash(true);
    setFilterHeatPower(true);
  };

  const handleBack = () => {
    setStage('select');
    setSelectedId(null);
  };

  let matchingRecipes: Recipe[] = [];
  if (selectedId && stage === 'recipes') {
    if (activeTab === 'product') {
      matchingRecipes = recipes.filter((r) => {
        const matchesProducer =
          filterProducers && r.outputs.some((out) => out.product_id === selectedId);
        const matchesConsumer =
          filterConsumers && r.inputs.some((inp) => inp.product_id === selectedId);
        return matchesProducer || matchesConsumer;
      });
    } else {
      matchingRecipes = recipes.filter((r) => r.machine_id === selectedId);
    }
  }

  let clickedRateInfo: { clickedPerSecondRate: number } | null = null;
  if (
    preselectedNodeId &&
    preselectedSourceSide &&
    preselectedProductId &&
    preselectedHandleIndex !== null &&
    preselectedNodeData
  ) {
    const existingRecipe = preselectedNodeData.recipeId
      ? getRecipe(preselectedNodeData.recipeId)
      : null;
    if (existingRecipe) {
      const existingMachineCount = preselectedNodeData.machineCount ?? 1;
      const list =
        preselectedSourceSide === 'input' ? existingRecipe.inputs : existingRecipe.outputs;
      const entry = list[preselectedHandleIndex];
      if (entry && entry.product_id === preselectedProductId) {
        const clickedBaseQty = entry.quantity;
        const flowResults = useFlowResultStore.getState().results;
        const nodeFlows = flowResults.get(preselectedNodeId);
        const listFlows =
          preselectedSourceSide === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
        const flowStatus = listFlows?.[preselectedHandleIndex];

        const clickedPerSecondRate = flowStatus
          ? Math.max(0, flowStatus.rate - flowStatus.connected)
          : (clickedBaseQty / existingRecipe.cycle_time) * existingMachineCount;

        clickedRateInfo = { clickedPerSecondRate };
      }
    }
  }

  const handleAddRecipe = (recipeId: string) => {
    const recipe = getRecipe(recipeId);
    if (!recipe) return;

    const newNodeId = nextNodeId();
    const inputOrder = recipe.inputs.map((_, i) => i);
    const outputOrder = recipe.outputs.map((_, i) => i);

    const flowStore = useFlowStore.getState();

    const matchingInputIndex = preselectedProductId
      ? recipe.inputs.findIndex((inp) => inp.product_id === preselectedProductId)
      : -1;
    const matchingOutputIndex = preselectedProductId
      ? recipe.outputs.findIndex((out) => out.product_id === preselectedProductId)
      : -1;

    let targetX = 0;
    let targetY = 0;
    let shouldAutoConnect = false;
    let autoEdge: Edge | null = null;
    let calculatedMachineCount = 1;

    if (preselectedNodeId) {
      const existingNode = flowStore.nodes.find((n) => n.id === preselectedNodeId);
      if (existingNode) {
        const existingRecipe = existingNode.data?.recipeId
          ? getRecipe(existingNode.data.recipeId)
          : null;
        const existingMachineCount = existingNode.data?.machineCount ?? 1;

        if (
          existingRecipe &&
          preselectedSourceSide &&
          preselectedProductId &&
          preselectedHandleIndex !== null
        ) {
          const list =
            preselectedSourceSide === 'input' ? existingRecipe.inputs : existingRecipe.outputs;
          const entry = list[preselectedHandleIndex];
          if (entry && entry.product_id === preselectedProductId) {
            const clickedBaseQty = entry.quantity;
            const flowResults = useFlowResultStore.getState().results;
            const nodeFlows = flowResults.get(preselectedNodeId);
            const listFlows =
              preselectedSourceSide === 'input' ? nodeFlows?.inputFlows : nodeFlows?.outputFlows;
            const flowStatus = listFlows?.[preselectedHandleIndex];

            const clickedPerSecondRate = flowStatus
              ? Math.max(0, flowStatus.rate - flowStatus.connected)
              : (clickedBaseQty / existingRecipe.cycle_time) * existingMachineCount;

            const targetIndex =
              preselectedSourceSide === 'input' ? matchingOutputIndex : matchingInputIndex;
            if (targetIndex !== -1) {
              const targetList = preselectedSourceSide === 'input' ? recipe.outputs : recipe.inputs;
              const targetEntry = targetList[targetIndex];
              const candidateBaseQty = targetEntry.quantity;
              if (candidateBaseQty > 0) {
                calculatedMachineCount = cleanMachineCount(
                  (clickedPerSecondRate * recipe.cycle_time) / candidateBaseQty,
                );
              }
            }
          }
        }

        if (preselectedSourceSide === 'input') {
          targetX = existingNode.position.x - 376 - 150;
          targetY = existingNode.position.y;

          if (matchingOutputIndex !== -1) {
            shouldAutoConnect = true;
            autoEdge = {
              id: nextEdgeId(),
              source: newNodeId,
              sourceHandle: `${newNodeId}-output-${matchingOutputIndex}`,
              target: preselectedNodeId,
              targetHandle: `${preselectedNodeId}-input-${preselectedHandleIndex}`,
            };
          }
        } else if (preselectedSourceSide === 'output') {
          targetX = existingNode.position.x + 376 + 150;
          targetY = existingNode.position.y;

          if (matchingInputIndex !== -1) {
            shouldAutoConnect = true;
            autoEdge = {
              id: nextEdgeId(),
              source: preselectedNodeId,
              sourceHandle: `${preselectedNodeId}-output-${preselectedHandleIndex}`,
              target: newNodeId,
              targetHandle: `${newNodeId}-input-${matchingInputIndex}`,
            };
          }
        }
      } else {
        const center = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        targetX = center.x - 188;
        targetY = center.y - 50;
      }
    } else {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      targetX = center.x - 188;
      targetY = center.y - 50;
    }

    const cleanNodes = flowStore.nodes.map((n) => ({
      ...n,
      selected: false,
    }));

    const maxZ = cleanNodes.reduce((max, node) => Math.max(max, node.zIndex ?? 0), 0);

    const snappedX = Math.round(targetX / 19) * 19;
    const snappedY = Math.round(targetY / 13) * 13;

    const newNode = {
      id: newNodeId,
      type: 'recipe',
      position: { x: snappedX, y: snappedY },
      zIndex: maxZ + 1,
      selected: true,
      data: {
        recipeId,
        machineCount: calculatedMachineCount,
        inputOrder,
        outputOrder,
      },
    };

    flowStore.setNodes([...cleanNodes, newNode]);
    if (shouldAutoConnect && autoEdge) {
      flowStore.setEdges([...flowStore.edges, autoEdge]);
    }
    setRecipeSelectorOpen(false);
  };

  return createPortal(
    <div className={styles['recipe-selector-overlay']} onClick={() => setRecipeSelectorOpen(false)}>
      <div className={styles['recipe-selector-modal']} onClick={(e) => e.stopPropagation()}>
        {stage === 'select' ? (
          <>
            <div className={styles['recipe-selector-header']}>
              <div className={styles['recipe-selector-tabs']}>
                <button
                  className={`${styles['recipe-selector-tab']} ${activeTab === 'product' ? styles['is-active'] : ''}`}
                  onClick={() => {
                    setActiveTab('product');
                    setSearch('');
                  }}
                >
                  Search by Product
                </button>
                <button
                  className={`${styles['recipe-selector-tab']} ${activeTab === 'machine' ? styles['is-active'] : ''}`}
                  onClick={() => {
                    setActiveTab('machine');
                    setSearch('');
                  }}
                >
                  Search by Machine
                </button>
              </div>
              <button
                className={styles['recipe-selector-close']}
                onClick={() => setRecipeSelectorOpen(false)}
              >
                ✕
              </button>
            </div>

            {activeTab === 'product' ? (
              <div className={styles['recipe-selector-filter-row']}>
                <div className={styles['recipe-selector-search-box-stage1']}>
                  <input
                    ref={inputRef}
                    type="text"
                    className={styles['recipe-selector-input']}
                    placeholder="Search products by name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className={styles['recipe-selector-search-clear']}
                      onClick={() => setSearch('')}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className={styles['recipe-selector-dropdown-group']}>
                  <label className={styles['recipe-selector-filter-label']}>Type:</label>
                  <select
                    className={styles['recipe-selector-select']}
                    value={productTypeFilter}
                    onChange={(e) =>
                      setProductTypeFilter(e.target.value as 'All' | 'Item' | 'Fluid')
                    }
                  >
                    <option value="All">All Types</option>
                    <option value="Item">Item</option>
                    <option value="Fluid">Fluid</option>
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className={styles['recipe-selector-filter-row']}>
                  <div className={styles['recipe-selector-search-box-stage1']}>
                    <input
                      ref={inputRef}
                      type="text"
                      className={styles['recipe-selector-input']}
                      placeholder="Search machines by name..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className={styles['recipe-selector-search-clear']}
                        onClick={() => setSearch('')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={`${styles['recipe-selector-filter-row']} ${styles['secondary-filter-row']}`}
                >
                  <div className={styles['recipe-selector-select-wrapper']}>
                    <label className={styles['recipe-selector-filter-label']}>Tier:</label>
                    <select
                      className={styles['recipe-selector-select']}
                      value={machineTierFilter}
                      onChange={(e) => setMachineTierFilter(e.target.value)}
                    >
                      <option value="All">All Tiers</option>
                      {uniqueTiers.map((t) => (
                        <option key={t} value={t}>
                          Tier {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles['recipe-selector-select-wrapper']}>
                    <label className={styles['recipe-selector-filter-label']}>Category:</label>
                    <select
                      className={styles['recipe-selector-select']}
                      value={machineCategoryFilter}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setMachineCategoryFilter(newCat);
                        if (newCat !== 'All') {
                          const allowedSubs = FULL_CATEGORY_MAP[newCat] || [];
                          const subsSet = new Set(allowedSubs);
                          if (!subsSet.has(machineSubcategoryFilter)) {
                            setMachineSubcategoryFilter('All');
                          }
                        }
                      }}
                    >
                      <option value="All">All Categories</option>
                      {uniqueCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={styles['recipe-selector-select-wrapper']}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <label className={styles['recipe-selector-filter-label']}>Subcategory:</label>
                    <select
                      className={styles['recipe-selector-select']}
                      value={machineSubcategoryFilter}
                      onChange={(e) => setMachineSubcategoryFilter(e.target.value)}
                    >
                      <option value="All">All Subcategories</option>
                      {availableSubcategories.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className={styles['recipe-selector-table-container']}>
              {activeTab === 'product' ? (
                <ProductTab
                  filteredProducts={filteredProducts}
                  productSortField={productSortField}
                  productSortOrder={productSortOrder}
                  onProductSort={handleProductSort}
                  onSelectItem={handleSelectItem}
                />
              ) : (
                <MachineTab
                  filteredMachines={filteredMachines}
                  machineSortField={machineSortField}
                  machineSortOrder={machineSortOrder}
                  onMachineSort={handleMachineSort}
                  onSelectItem={handleSelectItem}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className={styles['recipe-selector-header']}>
              <div className={styles['recipe-selector-back-nav']}>
                <button className={styles['recipe-selector-back-btn']} onClick={handleBack}>
                  ← Back to {activeTab === 'product' ? 'Products' : 'Machines'}
                </button>
                <span className={styles['recipe-selector-selected-heading']}>
                  {selectedId
                    ? activeTab === 'product'
                      ? getProductName(selectedId)
                      : getMachineName(selectedId)
                    : ''}{' '}
                  Recipes
                </span>
              </div>
              <button
                className={styles['recipe-selector-close']}
                onClick={() => setRecipeSelectorOpen(false)}
              >
                ✕
              </button>
            </div>

            {activeTab === 'product' && (
              <div className={styles['recipe-selector-phase2-filters']}>
                <button
                  className={`${styles['recipe-selector-filter-btn']} ${filterProducers ? styles['is-active'] : ''}`}
                  onClick={() => setFilterProducers(!filterProducers)}
                >
                  <span className={`${styles['filter-btn-dot']} ${styles['producer']}`} />
                  Producer
                </button>
                <button
                  className={`${styles['recipe-selector-filter-btn']} ${filterConsumers ? styles['is-active'] : ''}`}
                  onClick={() => setFilterConsumers(!filterConsumers)}
                >
                  <span className={`${styles['filter-btn-dot']} ${styles['consumer']}`} />
                  Consumer
                </button>
                <button
                  className={`${styles['recipe-selector-filter-btn']} ${filterSellTrash ? styles['is-active'] : ''}`}
                  onClick={() => setFilterSellTrash(!filterSellTrash)}
                >
                  <span className={`${styles['filter-btn-dot']} ${styles['sell']}`} />
                  Sell/Trash
                </button>
                <button
                  className={`${styles['recipe-selector-filter-btn']} ${filterHeatPower ? styles['is-active'] : ''}`}
                  onClick={() => setFilterHeatPower(!filterHeatPower)}
                >
                  <span className={`${styles['filter-btn-dot']} ${styles['heat']}`} />
                  Heat/Power
                </button>
              </div>
            )}

            <div
              className={styles['recipe-selector-content']}
              style={{ padding: '20px 20px 0 20px', overflow: 'hidden' }}
            >
              {matchingRecipes.length === 0 ? (
                <div className={styles['recipe-selector-empty']}>No recipes found.</div>
              ) : (
                <VirtualList
                  items={matchingRecipes}
                  itemHeight={130}
                  height={activeTab === 'product' ? 488 : 540}
                  overscan={5}
                >
                  {(recipe) => (
                    <RecipeCard
                      recipe={recipe}
                      rateMode={rateMode}
                      clickedRateInfo={clickedRateInfo}
                      preselectedSourceSide={preselectedSourceSide}
                      preselectedProductId={preselectedProductId}
                      onAddRecipe={handleAddRecipe}
                    />
                  )}
                </VirtualList>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
