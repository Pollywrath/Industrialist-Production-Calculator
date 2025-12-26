import { useEffect, useRef, useMemo } from 'react';
import { buildTreeFarmOutputs, calculateTreeFarmMetrics } from '../data/treeFarm';
import { getMachine } from '../data/dataLoader';

const calculateResidueAmount = (globalPollution) => {
  const x = globalPollution;
  if (x < 0) return 0;
  const lnArg = 1 + (5429 * x) / 7322;
  return Math.pow(Math.log(lnArg), 1.1);
};

export const usePollutionEffects = ({
  nodes, setNodes, globalPollution, setGlobalPollution, pollutionInputFocused, isPollutionPaused
}) => {

  const pollutionUpdateTimeoutRef = useRef(null);

  // Calculate total pollution from all nodes
  const totalPollution = useMemo(() => {
    let total = 0;
    nodes.forEach(node => {
      const recipe = node.data?.recipe;
      const machineCount = node.data?.machineCount || 0;
      if (!recipe) return;

      const pollution = recipe.pollution;
      const pollutionNum = typeof pollution === 'number' ? pollution : parseFloat(pollution);
      if (!isNaN(pollutionNum) && isFinite(pollutionNum)) {
        total += pollutionNum * machineCount;
      }
    });
    return total;
  }, [nodes]);

  // Auto-increment pollution based on total pollution
  useEffect(() => {
    if (isPollutionPaused || totalPollution === 0) {
      return;
    }

    const interval = setInterval(() => {
      if (pollutionInputFocused) return;
      const pollutionPerSecond = totalPollution / 3600;
      setGlobalPollution(prev => {
        if (typeof prev !== 'number' || isNaN(prev) || !isFinite(prev)) return prev;
        const newValue = parseFloat((prev + pollutionPerSecond).toFixed(4));
        return newValue !== prev ? newValue : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [totalPollution, pollutionInputFocused, isPollutionPaused, setGlobalPollution]);

  // Update nodes when pollution changes
  useEffect(() => {
    if (pollutionUpdateTimeoutRef.current) {
      clearTimeout(pollutionUpdateTimeoutRef.current);
    }

    pollutionUpdateTimeoutRef.current = setTimeout(() => {
      setNodes(nds => {
        let hasChanges = false;
        const newNodes = nds.map(node => {
          const recipe = node.data?.recipe;
          const machine = node.data?.machine;

          // Update tree farms
          if (recipe?.isTreeFarm && recipe.treeFarmSettings) {
            const settings = recipe.treeFarmSettings;
            const updatedOutputs = buildTreeFarmOutputs(settings.trees, settings.harvesters, globalPollution);
            const metrics = calculateTreeFarmMetrics(settings.trees, settings.harvesters, settings.sprinklers, settings.outputs, settings.controller, globalPollution);

            hasChanges = true;
            return {
              ...node,
              data: {
                ...node.data,
                recipe: {
                  ...recipe,
                  outputs: updatedOutputs,
                  power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable'
                },
                globalPollution
              }
            };
          }

          // Update air separation units
          if (machine?.id === 'm_air_separation_unit') {
            const residueAmount = calculateResidueAmount(globalPollution);
            const updatedOutputs = recipe.outputs.map(output => {
              if (output.product_id === 'p_residue') {
                return { ...output, quantity: parseFloat(residueAmount.toFixed(6)) };
              }
              return output;
            });

            hasChanges = true;
            return {
              ...node,
              data: {
                ...node.data,
                recipe: {
                  ...recipe,
                  outputs: updatedOutputs
                },
                globalPollution
              }
            };
          }

          // Update globalPollution for all nodes
          hasChanges = true;
          return {
            ...node,
            data: {
              ...node.data,
              globalPollution
            }
          };
        });

        return hasChanges ? newNodes : nds;
      });
    }, 250);

    return () => {
      if (pollutionUpdateTimeoutRef.current) {
        clearTimeout(pollutionUpdateTimeoutRef.current);
      }
    };
  }, [globalPollution, setNodes]);
};