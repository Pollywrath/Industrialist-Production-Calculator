import type { Recipe } from '../../../types/data';
import { HandleRow } from './HandleRow';
import styles from './NodeEditor.module.css';

interface HandleEditorColumnsProps {
  recipe: Recipe;
  multiplier: number;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  inputs: number[];
  setInputs: (v: number[]) => void;
  outputs: number[];
  setOutputs: (v: number[]) => void;
  qtyStrMap: Record<string, string>;
  setQtyStrMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMachineCount: (v: number) => void;
  setMachineCountStr: (v: string) => void;
}

export function HandleEditorColumns({
  recipe,
  multiplier,
  rateMode,
  inputs,
  setInputs,
  outputs,
  setOutputs,
  qtyStrMap,
  setQtyStrMap,
  setMachineCount,
  setMachineCountStr,
}: HandleEditorColumnsProps) {
  return (
    <div className={styles['node-editor-columns']}>
      <div className={styles['node-editor-column']}>
        <h3>Input Handles</h3>
        <div className={styles['node-editor-list']}>
          {inputs.map((idx, listIdx) => (
            <HandleRow
              key={`input-${idx}`}
              recipe={recipe}
              side="input"
              index={idx}
              listIdx={listIdx}
              totalLength={inputs.length}
              multiplier={multiplier}
              rateMode={rateMode}
              qtyStrMap={qtyStrMap}
              setQtyStrMap={setQtyStrMap}
              setMachineCount={setMachineCount}
              setMachineCountStr={setMachineCountStr}
              inputs={inputs}
              setInputs={setInputs}
              outputs={outputs}
              setOutputs={setOutputs}
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
              recipe={recipe}
              side="output"
              index={idx}
              listIdx={listIdx}
              totalLength={outputs.length}
              multiplier={multiplier}
              rateMode={rateMode}
              qtyStrMap={qtyStrMap}
              setQtyStrMap={setQtyStrMap}
              setMachineCount={setMachineCount}
              setMachineCountStr={setMachineCountStr}
              inputs={inputs}
              setInputs={setInputs}
              outputs={outputs}
              setOutputs={setOutputs}
            />
          ))}
          {outputs.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
        </div>
      </div>
    </div>
  );
}
