import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import {
  solveLP,
  cancelLPSolver,
  type LPSolverSession,
  type LPFailureDiagnostics,
} from '../../../solver/lpSolverService';
import { getProductName, resolveActiveRecipe } from '../../../data/lookup';
import { INDUS_LOGO_SRC } from '../../../data/productIcons';
import { getSpecialRecipe } from '../../../data/registry';
import { formatPower, formatPollution } from '../../../utils/unitFormatting';
import { isRecipeNode } from '../../../types/nodes';
import styles from './LPSolverOverlay.module.css';

const TIPS = [
  "Set target nodes to anchor the optimization and prevent the factory from shutting down.",
  "Sinks represent maximum capacity limits and are resolved based on active network flow.",
  "Connected waste dumps and burners will automatically receive excess waste products.",
  "Unconnected input ports are ignored by the optimizer to prevent shutting down nodes.",
  "SCIP WASM solves high-precision models in the background to keep the interface smooth."
];

interface NodeChange {
  id: string;
  recipeName: string;
  currentCount: number;
  proposedCount: number;
}

export function LPSolverOverlay() {
  const isLPSolverOpen = useUIStore((s) => s.isLPSolverOpen);
  const setIsLPSolverOpen = useUIStore((s) => s.setIsLPSolverOpen);

  const [solverState, setSolverState] = useState<'solving' | 'results' | 'failed'>('solving');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [failureDiagnostics, setFailureDiagnostics] = useState<LPFailureDiagnostics | null>(null);
  const [changes, setChanges] = useState<NodeChange[]>([]);
  const [proposedMachineCounts, setProposedMachineCounts] = useState<Record<string, number>>({});

  const [currentPowerTotal, setCurrentPowerTotal] = useState(0);
  const [proposedPowerTotal, setProposedPowerTotal] = useState(0);
  const [currentPollutionTotal, setCurrentPollutionTotal] = useState(0);
  const [proposedPollutionTotal, setProposedPollutionTotal] = useState(0);

  const sessionRef = useRef<LPSolverSession | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!isLPSolverOpen) return;
    let isDisposed = false;

    startTimeRef.current = performance.now();
    const timerInterval = setInterval(() => {
      setElapsedMs(Math.floor(performance.now() - startTimeRef.current));
    }, 50);

    const tipsInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000);

    const { nodes: canvasNodes, edges } = useFlowStore.getState();
    const nodes = canvasNodes.filter(isRecipeNode);
    const recipeNodeIds = new Set(nodes.map((node) => node.id));
    const recipeEdges = edges.filter(
      (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
    );
    const session = solveLP(nodes, recipeEdges);
    sessionRef.current = session;

    session.promise
      .then((res) => {
        if (isDisposed) return;
        setElapsedMs(Math.floor(performance.now() - startTimeRef.current));
        if (!res.feasible || !res.machineCounts) {
          setErrorMsg(res.error || 'The model is infeasible with current target and connection constraints.');
          setFailureDiagnostics(res.diagnostics ?? null);
          setSolverState('failed');
          return;
        }
        setFailureDiagnostics(null);

        const nodeChanges: NodeChange[] = [];
        let curPower = 0;
        let propPower = 0;
        let curPollution = 0;
        let propPollution = 0;

        for (const node of nodes) {
          const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
          if (!recipe) continue;

          let powerVal = 0;
          const power = recipe.power_consumption;
          if (typeof power === 'number') {
            powerVal = power;
          } else if (power && typeof power === 'object' && 'max' in power) {
            powerVal = (power as { max: number }).max;
          }

          const sr = getSpecialRecipe(recipe.id);
          const curPollMultiplier = sr?.pollutionIndependentOfMachineCount ? 1 : (node.data.machineCount ?? 0);
          const propCount = res.machineCounts[node.id] ?? 0;
          const propPollMultiplier = sr?.pollutionIndependentOfMachineCount ? 1 : propCount;

          curPower += powerVal * (node.data.machineCount ?? 0);
          propPower += powerVal * propCount;
          curPollution += (recipe.pollution ?? 0) * curPollMultiplier;
          propPollution += (recipe.pollution ?? 0) * propPollMultiplier;

          const diff = Math.abs((node.data.machineCount ?? 0) - propCount);
          if (diff > 1e-6) {
            nodeChanges.push({
              id: node.id,
              recipeName: recipe.name || 'Unknown',
              currentCount: node.data.machineCount ?? 0,
              proposedCount: propCount,
            });
          }
        }

        setChanges(nodeChanges);
        setProposedMachineCounts(res.machineCounts);
        setCurrentPowerTotal(curPower);
        setProposedPowerTotal(propPower);
        setCurrentPollutionTotal(curPollution);
        setProposedPollutionTotal(propPollution);

        setSolverState('results');
      })
      .catch((err: unknown) => {
        if (isDisposed) return;
        setElapsedMs(Math.floor(performance.now() - startTimeRef.current));
        console.error('[LP Solver Overlay] Execution rejected:', err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setFailureDiagnostics(null);
        setSolverState('failed');
      })
      .finally(() => {
        if (isDisposed) return;
        setElapsedMs(Math.floor(performance.now() - startTimeRef.current));
        clearInterval(timerInterval);
        clearInterval(tipsInterval);
        sessionRef.current = null;
      });

    return () => {
      isDisposed = true;
      clearInterval(timerInterval);
      clearInterval(tipsInterval);
      if (sessionRef.current) {
        cancelLPSolver();
        sessionRef.current = null;
      }
    };
  }, [isLPSolverOpen]);

  if (!isLPSolverOpen) return null;

  const handleCancel = () => {
    if (sessionRef.current) {
      cancelLPSolver();
      sessionRef.current = null;
    }
    resetViewState();
    setIsLPSolverOpen(false);
  };

  const handleApply = () => {
    const flowStore = useFlowStore.getState();
    flowStore.runTransaction(() => {
      Object.entries(proposedMachineCounts).forEach(([nodeId, count]) => {
        flowStore.updateNodeData(nodeId, { machineCount: count });
      });
    });
    resetViewState();
    setIsLPSolverOpen(false);
  };

  const formatStopwatch = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(hundredths)}`;
  };

  const resetViewState = () => {
    setSolverState('solving');
    setElapsedMs(0);
    setTipIndex(0);
    setErrorMsg('');
    setFailureDiagnostics(null);
    setChanges([]);
    setProposedMachineCounts({});
    setCurrentPowerTotal(0);
    setProposedPowerTotal(0);
    setCurrentPollutionTotal(0);
    setProposedPollutionTotal(0);
  };

  const formatNodeLabel = (nodeId: string): string => {
    const node = useFlowStore.getState().nodes.find((candidate) => candidate.id === nodeId);
    if (!isRecipeNode(node)) return nodeId;
    const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
    const label = recipe?.name || 'Unknown';
    return label;
  };

  const formatDeficiencyHeadline = (diagnostics: LPFailureDiagnostics): string => {
    const count = diagnostics.deficientInputs.length;
    const total = diagnostics.deficientInputs.reduce((sum, input) => sum + input.deficiency, 0);
    return `${count} connected ${count === 1 ? 'input is' : 'inputs are'} still missing ${total.toFixed(4)} units/sec.`;
  };

  const formatRate = (rate: number): string => {
    return `${rate.toFixed(4)} / sec`;
  };

  const formatCauseLabel = (
    causeKind: LPFailureDiagnostics['rootCauses'][number]['kind']
  ): string => {
    switch (causeKind) {
      case 'feedback_loop':
        return 'Deficient feedback loop';
      case 'product_mismatch':
        return 'Connected product mismatch';
      case 'upstream_input_deficient':
        return 'Upstream producer is missing connected inputs';
      case 'upstream_not_producing':
        return 'Producer output is 0 under current recipe conditions';
      case 'upstream_output_limited':
        return 'Connected producer output is too small or fully allocated';
      case 'unknown':
      default:
        return 'Cause could not be isolated';
    }
  };

  const formatRootCauseRate = (
    cause: LPFailureDiagnostics['rootCauses'][number]
  ): string => {
    if (cause.kind === 'feedback_loop') {
      return `Loop shortage: ${formatRate(cause.deficiency)}`;
    }

    if (cause.outputIndex !== null) {
      if (cause.kind === 'upstream_not_producing') {
        return `Output ${cause.outputIndex + 1}: ${formatRate(cause.unitOutputRate)} per machine`;
      }
      return `Output ${cause.outputIndex + 1}: ${formatRate(cause.outputRate)} solved`;
    }

    return `Supplied: ${formatRate(cause.suppliedRate)}`;
  };

  const formatNodeList = (nodeIds: string[]): string => {
    return nodeIds.length > 0
      ? nodeIds.map((id) => formatNodeLabel(id)).join(', ')
      : 'None';
  };

  return createPortal(
    <div className={styles['solver-overlay']}>
      <div className={styles['solver-modal']} data-state={solverState}>
        {solverState === 'solving' && (
          <div className={styles['solving-container']}>
            <div className={styles['spinner-wrapper']}>
              <img src={INDUS_LOGO_SRC} className={styles['logo-spinner']} alt="Spinner" />
            </div>
            <div className={styles['elapsed-timer']}>
              {formatStopwatch(elapsedMs)}
            </div>
            <div className={styles['tip-box']}>
              <div className={styles['tip-label']}>TIPS & HINTS</div>
              <p className={styles['tip-text']}>{TIPS[tipIndex]}</p>
            </div>
            <button className={styles['action-btn-danger']} onClick={handleCancel}>
              Cancel Computation
            </button>
          </div>
        )}

        {solverState === 'failed' && (
          <div className={styles['failed-container']}>
            <div className={styles['modal-header']}>
              <span className={styles['modal-title']}>Solver Error</span>
            </div>
            <div className={styles['error-content']}>
              <p className={styles['error-message']}>{errorMsg}</p>
              {failureDiagnostics && (
                <div className={styles['diagnostics-content']}>
                  <div className={styles['diagnostic-summary']}>
                    {formatDeficiencyHeadline(failureDiagnostics)}
                  </div>
                  {failureDiagnostics.rootCauses.length > 0 && (
                    <div className={styles['diagnostic-group']}>
                      <div className={styles['diagnostic-title']}>Root causes</div>
                      <div className={styles['deficiency-cards']}>
                        {failureDiagnostics.rootCauses.slice(0, 4).map((cause) => (
                          <div
                            className={styles['deficiency-card']}
                            key={[
                              cause.kind,
                              cause.nodeId,
                              cause.outputIndex ?? 'input',
                              cause.productId,
                            ].join('-')}
                          >
                            <div className={styles['deficiency-card-header']}>
                              <span className={styles['deficiency-node-name']}>
                                {formatNodeLabel(cause.nodeId)}
                              </span>
                              <span className={styles['deficiency-rate']}>
                                {formatRate(cause.deficiency)}
                              </span>
                            </div>
                            <div className={styles['deficiency-card-meta']}>
                              <span>Cause: {formatCauseLabel(cause.kind)}</span>
                              <span>Product: {getProductName(cause.productId)}</span>
                              <span>{formatRootCauseRate(cause)}</span>
                              <span>
                                Blocks:
                                {' '}
                                {formatNodeLabel(cause.blockedInputNodeId)}
                                {' '}
                                input {cause.blockedInputIndex + 1}
                              </span>
                              {cause.boundaryNodeIds.length > 0 && (
                                <span>
                                  Loop Boundary:
                                  {' '}
                                  {formatNodeList(cause.boundaryNodeIds)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {failureDiagnostics.rootCauses.length === 0 &&
                    failureDiagnostics.likelyRootNodeIds.length > 0 && (
                    <div className={styles['diagnostic-group']}>
                      <div className={styles['diagnostic-title']}>Likely upstream causes</div>
                      <ul className={styles['diagnostic-list']}>
                        {failureDiagnostics.likelyRootNodeIds.slice(0, 4).map((nodeId) => (
                          <li key={`root-${nodeId}`}>{formatNodeLabel(nodeId)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={styles['elapsed-summary']}>Elapsed: {formatStopwatch(elapsedMs)}</div>
            <div className={styles['modal-footer']}>
              <button className={styles['action-btn-neutral']} onClick={handleCancel}>
                Close
              </button>
            </div>
          </div>
        )}

        {solverState === 'results' && (
          <div className={styles['results-container']}>
            <div className={styles['modal-header']}>
              <span className={styles['modal-title']}>Solver Results</span>
            </div>

            <div className={styles['results-content']}>
              {changes.length === 0 ? (
                <div className={styles['no-changes-msg']}>
                  No changes required. The current machine counts are already fully balanced!
                </div>
              ) : (
                <>
                  <div className={styles['changes-table-wrapper']}>
                    <table className={styles['changes-table']}>
                      <thead>
                        <tr>
                          <th>Recipe Node</th>
                          <th className={styles['align-right']}>Current</th>
                          <th className={styles['align-center']}></th>
                          <th className={styles['align-left']}>Proposed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((c) => (
                          <tr key={c.id}>
                            <td>{c.recipeName}</td>
                            <td className={styles['align-right']}>{c.currentCount.toFixed(2)}</td>
                            <td className={styles['align-center']}>&rarr;</td>
                            <td className={styles['align-left']}>{c.proposedCount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles['metrics-summary']}>
                    <div className={styles['metric-row']}>
                      <span>Total Power:</span>
                      <span>
                        {formatPower(currentPowerTotal)} &rarr; {formatPower(proposedPowerTotal)}
                        {proposedPowerTotal > currentPowerTotal ? ' (+' : ' ('}
                        {formatPower(proposedPowerTotal - currentPowerTotal)})
                      </span>
                    </div>
                    <div className={styles['metric-row']}>
                      <span>Total Pollution:</span>
                      <span>
                        {formatPollution(currentPollutionTotal)} &rarr; {formatPollution(proposedPollutionTotal)}
                        {proposedPollutionTotal > currentPollutionTotal ? ' (+' : ' ('}
                        {formatPollution(proposedPollutionTotal - currentPollutionTotal)})
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className={styles['elapsed-summary']}>Elapsed: {formatStopwatch(elapsedMs)}</div>

            <div className={styles['modal-footer']}>
              <button className={styles['action-btn-neutral']} onClick={handleCancel}>
                Discard Changes
              </button>
              {changes.length > 0 && (
                <button className={styles['action-btn-primary']} onClick={handleApply}>
                  Apply Changes
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
