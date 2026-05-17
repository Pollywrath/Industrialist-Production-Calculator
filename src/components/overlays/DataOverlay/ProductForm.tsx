import React from 'react';
import { Trash2, RotateCcw, Box } from 'lucide-react';
import { getProduct, hasProductOverride } from '../../../data/lookup';
import { useDataStore } from '../../../stores/useDataStore';
import styles from './ProductsTab.module.css';

interface ProductFormProps {
  selectedProductId: string | null;
  onSelectProduct: (id: string | null) => void;
}

export function ProductForm({ selectedProductId, onSelectProduct }: ProductFormProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const updateProductPendingEdit = useDataStore((s) => s.updateProductPendingEdit);
  const deleteProduct = useDataStore((s) => s.deleteProduct);
  const restoreProductDefault = useDataStore((s) => s.restoreProductDefault);
  const dbVersion = useDataStore((s) => s.dbVersion);

  // 1. Resolve product data with pending transient edits overlaid
  const emptyState = (
    <div className={styles['empty-detail']}>
      <Box className={styles['empty-icon']} size={40} strokeWidth={1} />
      <div className={styles['empty-title']}>No Product Selected</div>
      <div className={styles['empty-desc']}>
        Select a product from the master index list on the left to view or edit its parameters, or click the plus button to create a new custom product.
      </div>
    </div>
  );

  if (!selectedProductId) {
    return emptyState;
  }

  // Bust React Compiler memoization by including dbVersion in the baseline lookup
  const baseline = dbVersion !== -1 ? getProduct(selectedProductId) : undefined;
  const isModified = dbVersion !== -1 ? hasProductOverride(selectedProductId) : false;
  const pending = pendingEdits.products[selectedProductId];

  // If item is tombstoned/deleted in pending edits
  if (pending?._tombstone) {
    return emptyState;
  }

  const activeProduct = pending
    ? { ...baseline, ...pending }
    : baseline;

  if (!activeProduct) {
    return emptyState;
  }

  // 2. Event Handlers
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateProductPendingEdit(selectedProductId, { name: e.target.value });
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
    updateProductPendingEdit(selectedProductId, { sell_price: isNaN(val) ? 0 : val });
  };

  const handleMultiplierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
    const clampedVal = isNaN(val) ? 0 : Math.max(0, val);
    updateProductPendingEdit(selectedProductId, { rp_multiplier: clampedVal });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateProductPendingEdit(selectedProductId, { type: e.target.value as 'Item' | 'Fluid' });
  };

  const handleDelete = () => {
    deleteProduct(selectedProductId);
    onSelectProduct(null);
  };

  return (
    <div className={styles['detail-pane']}>
      <div className={styles['editor-form']}>
        <div className={styles['form-header']}>
          <div className={styles['form-title']}>Product Specification</div>
        </div>

        <div className={styles['form-body']}>
          {/* Read-Only unique product ID */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Unique ID</label>
            <input
              type="text"
              className={styles['form-input-readonly']}
              value={activeProduct.id}
              disabled
              title="ID is generated automatically and cannot be changed"
            />
          </div>

          {/* Editable product Name */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Product Name</label>
            <input
              type="text"
              className={styles['form-input']}
              value={activeProduct.name || ''}
              onChange={handleNameChange}
              placeholder="e.g. Iron Ore"
              maxLength={64}
            />
          </div>

          {/* Editable product Sell Price */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Sell Cost ($)</label>
            <input
              type="number"
              step="any"
              className={styles['form-input']}
              value={activeProduct.sell_price === undefined ? '' : activeProduct.sell_price}
              onChange={handlePriceChange}
              placeholder="0.0"
            />
          </div>

          {/* Editable product RP Multiplier */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Research Point Multiplier</label>
            <input
              type="number"
              step="any"
              min="0"
              className={styles['form-input']}
              value={activeProduct.rp_multiplier === undefined ? '' : activeProduct.rp_multiplier}
              onChange={handleMultiplierChange}
              placeholder="1.0"
              title="Must be a positive float value (>= 0)"
            />
          </div>

          {/* Editable product Type (Item / Fluid) */}
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Product Type</label>
            <select
              className={styles['form-select']}
              value={activeProduct.type || 'Item'}
              onChange={handleTypeChange}
            >
              <option value="Item">Item</option>
              <option value="Fluid">Fluid</option>
            </select>
          </div>

          {/* Action Row */}
          <div className={styles['form-actions']}>
            {isModified ? (
              <button
                className={styles['btn-restore-product']}
                onClick={() => restoreProductDefault(selectedProductId)}
                title="Restore this entry back to its baseline default configuration"
              >
                <RotateCcw size={14} />
                Restore Baseline Defaults
              </button>
            ) : (
              <button className={styles['btn-delete-product']} onClick={handleDelete}>
                <Trash2 size={14} />
                Delete Product Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
