import { useState, useEffect, useRef, useMemo } from 'react';
import { solveProductionNetwork, getExcessProducts, getDeficientProducts } from '../solvers/productionSolver';

export const useProductionSolver = ({ nodes, edges, soldProducts }) => {
  const [productionSolution, setProductionSolution] = useState(() =>
    solveProductionNetwork([], [])
  );

  const solverTimeoutRef = useRef(null);
  const lastSolverHash = useRef('');

  useEffect(() => {
    if (solverTimeoutRef.current) {
      clearTimeout(solverTimeoutRef.current);
    }

    solverTimeoutRef.current = setTimeout(() => {
      const currentHash = `${nodes.length}-${edges.length}-${nodes.map(n => `${n.id}:${n.data?.machineCount}`).join(',')}`;

      if (currentHash !== lastSolverHash.current) {
        const solution = solveProductionNetwork(nodes, edges);
        setProductionSolution(solution);
        lastSolverHash.current = currentHash;
      }
    }, 300);

    return () => {
      if (solverTimeoutRef.current) {
        clearTimeout(solverTimeoutRef.current);
      }
    };
  }, [nodes, edges]);

  const excessProductsRaw = useMemo(() => getExcessProducts(productionSolution), [productionSolution]);
  const deficientProducts = useMemo(() => getDeficientProducts(productionSolution), [productionSolution]);

  const excessProducts = useMemo(() => excessProductsRaw.map(item => {
    const shouldAutoSell = typeof item.product.price === 'number' && item.product.price > 0;
    const explicitlySold = soldProducts[item.productId];
    return { ...item, isSold: explicitlySold !== undefined ? explicitlySold : shouldAutoSell };
  }), [excessProductsRaw, soldProducts]);

  return {
    productionSolution,
    excessProducts,
    deficientProducts
  };
};