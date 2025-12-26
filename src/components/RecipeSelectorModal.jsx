import React from 'react';
import { products, machines, getMachine } from '../data/dataLoader';
import { getProductName, formatIngredient } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';
import { getRecipesUsingProduct, getRecipesProducingProductFiltered, getRecipesForMachine } from '../utils/appUtilities';
import { DEFAULT_DRILL_RECIPE } from '../data/mineshaftDrill';
import { DEFAULT_LOGIC_ASSEMBLER_RECIPE } from '../data/logicAssembler';
import { DEFAULT_TREE_FARM_RECIPE } from '../data/treeFarm';
import { getSpecialRecipeInputs, getSpecialRecipeOutputs } from '../utils/recipeBoxCreation';
import { metricFormat } from '../utils/appUtilities';

const RecipeSelectorModal = ({
  selectedProduct,
  setSelectedProduct,
  selectedMachine,
  selectorMode,
  setSelectorMode,
  searchTerm,
  setSearchTerm,
  sortBy,
  setSortBy,
  filterType,
  setFilterType,
  recipeFilter,
  setRecipeFilter,
  favoriteRecipes,
  setFavoriteRecipes,
  recipeMachineCounts,
  autoConnectTarget,
  onClose,
  onSelectRecipe,
  onEditMachineCount
}) => {
  const filteredProducts = products
    .filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterType === 'all' || p.type === filterType)
    )
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price_asc') return (a.price === 'Variable' ? Infinity : a.price) - (b.price === 'Variable' ? Infinity : b.price);
      if (sortBy === 'price_desc') return (b.price === 'Variable' ? -Infinity : b.price) - (a.price === 'Variable' ? -Infinity : a.price);
      if (sortBy === 'rp_asc') return (a.rp_multiplier === 'Variable' ? Infinity : a.rp_multiplier) - (b.rp_multiplier === 'Variable' ? Infinity : b.rp_multiplier);
      return (b.rp_multiplier === 'Variable' ? -Infinity : b.rp_multiplier) - (a.rp_multiplier === 'Variable' ? -Infinity : a.rp_multiplier);
    });

  const filteredMachines = machines
    .filter(m =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler' || m.id === 'm_tree_farm' || getRecipesForMachine(m.id).length > 0)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleMachineSelect = (machine) => {
    if (machine.id === 'm_mineshaft_drill') {
      onSelectRecipe(DEFAULT_DRILL_RECIPE, 1);
    } else if (machine.id === 'm_logic_assembler') {
      onSelectRecipe(DEFAULT_LOGIC_ASSEMBLER_RECIPE, 1);
    } else if (machine.id === 'm_tree_farm') {
      onSelectRecipe(DEFAULT_TREE_FARM_RECIPE, 1);
    } else {
      selectedMachine(machine);
    }
  };

  const getAvailableRecipes = () => {
    if (!selectedProduct) return [];

    const producers = getRecipesProducingProductFiltered(selectedProduct.id);
    const consumers = getRecipesUsingProduct(selectedProduct.id);

    const specialRecipes = [DEFAULT_DRILL_RECIPE, DEFAULT_LOGIC_ASSEMBLER_RECIPE, DEFAULT_TREE_FARM_RECIPE];
    const specialProducers = specialRecipes.filter(sr =>
      getSpecialRecipeOutputs(sr.id).includes(selectedProduct.id)
    );
    const specialConsumers = specialRecipes.filter(sr =>
      getSpecialRecipeInputs(sr.id).includes(selectedProduct.id)
    );

    if (recipeFilter === 'producers') {
      return [...producers, ...specialProducers];
    }
    if (recipeFilter === 'consumers') {
      return [...consumers, ...specialConsumers];
    }

    return Array.from(new Map(
      [...producers, ...consumers, ...specialProducers, ...specialConsumers]
        .map(r => [r.id, r])
    ).values());
  };

  const availableRecipes = (selectorMode === 'product' ? getAvailableRecipes() : getRecipesForMachine(selectedMachine?.id))
    .sort((a, b) => {
      const aIsFavorite = favoriteRecipes.includes(a.id);
      const bIsFavorite = favoriteRecipes.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      const machineA = getMachine(a.machine_id);
      const machineB = getMachine(b.machine_id);
      return (machineA?.name || '').localeCompare(machineB?.name || '');
    });

  const toggleFavoriteRecipe = (recipeId) => {
    setFavoriteRecipes(prev =>
      prev.includes(recipeId) ? prev.filter(id => id !== recipeId) : [...prev, recipeId]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {selectedProduct ? `Recipes for ${selectedProduct.name}` : selectedMachine ? `Recipes for ${selectedMachine.name}` : 'Select Product or Machine'}
        </h2>
        {!selectedProduct && !selectedMachine ? (
          <>
            <div className="mb-lg">
              <div className="flex-row" style={{ gap: '10px', marginBottom: '15px' }}>
                <button
                  onClick={() => setSelectorMode('product')}
                  className={`btn ${selectorMode === 'product' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  By Products
                </button>
                <button
                  onClick={() => setSelectorMode('machine')}
                  className={`btn ${selectorMode === 'machine' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  By Machines
                </button>
              </div>
            </div>
            {selectorMode === 'product' ? (
              <>
                <div className="mb-lg flex-col">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                  />
                  <div className="flex-row">
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select">
                      <option value="all">All Types</option>
                      <option value="item">Items Only</option>
                      <option value="fluid">Fluids Only</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="select">
                      <option value="name_asc">Name ↑ (A-Z)</option>
                      <option value="name_desc">Name ↓ (Z-A)</option>
                      <option value="price_asc">Price ↑ (Low-High)</option>
                      <option value="price_desc">Price ↓ (High-Low)</option>
                      <option value="rp_asc">RP Mult ↑ (Low-High)</option>
                      <option value="rp_desc">RP Mult ↓ (High-Low)</option>
                    </select>
                  </div>
                </div>
                <div className="modal-content" style={{ maxHeight: '400px' }}>
                  <div className="product-table-header">
                    <div>Product</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">RP Mult</div>
                  </div>
                  {filteredProducts.map(product => (
                    <div key={product.id} onClick={() => setSelectedProduct(product)} className="product-row">
                      <div>
                        <div className="product-name">{product.name}</div>
                        <div className="product-type">{product.type === 'item' ? '📦 Item' : '💧 Fluid'}</div>
                      </div>
                      <div className="text-right" style={{ alignSelf: 'center' }}>
                        {product.price === 'Variable' ? 'Variable' : `${metricFormat(product.price)}`}
                      </div>
                      <div className="text-right" style={{ alignSelf: 'center' }}>
                        {product.rp_multiplier === 'Variable' ? 'Variable' : product.rp_multiplier >= 1000 ? `${metricFormat(product.rp_multiplier)}x` : `${product.rp_multiplier.toFixed(1)}x`}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="mb-lg">
                  <input
                    type="text"
                    placeholder="Search machines..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
                  {filteredMachines.length === 0 ? (
                    <div className="empty-state">No machines found</div>
                  ) : (
                    filteredMachines.map(machine => (
                      <div key={machine.id} onClick={() => handleMachineSelect(machine)} className="recipe-card" style={{ cursor: 'pointer' }}>
                        <div className="recipe-machine">{machine.name}</div>
                        <div className="recipe-details" style={{ color: '#999' }}>
                          {machine.id === 'm_mineshaft_drill' || machine.id === 'm_logic_assembler' || machine.id === 'm_tree_farm' ? 'Click to create box' : `${getRecipesForMachine(machine.id).length} recipe(s)`}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedProduct(null); selectedMachine(null); }} className="btn btn-secondary btn-back">
              ← Back
            </button>
            {selectedProduct && (
              <div className="mb-lg">
                <select value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value)} className="select">
                  <option value="all">All Recipes</option>
                  <option value="producers">Producers (Outputs {selectedProduct.name})</option>
                  <option value="consumers">Consumers (Uses {selectedProduct.name})</option>
                </select>
              </div>
            )}
            <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
              {availableRecipes.length === 0 ? (
                <div className="empty-state">No recipes found</div>
              ) : (
                availableRecipes.map(recipe => {
                  const machine = getMachine(recipe.machine_id);
                  const isFavorite = favoriteRecipes.includes(recipe.id);
                  const machineCount = recipeMachineCounts[recipe.id] ?? 1;
                  return machine && recipe.inputs && recipe.outputs ? (
                    <div key={recipe.id} className="recipe-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteRecipe(recipe.id); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '20px',
                          cursor: 'pointer',
                          padding: '4px',
                          lineHeight: 1,
                          filter: isFavorite ? 'none' : 'grayscale(100%)',
                          opacity: isFavorite ? 1 : 0.4,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = isFavorite ? '1' : '0.4'; }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        ⭐
                      </button>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditMachineCount(recipe);
                        }}
                        style={{
                          minWidth: '70px',
                          padding: '10px 12px',
                          background: autoConnectTarget && machineCount <= 0 ? 'var(--delete-bg)' : 'var(--color-primary)',
                          color: autoConnectTarget && machineCount <= 0 ? 'var(--delete-color)' : 'var(--color-primary-dark)',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 700,
                          fontSize: '18px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          userSelect: 'none',
                          border: autoConnectTarget && machineCount <= 0 ? '2px solid var(--delete-color)' : '2px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (autoConnectTarget && machineCount <= 0) {
                            e.currentTarget.style.background = 'var(--delete-hover-bg)';
                            e.currentTarget.style.color = 'var(--delete-hover-color)';
                          } else {
                            e.currentTarget.style.background = 'var(--color-primary-hover)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.borderColor = 'var(--color-primary-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (autoConnectTarget && machineCount <= 0) {
                            e.currentTarget.style.background = 'var(--delete-bg)';
                            e.currentTarget.style.color = 'var(--delete-color)';
                          } else {
                            e.currentTarget.style.background = 'var(--color-primary)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.borderColor = 'transparent';
                          }
                        }}
                        title={autoConnectTarget ? (machineCount <= 0 ? "Cannot create: machine count is 0" : `Click to edit before creating (${Number.isInteger(machineCount) ? machineCount : machineCount.toFixed(2)} calculated)`) : "Click to set machine count"}
                      >
                        {Number.isInteger(machineCount) ? machineCount : machineCount.toFixed(2)}
                      </div>
                      <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={(e) => {
                        e.stopPropagation();
                        onSelectRecipe(recipe);
                      }}>
                        <div className="recipe-machine">{machine.name}</div>
                        <div className="recipe-details">
                          <span className="recipe-label-input">Inputs: </span>
                          <span>{recipe.inputs.map(input => formatIngredient(input, getProduct)).join(', ')}</span>
                        </div>
                        <div className="recipe-details">
                          <span className="recipe-label-output">Outputs: </span>
                          <span>{recipe.outputs.map(output => formatIngredient(output, getProduct)).join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })
              )}
            </div>
          </>
        )}
        <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '20px' }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default RecipeSelectorModal;