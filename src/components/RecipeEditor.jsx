import React, { useState } from 'react';

const SPECIAL_RECIPE_IDS = [
  'r_mineshaft_drill',
  'r_logic_assembler',
  'r_tree_farm',
  'r_underground_waste_facility',
  'r_liquid_dump',
  'r_liquid_burner'
];

const RecipeEditor = ({ recipe, onClose, onSave, availableProducts, defaultMachines }) => {
  const isSpecial = SPECIAL_RECIPE_IDS.includes(recipe.id);
  
  // Check if recipe has variable products
  const hasVariableProducts = recipe.inputs?.some(i => i.product_id === 'p_variableproduct') || 
                               recipe.outputs?.some(o => o.product_id === 'p_variableproduct');
  
  const [editedRecipe, setEditedRecipe] = useState({
    ...recipe,
    inputs: recipe.inputs ? [...recipe.inputs] : [],
    outputs: recipe.outputs ? [...recipe.outputs] : []
  });

  const handleFieldChange = (field, value) => {
    setEditedRecipe(prev => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (index, field, value) => {
    const newInputs = [...editedRecipe.inputs];
    newInputs[index] = { ...newInputs[index], [field]: value };
    setEditedRecipe(prev => ({ ...prev, inputs: newInputs }));
  };

  const handleOutputChange = (index, field, value) => {
    const newOutputs = [...editedRecipe.outputs];
    newOutputs[index] = { ...newOutputs[index], [field]: value };
    setEditedRecipe(prev => ({ ...prev, outputs: newOutputs }));
  };

  const addInput = () => {
    const newInputs = [...editedRecipe.inputs, { product_id: '', quantity: 1 }];
    setEditedRecipe(prev => ({ ...prev, inputs: newInputs }));
  };

  const removeInput = (index) => {
    const newInputs = editedRecipe.inputs.filter((_, i) => i !== index);
    setEditedRecipe(prev => ({ ...prev, inputs: newInputs }));
  };

  const addOutput = () => {
    const newOutputs = [...editedRecipe.outputs, { product_id: '', quantity: 1 }];
    setEditedRecipe(prev => ({ ...prev, outputs: newOutputs }));
  };

  const removeOutput = (index) => {
    const newOutputs = editedRecipe.outputs.filter((_, i) => i !== index);
    setEditedRecipe(prev => ({ ...prev, outputs: newOutputs }));
  };

  const validateRecipe = () => {
    // Check all product IDs exist (skip p_variableproduct, p_any_fluid, p_any_item)
    const allProductIds = [
      ...editedRecipe.inputs.map(i => i.product_id),
      ...editedRecipe.outputs.map(o => o.product_id)
    ];

    const invalidProducts = allProductIds.filter(id => 
      id && 
      id !== 'p_variableproduct' && 
      id !== 'p_any_fluid' && 
      id !== 'p_any_item' && 
      !availableProducts.find(p => p.id === id)
    );

    if (invalidProducts.length > 0) {
      alert(`Invalid product IDs: ${invalidProducts.join(', ')}`);
      return false;
    }

    // Check for empty product IDs
    const emptyInputs = editedRecipe.inputs.some(i => !i.product_id);
    const emptyOutputs = editedRecipe.outputs.some(o => !o.product_id);

    if (emptyInputs || emptyOutputs) {
      alert('All inputs and outputs must have a product selected');
      return false;
    }

    // Check numeric values
    if (typeof editedRecipe.cycle_time === 'number' && editedRecipe.cycle_time <= 0) {
      alert('Cycle time must be greater than 0');
      return false;
    }

    // Check for Variable quantities (should be preserved as-is)
    const hasVariableQuantities = 
      editedRecipe.inputs.some(i => i.quantity === 'Variable') ||
      editedRecipe.outputs.some(o => o.quantity === 'Variable');
    
    if (hasVariableQuantities) {
      console.log('Recipe contains Variable quantities - these will be preserved');
    }

    return true;
  };

  const handleSave = () => {
    if (!validateRecipe()) return;
    onSave(editedRecipe);
    onClose();
  };

  const machine = defaultMachines.find(m => m.id === recipe.machine_id);

  if (isSpecial || hasVariableProducts) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '600px' }}>
          <h2 className="modal-title">{isSpecial ? 'Special Recipe' : 'Variable Product Recipe'}</h2>
          
          <div style={{
            padding: '20px',
            background: 'rgba(212, 166, 55, 0.1)',
            border: '2px solid var(--border-divider)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px'
          }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              {recipe.name || recipe.id}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
              {isSpecial ? (
                <>
                  This is a special recipe with dynamic behavior configured per-node. It cannot be edited in the Data Manager.
                  <br /><br />
                  Special recipes include:
                  <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
                    <li>Mineshaft Drill (depth, consumables)</li>
                    <li>Logic Assembler (microchip stages)</li>
                    <li>Tree Farm (layout configuration)</li>
                    <li>Underground Waste Facility (variable inputs)</li>
                    <li>Liquid Dump/Burner (pollution calculation)</li>
                  </ul>
                </>
              ) : (
                <>
                  This recipe contains variable products (p_variableproduct) and cannot be edited in the Data Manager.
                  Variable products are dynamically determined at runtime based on node configuration.
                </>
              )}
            </div>
          </div>

          <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">Edit Recipe: {recipe.name || recipe.id}</h2>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ 
            color: machine?.tier === 1 ? 'var(--tier-1-color)' :
                   machine?.tier === 2 ? 'var(--tier-2-color)' :
                   machine?.tier === 3 ? 'var(--tier-3-color)' :
                   machine?.tier === 4 ? 'var(--tier-4-color)' :
                   machine?.tier === 5 ? 'var(--tier-5-color)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '14px'
          }}>
            Machine: {machine?.name || recipe.machine_id}
          </div>
        </div>

        {/* Basic Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Cycle Time (seconds)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={editedRecipe.cycle_time === 'Variable' ? '' : editedRecipe.cycle_time}
              onChange={(e) => handleFieldChange('cycle_time', parseFloat(e.target.value))}
              placeholder={editedRecipe.cycle_time === 'Variable' ? 'Variable' : ''}
              className="input"
              disabled={editedRecipe.cycle_time === 'Variable'}
              title={editedRecipe.cycle_time === 'Variable' ? 'Cannot edit Variable values' : ''}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Power Consumption (W)
            </label>
            <input
              type="number"
              step="1000"
              value={typeof editedRecipe.power_consumption === 'number' ? editedRecipe.power_consumption : ''}
              onChange={(e) => handleFieldChange('power_consumption', parseFloat(e.target.value))}
              placeholder="Variable"
              className="input"
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Power Type
            </label>
            <select
              value={editedRecipe.power_type || 'MV'}
              onChange={(e) => handleFieldChange('power_type', e.target.value)}
              className="select"
            >
              <option value="LV">LV</option>
              <option value="MV">MV</option>
              <option value="HV">HV</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Pollution (%/hr)
            </label>
            <input
              type="number"
              step="0.1"
              value={editedRecipe.pollution}
              onChange={(e) => handleFieldChange('pollution', parseFloat(e.target.value))}
              className="input"
            />
          </div>
        </div>

        {/* Inputs Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ color: 'var(--input-text)', fontSize: '14px', fontWeight: 600 }}>
              Inputs
            </label>
            <button onClick={addInput} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>
              + Add Input
            </button>
          </div>

          {editedRecipe.inputs.map((input, index) => (
            <div key={index} style={{ 
              display: 'flex', 
              gap: '10px', 
              marginBottom: '10px',
              padding: '10px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-sm)'
            }}>
              <select
                value={input.product_id}
                onChange={(e) => handleInputChange(index, 'product_id', e.target.value)}
                className="select"
                style={{ flex: 2 }}
              >
                <option value="">Select Product</option>
                {[...availableProducts]
                  .filter(p => p.id !== 'p_variableproduct' && p.id !== 'p_any_fluid' && p.id !== 'p_any_item')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.type})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                step="0.1"
                min="0"
                value={input.quantity === 'Variable' ? '' : input.quantity}
                onChange={(e) => handleInputChange(index, 'quantity', parseFloat(e.target.value))}
                placeholder={input.quantity === 'Variable' ? 'Variable' : 'Quantity'}
                className="input"
                style={{ flex: 1 }}
                disabled={input.quantity === 'Variable'}
                title={input.quantity === 'Variable' ? 'Cannot edit Variable quantities' : ''}
              />
              <button 
                onClick={() => removeInput(index)} 
                className="btn btn-delete"
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Remove
              </button>
            </div>
          ))}

          {editedRecipe.inputs.length === 0 && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              No inputs. Click "Add Input" to add one.
            </div>
          )}
        </div>

        {/* Outputs Section */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ color: 'var(--output-text)', fontSize: '14px', fontWeight: 600 }}>
              Outputs
            </label>
            <button onClick={addOutput} className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>
              + Add Output
            </button>
          </div>

          {editedRecipe.outputs.map((output, index) => (
            <div key={index} style={{ 
              display: 'flex', 
              gap: '10px', 
              marginBottom: '10px',
              padding: '10px',
              background: 'var(--output-bg)',
              border: '1px solid var(--output-border)',
              borderRadius: 'var(--radius-sm)'
            }}>
              <select
                value={output.product_id}
                onChange={(e) => handleOutputChange(index, 'product_id', e.target.value)}
                className="select"
                style={{ flex: 2 }}
              >
                <option value="">Select Product</option>
                {[...availableProducts]
                  .filter(p => p.id !== 'p_variableproduct' && p.id !== 'p_any_fluid' && p.id !== 'p_any_item')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.type})
                    </option>
                  ))}
              </select>
              <input
                type="number"
                step="0.1"
                min="0"
                value={output.quantity === 'Variable' ? '' : output.quantity}
                onChange={(e) => handleOutputChange(index, 'quantity', parseFloat(e.target.value))}
                placeholder={output.quantity === 'Variable' ? 'Variable' : 'Quantity'}
                className="input"
                style={{ flex: 1 }}
                disabled={output.quantity === 'Variable'}
                title={output.quantity === 'Variable' ? 'Cannot edit Variable quantities' : ''}
              />
              <button 
                onClick={() => removeOutput(index)} 
                className="btn btn-delete"
                style={{ padding: '4px 12px', fontSize: '12px' }}
              >
                Remove
              </button>
            </div>
          ))}

          {editedRecipe.outputs.length === 0 && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              textAlign: 'center'
            }}>
              No outputs. Click "Add Output" to add one.
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn btn-primary" style={{ flex: 1 }}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecipeEditor;