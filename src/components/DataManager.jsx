import React, { useState, useEffect, useRef } from 'react';
import RecipeEditor from './RecipeEditor';
import { 
  getCustomProducts, 
  getCustomMachines, 
  getCustomRecipes,
  updateProduct,
  updateMachine,
  updateRecipe,
  exportData,
  importData,
  restoreDefaultProducts,
  restoreDefaultMachines,
  restoreDefaultRecipes
} from '../utils/dataUtilities';

const DataManager = ({ onClose, defaultProducts, defaultMachines, defaultRecipes, onDataChange }) => {
  const [activeTab, setActiveTab] = useState('products');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportProducts, setExportProducts] = useState(true);
  const [exportMachines, setExportMachines] = useState(true);
  const [exportRecipes, setExportRecipes] = useState(true);
  const fileInputRef = useRef(null);

  const handleExport = () => {
    const data = exportData(exportProducts, exportMachines, exportRecipes);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const processImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const results = importData(imported);
        
        let message = 'Import complete:\n';
        if (results.products > 0) message += `- ${results.products} products imported/updated\n`;
        if (results.machines > 0) message += `- ${results.machines} machines imported/updated\n`;
        if (results.recipes > 0) message += `- ${results.recipes} recipes imported/updated\n`;
        if (results.errors.length > 0) message += `\nErrors: ${results.errors.join(', ')}`;
        
        alert(message);
        onDataChange();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '750px', maxWidth: '95vw', maxHeight: '90vh' }}>
        <h2 className="modal-title">Data Manager</h2>

        {/* Import/Export Section */}
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          background: 'var(--bg-main)', 
          borderRadius: 'var(--radius-md)', 
          border: '2px solid var(--border-divider)' 
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
            Import/Export Data
          </h3>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={exportProducts} onChange={(e) => setExportProducts(e.target.checked)} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
                Products
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={exportMachines} onChange={(e) => setExportMachines(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
                Machines
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={exportRecipes} onChange={(e) => setExportRecipes(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />
                Recipes
              </label>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleImport} className="btn btn-secondary">Import JSON</button>
              <button onClick={handleExport} className="btn btn-primary">Export Data</button>
            </div>
          </div>
          
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={processImport} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '2px solid var(--border-divider)' }}>
          <button
            onClick={() => setActiveTab('products')}
            className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('machines')}
            className={`btn ${activeTab === 'machines' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
          >
            Machines
          </button>
          <button
            onClick={() => setActiveTab('recipes')}
            className={`btn ${activeTab === 'recipes' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }}
          >
            Recipes
          </button>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
          />
        </div>

        {/* Tab Content */}
        <div className="modal-content" style={{ maxHeight: 'calc(90vh - 400px)', overflowY: 'auto' }}>
          {activeTab === 'products' && (
            <ProductsTab 
              searchTerm={searchTerm} 
              defaultProducts={defaultProducts}
              onDataChange={onDataChange}
            />
          )}
          {activeTab === 'machines' && (
            <MachinesTab 
              searchTerm={searchTerm} 
              defaultMachines={defaultMachines}
              onDataChange={onDataChange}
            />
          )}
          {activeTab === 'recipes' && (
            <RecipesTab 
              searchTerm={searchTerm} 
              defaultRecipes={defaultRecipes}
              defaultMachines={defaultMachines}
              defaultProducts={defaultProducts}
              onDataChange={onDataChange}
            />
          )}
        </div>

        <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '20px', width: '100%' }}>
          Close
        </button>
      </div>
    </div>
  );
};

// Products Tab Component
const ProductsTab = ({ searchTerm, defaultProducts, onDataChange }) => {
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = () => {
    setProducts(getCustomProducts());
  };

  const filteredProducts = products
    .filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditValues({
      price: product.price === 'Variable' ? '' : product.price,
      rp_multiplier: product.rp_multiplier === 'Variable' ? '' : product.rp_multiplier,
      type: product.type
    });
  };

  const saveEdit = (productId) => {
    const updates = {
      price: editValues.price === '' ? 'Variable' : parseFloat(editValues.price),
      rp_multiplier: editValues.rp_multiplier === '' ? 'Variable' : parseFloat(editValues.rp_multiplier),
      type: editValues.type
    };

    if (updateProduct(productId, updates)) {
      loadProducts();
      onDataChange();
      setEditingId(null);
    } else {
      alert('Failed to update product');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const resetToDefault = (productId) => {
    console.log('Reset clicked for product:', productId);
    const defaultProduct = defaultProducts.find(p => p.id === productId);
    console.log('Default product found:', defaultProduct);
    
    if (!defaultProduct) {
      alert('Default product not found');
      return;
    }
    
    // Get current product to compare
    const currentProduct = products.find(p => p.id === productId);
    console.log('Current product:', currentProduct);
    
    // Reset all editable fields to default values
    const updates = {
      price: defaultProduct.price,
      rp_multiplier: defaultProduct.rp_multiplier,
      type: defaultProduct.type
    };
    
    console.log('Updates to apply:', updates);
    
    const success = updateProduct(productId, updates);
    console.log('Update result:', success);
    
    if (success) {
      loadProducts();
      onDataChange();
      console.log('Reset complete, reloaded products');
    } else {
      alert('Failed to reset product to default');
    }
  };

  return (
    <div>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 80px 100px 100px 90px',
        gap: '8px',
        padding: '10px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--text-primary)',
        marginBottom: '10px'
      }}>
        <div>Product Name</div>
        <div>Type</div>
        <div>Price</div>
        <div>RP Mult</div>
        <div>Actions</div>
      </div>

      {filteredProducts.map(product => (
        <div key={product.id} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 100px 100px 90px',
          gap: '8px',
          padding: '10px',
          background: 'var(--bg-main)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '8px',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{product.name}</div>
          
          {editingId === product.id ? (
            <>
              <select
                value={editValues.type}
                onChange={(e) => setEditValues({ ...editValues, type: e.target.value })}
                className="select"
                style={{ padding: '6px', fontSize: '12px' }}
              >
                <option value="item">Item</option>
                <option value="fluid">Fluid</option>
              </select>
              <input
                type="number"
                value={editValues.price}
                onChange={(e) => setEditValues({ ...editValues, price: e.target.value })}
                placeholder="Variable"
                className="input"
                style={{ padding: '6px', fontSize: '12px' }}
                disabled={product.price === 'Variable'}
                title={product.price === 'Variable' ? 'Cannot edit Variable values' : ''}
              />
              <input
                type="number"
                value={editValues.rp_multiplier}
                onChange={(e) => setEditValues({ ...editValues, rp_multiplier: e.target.value })}
                placeholder="Variable"
                className="input"
                style={{ padding: '6px', fontSize: '12px' }}
                disabled={product.rp_multiplier === 'Variable'}
                title={product.rp_multiplier === 'Variable' ? 'Cannot edit Variable values' : ''}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => saveEdit(product.id)} className="btn btn-primary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Save">
                  ✓
                </button>
                <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Cancel">
                  ✗
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--text-secondary)' }}>{product.type}</div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {product.price === 'Variable' ? 'Variable' : `$${product.price}`}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {product.rp_multiplier === 'Variable' ? 'Variable' : `${product.rp_multiplier}x`}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => startEdit(product)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Edit">
                  ✎
                </button>
                <button onClick={() => resetToDefault(product.id)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Reset">
                  ↻
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

// Machines Tab Component
const MachinesTab = ({ searchTerm, defaultMachines, onDataChange }) => {
  const [machines, setMachines] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    loadMachines();
  }, []);

  const loadMachines = () => {
    setMachines(getCustomMachines());
  };

  const filteredMachines = machines
    .filter(m =>
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const startEdit = (machine) => {
    setEditingId(machine.id);
    setEditValues({
      cost: machine.cost,
      tier: machine.tier || 1
    });
  };

  const saveEdit = (machineId) => {
    const updates = {
      cost: parseFloat(editValues.cost),
      tier: parseInt(editValues.tier)
    };

    if (updateMachine(machineId, updates)) {
      loadMachines();
      onDataChange();
      setEditingId(null);
    } else {
      alert('Failed to update machine');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const resetToDefault = (machineId) => {
    const defaultMachine = defaultMachines.find(m => m.id === machineId);
    if (!defaultMachine) {
      alert('Default machine not found');
      return;
    }
    
    // Reset all editable fields to default values
    const updates = {
      cost: defaultMachine.cost,
      tier: defaultMachine.tier
    };
    
    if (updateMachine(machineId, updates)) {
      loadMachines();
      onDataChange();
    } else {
      alert('Failed to reset machine to default');
    }
  };

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 80px 90px',
        gap: '8px',
        padding: '10px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--text-primary)',
        marginBottom: '10px'
      }}>
        <div>Machine Name</div>
        <div>Cost</div>
        <div>Tier</div>
        <div>Actions</div>
      </div>

      {filteredMachines.map(machine => (
        <div key={machine.id} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 80px 90px',
          gap: '8px',
          padding: '10px',
          background: 'var(--bg-main)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '8px',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{machine.name}</div>

          {editingId === machine.id ? (
            <>
              <input
                type="number"
                value={editValues.cost}
                onChange={(e) => setEditValues({ ...editValues, cost: e.target.value })}
                className="input"
                style={{ padding: '6px', fontSize: '12px' }}
              />
              <input
                type="number"
                min="1"
                max="5"
                value={editValues.tier}
                onChange={(e) => setEditValues({ ...editValues, tier: e.target.value })}
                className="input"
                style={{ padding: '6px', fontSize: '12px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => saveEdit(machine.id)} className="btn btn-primary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Save">
                  ✓
                </button>
                <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Cancel">
                  ✗
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--text-secondary)' }}>${machine.cost}</div>
              <div style={{ color: 'var(--text-secondary)' }}>Tier {machine.tier || 1}</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => startEdit(machine)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Edit">
                  ✎
                </button>
                <button onClick={() => resetToDefault(machine.id)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Reset">
                  ↻
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

// Recipes Tab Component (Simplified for now - can be expanded)
const RecipesTab = ({ searchTerm, defaultRecipes, defaultMachines, defaultProducts, onDataChange }) => {
  const [recipes, setRecipes] = useState([]);
  const [editingRecipe, setEditingRecipe] = useState(null);

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = () => {
    setRecipes(getCustomRecipes());
  };

  const handleSaveRecipe = (updatedRecipe) => {
    if (updateRecipe(updatedRecipe.id, updatedRecipe)) {
      loadRecipes();
      onDataChange();
    } else {
      alert('Failed to save recipe');
    }
  };

  const filteredRecipes = recipes
    .filter(r =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const nameA = a.name || a.id;
      const nameB = b.name || b.id;
      return nameA.localeCompare(nameB);
    });

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 110px 110px 70px',
        gap: '8px',
        padding: '10px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        fontSize: '13px',
        color: 'var(--text-primary)',
        marginBottom: '10px'
      }}>
        <div>Recipe Name</div>
        <div>Machine</div>
        <div>Cycle Time</div>
        <div>Power</div>
        <div>Actions</div>
      </div>

      {filteredRecipes.map(recipe => (
        <div key={recipe.id} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 110px 110px 70px',
          gap: '8px',
          padding: '10px',
          background: 'var(--bg-main)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '8px',
          alignItems: 'center',
          fontSize: '13px'
        }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{recipe.name || recipe.id}</div>
          <div style={{ 
            color: (() => {
              const machine = defaultMachines.find(m => m.id === recipe.machine_id);
              if (!machine) return 'var(--text-secondary)';
              switch(machine.tier) {
                case 1: return 'var(--tier-1-color)';
                case 2: return 'var(--tier-2-color)';
                case 3: return 'var(--tier-3-color)';
                case 4: return 'var(--tier-4-color)';
                case 5: return 'var(--tier-5-color)';
                default: return 'var(--text-secondary)';
              }
            })(),
            fontWeight: 500
          }}>
            {(() => {
              const machine = defaultMachines.find(m => m.id === recipe.machine_id);
              return machine ? machine.name : recipe.machine_id;
            })()}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{recipe.cycle_time}s</div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {typeof recipe.power_consumption === 'number' 
              ? `${recipe.power_consumption}W` 
              : String(recipe.power_consumption)}
          </div>
          <button 
            onClick={() => setEditingRecipe(recipe)} 
            className="btn btn-secondary" 
            style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }}
            title="Edit"
          >
            ✎
          </button>
        </div>
      ))}

      {editingRecipe && (
        <RecipeEditor
          recipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSave={handleSaveRecipe}
          availableProducts={defaultProducts}
          defaultMachines={defaultMachines}
        />
      )}
    </div>
  );
};

export default DataManager;