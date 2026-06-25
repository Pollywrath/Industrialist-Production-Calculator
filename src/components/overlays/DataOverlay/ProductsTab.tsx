import { useDataStore } from '../../../stores/useDataStore';
import { ProductsList } from './ProductsList';
import { ProductForm } from './ProductForm';
import styles from './ProductsTab.module.css';

export function ProductsTab() {
  const selectedProductId = useDataStore((s) => s.selectedProductId);
  const setSelectedProductId = useDataStore((s) => s.setSelectedProductId);

  return (
    <div className={styles['products-tab-container']}>
      <ProductsList selectedProductId={selectedProductId} onSelectProduct={setSelectedProductId} />
      <ProductForm selectedProductId={selectedProductId} onSelectProduct={setSelectedProductId} />
    </div>
  );
}
