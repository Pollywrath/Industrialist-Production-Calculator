import { type CSSProperties } from 'react';
import { useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import type { GroupNodeType } from '../../../types/nodes';
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  GROUP_HEADER_HEIGHT,
} from '../../../utils/groupBounds';
import { GroupNodeEditor } from '../../overlays/GroupNodeEditor';
import styles from './GroupNode.module.css';

export function GroupNode({ id, data, height, width }: NodeProps<GroupNodeType>) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const updateGroupNodeData = useFlowStore((s) => s.updateGroupNodeData);
  const style = {
    '--group-height': `${height ?? EMPTY_GROUP_HEIGHT}px`,
    '--group-header-height': `${GROUP_HEADER_HEIGHT}px`,
    '--group-width': `${width ?? EMPTY_GROUP_WIDTH}px`,
  } as CSSProperties;

  return (
    <>
      <div className={styles['group-node']} style={style}>
        <div className={styles['group-node__boundary']}>
          <div className={styles['group-node__header']}>
            <button
              className={styles['group-node__bar']}
              onClick={(event) => {
                event.stopPropagation();
                if (!data.collapsed) {
                  updateGroupNodeData(id, { collapsed: true });
                }
              }}
            >
              <span className={styles['group-node__label']}>{data.label}</span>
              <span className={styles['group-node__chevron']}>
                <ChevronDown size={14} />
              </span>
            </button>
            <button
              className={`${styles['group-node__edit-button']} nodrag`}
              onClick={(event) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) return;
                event.stopPropagation();
                setIsEditorOpen(true);
              }}
            >
              <Ellipsis size={14} />
            </button>
          </div>
        </div>
      </div>

      {isEditorOpen && (
        <GroupNodeEditor initialData={data} nodeId={id} onClose={() => setIsEditorOpen(false)} />
      )}
    </>
  );
}
