import { GenericDataList } from './GenericDataList';
import styles from './ProductsTab.module.css';

interface ProductsListProps {
  selectedProductId: string | null;
  onSelectProduct: (id: string | null) => void;
}

export function ProductsList({ selectedProductId, onSelectProduct }: ProductsListProps) {
  return (
    <GenericDataList
      type="product"
      selectedId={selectedProductId}
      onSelect={onSelectProduct}
      styles={styles}
    />
  );
}
