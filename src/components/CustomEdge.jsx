import React, { useMemo, useState, useRef, useCallback, memo } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';

let globalEdgeDragging = false;
let globalCanvasBusy = false;
export const setCanvasBusy = (busy) => { globalCanvasBusy = busy; };

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }) => {
  const edgePath = data?.edgePath || 'orthogonal';
  const edgeStyle = data?.edgeStyle || 'animated';
  const bezierOffset = data?.bezierOffset ?? { x: 0, y: 0 };
  const orthoMidX = data?.orthoMidX ?? null;
  const orthoMidY = data?.orthoMidY ?? null;

  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [midlinePos, setMidlinePos] = useState(null);
  const isDragging = useRef(false);
  const dragStartPos = useRef(null);
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const isDraggingNode = useStore(s => s.nodes.some(n => n.dragging));
  const isConnecting = useStore(s => s.connectionNodeId != null);

  const showHandles = (hovered || selected || dragging) && !isDraggingNode && !isConnecting;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  const isBackward = edgePath === 'orthogonal' && dx < 60;
  const BACKWARD_EXIT_GAP = 40;

  // For forward orthogonal: clamp midX between source and target
  const computedMidX = useMemo(() => {
    if (isBackward) return null;
    if (orthoMidX !== null) {
      const lo = Math.min(sourceX, targetX) + 20;
      const hi = Math.max(sourceX, targetX) - 20;
      return Math.max(lo, Math.min(hi, orthoMidX));
    }
    return (sourceX + targetX) / 2;
  }, [sourceX, targetX, orthoMidX, isBackward]);

  // For backward orthogonal: midY is the Y of the draggable middle horizontal segment
  const computedMidY = useMemo(() => {
    if (!isBackward) return null;
    return orthoMidY ?? (sourceY + targetY) / 2;
  }, [sourceY, targetY, orthoMidY, isBackward]);

  const { pathD, handlePos, midlineSegment } = useMemo(() => {
    if (edgePath === 'straight') {
      return {
        pathD: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
        handlePos: null,
      };
    }

    if (edgePath === 'bezier') {
      const cp1x = sourceX + dx / 3 + bezierOffset.x;
      const cp1y = sourceY + dy / 3 + bezierOffset.y;
      const cp2x = sourceX + (2 * dx) / 3 + bezierOffset.x;
      const cp2y = sourceY + (2 * dy) / 3 + bezierOffset.y;
      return {
        pathD: `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${targetX} ${targetY}`,
        handlePos: {
          x: (sourceX + targetX) / 2 + bezierOffset.x,
          y: (sourceY + targetY) / 2 + bezierOffset.y,
        },
      };
    }

    // Orthogonal backward: 5-segment S/Z path hooking past both nodes
    if (isBackward) {
      const exitX = sourceX + BACKWARD_EXIT_GAP;
      const entryX = targetX - BACKWARD_EXIT_GAP;
      const midY = computedMidY;
      return {
        pathD: `M ${sourceX} ${sourceY} L ${exitX} ${sourceY} L ${exitX} ${midY} L ${entryX} ${midY} L ${entryX} ${targetY} L ${targetX} ${targetY}`,
        handlePos: { x: (exitX + entryX) / 2, y: midY },
        midlineSegment: {
          pathD: `M ${exitX} ${midY} L ${entryX} ${midY}`,
          clampMinX: Math.min(exitX, entryX),
          clampMaxX: Math.max(exitX, entryX),
        },
      };
    }

    // Orthogonal forward: 3-segment path
    return {
      pathD: `M ${sourceX} ${sourceY} L ${computedMidX} ${sourceY} L ${computedMidX} ${targetY} L ${targetX} ${targetY}`,
      handlePos: { x: computedMidX, y: (sourceY + targetY) / 2 },
      midlineSegment: {
        pathD: `M ${computedMidX} ${Math.min(sourceY, targetY)} L ${computedMidX} ${Math.max(sourceY, targetY)}`,
        clampMinY: Math.min(sourceY, targetY),
        clampMaxY: Math.max(sourceY, targetY),
      },
    };
  }, [edgePath, sourceX, sourceY, targetX, targetY, dx, dy, bezierOffset, computedMidX, computedMidY, isBackward]);

  const displayHandlePos = useMemo(() => {
    if (!handlePos) return null;
    const pos = dragging ? dragStartPos.current : midlinePos;
    if (!pos || !midlineSegment) return handlePos;
    if (isBackward) {
      return {
        x: Math.max(midlineSegment.clampMinX, Math.min(midlineSegment.clampMaxX, pos.x)),
        y: handlePos.y,
      };
    }
    return {
      x: handlePos.x,
      y: Math.max(midlineSegment.clampMinY, Math.min(midlineSegment.clampMaxY, pos.y)),
    };
  }, [dragging, midlinePos, midlineSegment, handlePos, isBackward]);

  const startDrag = useCallback((e, type) => {
    if (e.button !== 0) return;
    if (globalCanvasBusy || (globalEdgeDragging && !isDragging.current)) return;
    e.stopPropagation();
    e.preventDefault();
    const initPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    dragStartPos.current = initPos;
    setMidlinePos(initPos);
    isDragging.current = true;
    setDragging(true);
    globalEdgeDragging = true;

    const onMove = (me) => {
      if (!isDragging.current) return;
      const fp = screenToFlowPosition({ x: me.clientX, y: me.clientY });
      setEdges(eds => eds.map(edge => {
        if (edge.id !== id) return edge;
        if (type === 'bezier') {
          return {
            ...edge,
            data: {
              ...edge.data,
              bezierOffset: {
                x: fp.x - (sourceX + targetX) / 2,
                y: fp.y - (sourceY + targetY) / 2,
              },
            },
          };
        }
        if (type === 'ortho') {
          return { ...edge, data: { ...edge.data, orthoMidX: fp.x } };
        }
        if (type === 'orthoY') {
          return { ...edge, data: { ...edge.data, orthoMidY: fp.y } };
        }
        return edge;
      }));
    };

    const onUp = () => {
      isDragging.current = false;
      setDragging(false);
      globalEdgeDragging = false;
      dragStartPos.current = null;
      setMidlinePos(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, sourceX, sourceY, targetX, targetY, setEdges, screenToFlowPosition]);

  const className = edgeStyle === 'animated'
    ? 'custom-edge custom-edge-animated'
    : edgeStyle === 'dashed'
    ? 'custom-edge custom-edge-dashed'
    : 'custom-edge custom-edge-solid';

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!isDragging.current) setHovered(false); }}
    >
      {/* Visible edge path */}
      <path id={id} className={className} d={pathD} fill="none" />
      {/* Wide invisible hit area for easier hovering/clicking */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />

      {/* Bezier control handle */}
      {edgePath === 'bezier' && handlePos && (
        <>
          {showHandles && (
            <>
              <line
                x1={sourceX} y1={sourceY} x2={handlePos.x} y2={handlePos.y}
                stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="3 3"
                opacity={0.4} pointerEvents="none"
              />
              <line
                x1={targetX} y1={targetY} x2={handlePos.x} y2={handlePos.y}
                stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="3 3"
                opacity={0.4} pointerEvents="none"
              />
              <circle
                cx={handlePos.x} cy={handlePos.y} r={6}
                fill="var(--bg-secondary)" stroke="var(--color-primary)" strokeWidth={2}
                style={{ cursor: 'grab' }} pointerEvents="all"
                onMouseDown={(e) => startDrag(e, 'bezier')}
              />
            </>
          )}
          {/* Large invisible hit zone on handle so hover is maintained when moving toward it */}
          <circle
            cx={handlePos.x} cy={handlePos.y} r={28}
            fill="transparent" stroke="none" pointerEvents="all"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { if (!isDragging.current) setHovered(false); }}
            onMouseDown={(e) => startDrag(e, 'bezier')}
          />
        </>
      )}

      {/* Orthogonal segment handle */}
      {edgePath === 'orthogonal' && handlePos && midlineSegment && (
        <>
          {/* Invisible midline hit zone — tracks cursor, triggers drag */}
          <path
            d={midlineSegment.pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ cursor: isBackward ? 'ns-resize' : 'ew-resize' }}
            pointerEvents="all"
            onMouseMove={(e) => {
              if (globalCanvasBusy || (globalEdgeDragging && !isDragging.current)) return;
              const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY });
              setMidlinePos(fp);
            }}
            onMouseLeave={() => { if (!isDragging.current) setMidlinePos(null); }}
            onMouseDown={(e) => startDrag(e, isBackward ? 'orthoY' : 'ortho')}
          />
          {/* Visual handle at cursor position — purely decorative, pointer events on path above */}
          {(midlinePos !== null || dragging) && !isDraggingNode && !isConnecting && displayHandlePos && (
            isBackward ? (
              <rect
                x={displayHandlePos.x - 14} y={displayHandlePos.y - 5}
                width={28} height={10} rx={3}
                fill="var(--bg-secondary)" stroke="var(--color-primary)" strokeWidth={2}
                style={{ cursor: 'ns-resize' }} pointerEvents="none"
              />
            ) : (
              <rect
                x={displayHandlePos.x - 5} y={displayHandlePos.y - 14}
                width={10} height={28} rx={3}
                fill="var(--bg-secondary)" stroke="var(--color-primary)" strokeWidth={2}
                style={{ cursor: 'ew-resize' }} pointerEvents="none"
              />
            )
          )}
        </>
      )}
    </g>
  );
};

export default memo(CustomEdge);