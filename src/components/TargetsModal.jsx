import React from 'react';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';

const TargetsModal = ({ targetProducts, setTargetProducts, onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Target Products</h2>
        <div className="modal-content flex-col" style={{ maxHeight: '500px', marginBottom: '20px' }}>
          {targetProducts.length === 0 ? (
            <div className="empty-state">
              No target products yet. Shift+Click a recipe box to mark it as a target.
            </div>
          ) : (
            targetProducts.map(target => (
              <div key={target.id} className="target-card">
                <div className="flex-1">
                  <div className="target-product-name">
                    {getProductName(target.productId, getProduct)}
                  </div>
                  <div className="target-box-id">Box ID: {target.recipeBoxId}</div>
                </div>
                <div className="target-input-group">
                  <label className="target-label">Target:</label>
                  <input
                    type="number"
                    min="0"
                    value={target.desiredAmount}
                    onChange={(e) =>
                      setTargetProducts(prev =>
                        prev.map(t =>
                          t.id === target.id
                            ? { ...t, desiredAmount: parseFloat(e.target.value) || 0 }
                            : t
                        )
                      )
                    }
                    className="input input-small"
                  />
                  <span className="target-label">/s</span>
                </div>
                <button
                  onClick={() => setTargetProducts(prev => prev.filter(t => t.id !== target.id))}
                  className="btn btn-delete"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        <button onClick={onClose} className="btn btn-secondary">
          Close
        </button>
      </div>
    </div>
  );
};

export default TargetsModal;