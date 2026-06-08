import { GenericDataList } from './GenericDataList';

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
    />
  );
}
