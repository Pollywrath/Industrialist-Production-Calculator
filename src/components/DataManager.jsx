import React, { useState, useEffect, useRef } from 'react';
import RecipeEditor from './RecipeEditor';
import { 
  getCustomProducts, 
  getCustomMachines, 
  getCustomRecipes,
  updateProduct,
  updateMachine,
  updateRecipe,
  saveCustomProducts,
  saveCustomMachines,
  saveCustomRecipes,
  exportData,
  importData,
  restoreDefaultProducts,
  restoreDefaultMachines,
  restoreDefaultRecipes
} from '../utils/dataUtilities';
import { metricFormat } from '../utils/appUtilities';

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
        
        // Check if this file only contains canvas data
        const hasData = imported.products || imported.machines || imported.recipes;
        const hasCanvas = imported.canvas;
        
        if (!hasData && hasCanvas) {
          alert('This file only contains canvas data. Please use Save Manager to import canvas layouts.');
          event.target.value = '';
          return;
        }
        
        if (!hasData) {
          alert('This file does not contain any game data (products, machines, or recipes).');
          event.target.value = '';
          return;
        }
        
        // Warn if file contains canvas data that will be ignored
        if (hasCanvas) {
          if (!window.confirm('This file contains canvas data which will be IGNORED.\n\nOnly game data (products/machines/recipes) will be imported.\n\nTo import canvas data, use Save Manager > Import Canvas.\n\nContinue with data-only import?')) {
            event.target.value = '';
            return;
          }
        }
        
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    type: 'item',
    price: 0,
    rp_multiplier: 1
  });

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
    const defaultProduct = defaultProducts.find(p => p.id === productId);
    
    if (!defaultProduct) {
      alert('Default product not found');
      return;
    }
    
    const updates = {
      price: defaultProduct.price,
      rp_multiplier: defaultProduct.rp_multiplier,
      type: defaultProduct.type
    };
    
    if (updateProduct(productId, updates)) {
      loadProducts();
      onDataChange();
    } else {
      alert('Failed to reset product to default');
    }
  };

  const generateProductId = (name) => {
    return 'p_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  };

  const handleAddProduct = () => {
    if (!newProduct.name.trim()) {
      alert('Product name is required');
      return;
    }

    const productId = generateProductId(newProduct.name);
    
    if (products.find(p => p.id === productId)) {
      alert(`Product ID "${productId}" already exists. Please use a different name.`);
      return;
    }

    const productToAdd = {
      id: productId,
      name: newProduct.name.trim(),
      type: newProduct.type,
      price: parseFloat(newProduct.price) || 0,
      rp_multiplier: parseFloat(newProduct.rp_multiplier) || 1
    };

    const updatedProducts = [...products, productToAdd];
    if (saveCustomProducts(updatedProducts)) {
      loadProducts();
      onDataChange();
      setShowAddForm(false);
      setNewProduct({ name: '', type: 'item', price: 0, rp_multiplier: 1 });
    } else {
      alert('Failed to add product');
    }
  };

  const handleDeleteProduct = (productId) => {
    if (!window.confirm(`Delete product "${products.find(p => p.id === productId)?.name}"? This cannot be undone.`)) {
      return;
    }

    const updatedProducts = products.filter(p => p.id !== productId);
    if (saveCustomProducts(updatedProducts)) {
      loadProducts();
      onDataChange();
    } else {
      alert('Failed to delete product');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Product'}
        </button>
      </div>

      {showAddForm && (
        <div style={{
          padding: '15px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '15px',
          border: '2px solid var(--border-primary)'
        }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
            New Product
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Name</label>
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="input"
                placeholder="Product name"
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                ID: {newProduct.name ? generateProductId(newProduct.name) : 'p_...'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Type</label>
              <select
                value={newProduct.type}
                onChange={(e) => setNewProduct({ ...newProduct, type: e.target.value })}
                className="select"
              >
                <option value="item">Item</option>
                <option value="fluid">Fluid</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Price</label>
              <input
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>RP Multiplier</label>
              <input
                type="number"
                step="0.1"
                value={newProduct.rp_multiplier}
                onChange={(e) => setNewProduct({ ...newProduct, rp_multiplier: e.target.value })}
                className="input"
                placeholder="1"
              />
            </div>
          </div>
          <button onClick={handleAddProduct} className="btn btn-primary" style={{ width: '100%' }}>
            Create Product
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 100px 100px 130px',
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
          gridTemplateColumns: '1fr 80px 100px 100px 130px',
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
                {product.price === 'Variable' ? 'Variable' : `$${metricFormat(product.price)}`}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {product.rp_multiplier === 'Variable' ? 'Variable' : `${product.rp_multiplier >= 1000 ? metricFormat(product.rp_multiplier) : product.rp_multiplier}x`}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => startEdit(product)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Edit">
                  ✎
                </button>
                <button onClick={() => resetToDefault(product.id)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Reset">
                  ↻
                </button>
                <button onClick={() => handleDeleteProduct(product.id)} className="btn btn-delete" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Delete">
                  ✕
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMachine, setNewMachine] = useState({
    name: '',
    cost: 0,
    tier: 1
  });

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

  const generateMachineId = (name) => {
    return 'm_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  };

  const handleAddMachine = () => {
    if (!newMachine.name.trim()) {
      alert('Machine name is required');
      return;
    }

    const machineId = generateMachineId(newMachine.name);
    
    if (machines.find(m => m.id === machineId)) {
      alert(`Machine ID "${machineId}" already exists. Please use a different name.`);
      return;
    }

    const machineToAdd = {
      id: machineId,
      name: newMachine.name.trim(),
      cost: parseFloat(newMachine.cost) || 0,
      tier: parseInt(newMachine.tier) || 1
    };

    const updatedMachines = [...machines, machineToAdd];
    if (saveCustomMachines(updatedMachines)) {
      loadMachines();
      onDataChange();
      setShowAddForm(false);
      setNewMachine({ name: '', cost: 0, tier: 1 });
    } else {
      alert('Failed to add machine');
    }
  };

  const handleDeleteMachine = (machineId) => {
    if (!window.confirm(`Delete machine "${machines.find(m => m.id === machineId)?.name}"? This cannot be undone.`)) {
      return;
    }

    const updatedMachines = machines.filter(m => m.id !== machineId);
    if (saveCustomMachines(updatedMachines)) {
      loadMachines();
      onDataChange();
    } else {
      alert('Failed to delete machine');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <button 
          onClick={() => setShowAddForm(!showAddForm)} 
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {showAddForm ? 'Cancel' : '+ Add New Machine'}
        </button>
      </div>

      {showAddForm && (
        <div style={{
          padding: '15px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '15px',
          border: '2px solid var(--border-primary)'
        }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
            New Machine
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Name</label>
              <input
                type="text"
                value={newMachine.name}
                onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })}
                className="input"
                placeholder="Machine name"
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                ID: {newMachine.name ? generateMachineId(newMachine.name) : 'm_...'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Cost</label>
              <input
                type="number"
                value={newMachine.cost}
                onChange={(e) => setNewMachine({ ...newMachine, cost: e.target.value })}
                className="input"
                placeholder="0"
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Tier</label>
              <select
                value={newMachine.tier}
                onChange={(e) => setNewMachine({ ...newMachine, tier: e.target.value })}
                className="select"
              >
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
                <option value="4">Tier 4</option>
                <option value="5">Tier 5</option>
              </select>
            </div>
          </div>
          <button onClick={handleAddMachine} className="btn btn-primary" style={{ width: '100%' }}>
            Create Machine
          </button>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 80px 130px',
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
          gridTemplateColumns: '1fr 120px 80px 130px',
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
              <div style={{ color: 'var(--text-secondary)' }}>${metricFormat(machine.cost)}</div>
              <div style={{ color: 'var(--text-secondary)' }}>Tier {machine.tier || 1}</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => startEdit(machine)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Edit">
                  ✎
                </button>
                <button onClick={() => resetToDefault(machine.id)} className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Reset">
                  ↻
                </button>
                <button onClick={() => handleDeleteMachine(machine.id)} className="btn btn-delete" style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }} title="Delete">
                  ✕
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
  const [products, setProducts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    loadRecipes();
    loadProducts();
    loadMachines();
  }, []);

  const loadRecipes = () => {
    setRecipes(getCustomRecipes());
  };

  const loadProducts = () => {
    setProducts(getCustomProducts());
  };

  const loadMachines = () => {
    setMachines(getCustomMachines());
  };

  const handleSaveRecipe = (updatedRecipe, isNew = false) => {
    if (isNew) {
      const updatedRecipes = [...recipes, updatedRecipe];
      if (saveCustomRecipes(updatedRecipes)) {
        loadRecipes();
        loadProducts();
        loadMachines();
        onDataChange();
      } else {
        alert('Failed to create recipe');
      }
    } else {
      if (updateRecipe(updatedRecipe.id, updatedRecipe)) {
        loadRecipes();
        loadProducts();
        loadMachines();
        onDataChange();
      } else {
        alert('Failed to save recipe');
      }
    }
  };

  const handleDeleteRecipe = (recipeId) => {
    if (!window.confirm(`Delete recipe "${recipes.find(r => r.id === recipeId)?.name || recipeId}"? This cannot be undone.`)) {
      return;
    }

    const updatedRecipes = recipes.filter(r => r.id !== recipeId);
    if (saveCustomRecipes(updatedRecipes)) {
      loadRecipes();
      loadProducts();
      loadMachines();
      onDataChange();
    } else {
      alert('Failed to delete recipe');
    }
  };

  const handleCreateNew = () => {
    setEditingRecipe({
      id: '',
      name: '',
      machine_id: '',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [],
      outputs: []
    });
    setIsCreatingNew(true);
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
      <div style={{ marginBottom: '15px' }}>
        <button 
          onClick={handleCreateNew} 
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          + Add New Recipe
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 110px 110px 110px',
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
          gridTemplateColumns: '1fr 1fr 110px 110px 110px',
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
              const machine = machines.find(m => m.id === recipe.machine_id);
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
              const machine = machines.find(m => m.id === recipe.machine_id);
              return machine ? machine.name : recipe.machine_id;
            })()}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {typeof recipe.cycle_time === 'number' ? `${recipe.cycle_time}s` : String(recipe.cycle_time)}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {typeof recipe.power_consumption === 'number' 
              ? `${metricFormat(recipe.power_consumption)}W` 
              : typeof recipe.power_consumption === 'object' && recipe.power_consumption !== null
              ? `${metricFormat(recipe.power_consumption.max || recipe.power_consumption.average || 0)}W`
              : String(recipe.power_consumption)}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              onClick={() => { setEditingRecipe(recipe); setIsCreatingNew(false); }} 
              className="btn btn-secondary" 
              style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }}
              title="Edit"
            >
              ✎
            </button>
            <button 
              onClick={() => handleDeleteRecipe(recipe.id)} 
              className="btn btn-delete" 
              style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto', width: 'auto' }}
              title="Delete"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {editingRecipe && (
        <RecipeEditor
          recipe={editingRecipe}
          onClose={() => { setEditingRecipe(null); setIsCreatingNew(false); }}
          onSave={(recipe) => handleSaveRecipe(recipe, isCreatingNew)}
          availableProducts={products}
          defaultMachines={machines}
          allRecipes={recipes}
          isCreatingNew={isCreatingNew}
        />
      )}
    </div>
  );
};

export default DataManager;