import type { Recipe } from '../../../types/data';
import { HandleRow } from './HandleRow';
import styles from './NodeEditor.module.css';
import { useNodeEditorStore } from './NodeEditorContext';

interface HandleEditorColumnsProps {
  recipe: Recipe;
  multiplier: number;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  nodeId: string;
}

export function HandleEditorColumns({
  recipe,
  multiplier,
  rateMode,
  nodeId,
}: HandleEditorColumnsProps) {
  const inputs = useNodeEditorStore((s) => s.inputs);
  const outputs = useNodeEditorStore((s) => s.outputs);

  return (
    <div className={styles['node-editor-columns']}>
      <div className={styles['node-editor-column']}>
        <h3>Input Handles</h3>
        <div className={styles['node-editor-list']}>
          {inputs.map((idx, listIdx) => (
            <HandleRow
              key={`input-${idx}`}
              nodeId={nodeId}
              recipe={recipe}
              side="input"
              index={idx}
              listIdx={listIdx}
              totalLength={inputs.length}
              multiplier={multiplier}
              rateMode={rateMode}
            />
          ))}
          {inputs.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
        </div>
      </div>

      <div className={styles['node-editor-column']}>
        <h3>Output Handles</h3>
        <div className={styles['node-editor-list']}>
          {outputs.map((idx, listIdx) => (
            <HandleRow
              key={`output-${idx}`}
              nodeId={nodeId}
              recipe={recipe}
              side="output"
              index={idx}
              listIdx={listIdx}
              totalLength={outputs.length}
              multiplier={multiplier}
              rateMode={rateMode}
            />
          ))}
          {outputs.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
        </div>
      </div>
    </div>
  );
}
