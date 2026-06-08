import type { ChangeEvent } from 'react';
import { Box } from 'lucide-react';
import { getProduct, hasProductOverride } from '../../../data/lookup';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import { GenericDataFormShell } from './GenericDataFormShell';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import styles from './DataCrud.module.css';

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

  const baseline = selectedProductId
    ? dbVersion !== -1
      ? getProduct(selectedProductId)
      : undefined
    : undefined;
  const isModified = selectedProductId
    ? dbVersion !== -1
      ? hasProductOverride(selectedProductId)
      : false
    : false;
  const pending = selectedProductId ? pendingEdits.products[selectedProductId] : undefined;
  const activeProduct = overlayPendingEdit(baseline, pending);

  if (!selectedProductId || !activeProduct) {
    return (
      <GenericDataFormShell
        entityId={selectedProductId}
        activeEntity={activeProduct ?? null}
        isModified={isModified}
        entityLabel="Product"
        EmptyIcon={Box}
      />
    );
  }

  const handleTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    updateProductPendingEdit(selectedProductId, { type: e.target.value as 'Item' | 'Fluid' });
  };

  const handleDelete = () => {
    deleteProduct(selectedProductId);
    onSelectProduct(null);
  };

  return (
    <GenericDataFormShell
      entityId={selectedProductId}
      activeEntity={activeProduct}
      isModified={isModified}
      onRestore={() => restoreProductDefault(selectedProductId)}
      onDelete={handleDelete}
      onNameChange={(name) => {
        const nextId = updateProductPendingEdit(selectedProductId, { name });
        if (nextId && nextId !== selectedProductId) {
          onSelectProduct(nextId);
        }
      }}
      entityLabel="Product"
      EmptyIcon={Box}
    >
      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Sell Cost ($)</label>
        <ValidatedNumberInput
          value={activeProduct.sell_price}
          onChange={(val) => updateProductPendingEdit(selectedProductId, { sell_price: val })}
          defaultValue={0}
          allowDecimals={true}
          allowNegatives={true}
          className={styles['form-input']}
          placeholder="0.0"
        />
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-label']}>Research Point Multiplier</label>
        <ValidatedNumberInput
          value={activeProduct.rp_multiplier}
          onChange={(val) => updateProductPendingEdit(selectedProductId, { rp_multiplier: val })}
          defaultValue={1}
          allowDecimals={true}
          allowNegatives={false}
          min={0}
          className={styles['form-input']}
          placeholder="1.0"
          title="Must be a positive float value (>= 0)"
        />
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-checkbox-label']}>
          <input
            type="checkbox"
            checked={!!activeProduct.profit}
            onChange={(e) => updateProductPendingEdit(selectedProductId, { profit: e.target.checked })}
          />
          Good to Sell (Profit)
        </label>
      </div>

      <div className={styles['form-group']}>
        <label className={styles['form-checkbox-label']}>
          <input
            type="checkbox"
            checked={!!activeProduct.research}
            onChange={(e) => updateProductPendingEdit(selectedProductId, { research: e.target.checked })}
          />
          Good for Research
        </label>
      </div>

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
    </GenericDataFormShell>
  );
}
