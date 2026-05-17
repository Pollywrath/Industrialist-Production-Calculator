import { useState } from 'react';
import { ProductsList } from './ProductsList';
import { ProductForm } from './ProductForm';
import styles from './ProductsTab.module.css';

export function ProductsTab() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  return (
    <div className={styles['products-tab-container']}>
      <ProductsList
        selectedProductId={selectedProductId}
        onSelectProduct={setSelectedProductId}
      />
      <ProductForm
        selectedProductId={selectedProductId}
        onSelectProduct={setSelectedProductId}
      />
    </div>
  );
}
