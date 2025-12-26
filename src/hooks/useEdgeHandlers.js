import { useCallback } from 'react';
import { getProduct } from '../data/dataLoader';
import { clearFlowCache } from '../solvers/flowCalculator';

export const useEdgeHandlers = ({
  nodes, setEdges, setShowRecipeSelector, setSelectedProduct,
  setAutoConnectTarget, setRecipeFilter
}) => {

  const openRecipeSelector = useCallback(() => {
    setShowRecipeSelector(true);
    setAutoConnectTarget(null);
  }, [setShowRecipeSelector, setAutoConnectTarget]);

  const openRecipeSelectorForInput = useCallback((productId, nodeId, inputIndex, event) => {
    if (event?.ctrlKey) {
      // Ctrl+Click: Delete all edges connected to this input
      setEdges(eds => eds.filter(edge =>
        !(edge.target === nodeId && edge.targetHandle === `left-${inputIndex}`)
      ));
      clearFlowCache();
      return;
    }
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setAutoConnectTarget({ nodeId, inputIndex, productId });
      setRecipeFilter('producers');
    }
  }, [setEdges, setShowRecipeSelector, setSelectedProduct, setAutoConnectTarget, setRecipeFilter]);

  const openRecipeSelectorForOutput = useCallback((productId, nodeId, outputIndex, event) => {
    if (event?.ctrlKey) {
      // Ctrl+Click: Delete all edges connected to this output
      setEdges(eds => eds.filter(edge =>
        !(edge.source === nodeId && edge.sourceHandle === `right-${outputIndex}`)
      ));
      clearFlowCache();
      return;
    }
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setAutoConnectTarget({ nodeId, outputIndex, productId, isOutput: true });
      setRecipeFilter('consumers');
    }
  }, [setEdges, setShowRecipeSelector, setSelectedProduct, setAutoConnectTarget, setRecipeFilter]);

  return {
    openRecipeSelector,
    openRecipeSelectorForInput,
    openRecipeSelectorForOutput
  };
};