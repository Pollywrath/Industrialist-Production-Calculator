import type { CSSProperties } from 'react';
import type { HandleRef } from '../../../types/nodes';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import { formatQuantity } from '../../../utils/formatting/unitFormatting';
import styles from './RecipeNode.module.css';

interface PortSummaryRectProps {
  refVal: HandleRef;
  nodeId: string;
  width: number;
  label: string;
  totalQty: number;
  onClick: (ref: HandleRef) => void;
  className?: string;
}

export function PortSummaryRect({
  refVal,
  nodeId,
  width,
  label,
  totalQty,
  onClick,
  className = '',
}: PortSummaryRectProps) {
  return (
    <div className={styles['recipe-node-io__rect-wrapper']}>
      <div
        className={`${styles['recipe-node-io__rect']} ${styles[`recipe-node-io__rect--${refVal.side}`]} ${className}`}
        style={{ '--rect-width': `${width}px` } as CSSProperties}
        data-tutorial-rect-node-id={nodeId}
        data-tutorial-rect-side={refVal.side}
        data-tutorial-rect-index={refVal.index}
        onClick={(event) => {
          if (getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') return;
          event.stopPropagation();
          onClick(refVal);
        }}
      >
        <span className={styles['recipe-node-io__rect-text']}>
          {formatQuantity(totalQty)}x {label}
        </span>
      </div>
    </div>
  );
}
