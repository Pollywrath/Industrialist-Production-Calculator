import React, { useMemo, useState, useRef, useCallback, memo } from 'react';
import { getSmoothStepPath, useReactFlow } from '@xyflow/react';

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }) => {
  const edgePath = data?.edgePath || 'orthogonal';
  const edgeStyle = data?.edgeStyle || 'animated';
  const bezierOffset = data?.bezierOffset ?? { x: 0, y: 0 };
  const orthoMidX = data?.orthoMidX ?? null;

  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  const { setEdges, screenToFlowPosition } = useReactFlow();

  const showHandles = hovered || selected;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  // For orthogonal, clamp midX to stay between source and target with a margin
  const computedMidX = useMemo(() => {
    const margin = Math.max(20, Math.abs(dx) * 0.08);
    const lo = Math.min(sourceX, targetX) + margin;
    const hi = Math.max(sourceX, targetX) - margin;
    if (orthoMidX === null) return (sourceX + targetX) / 2;
    return Math.max(lo, Math.min(hi, orthoMidX));
  }, [sourceX, targetX, orthoMidX, dx]);

  // Orthogonal falls back to smoothstep for backward/short edges
  const useOrthoFallback = edgePath === 'orthogonal' && dx < 60;

  const { pathD, handlePos } = useMemo(() => {
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

    // Orthogonal
    if (useOrthoFallback) {
      const [p] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
      return { pathD: p, handlePos: null };
    }

    return {
      pathD: `M ${sourceX} ${sourceY} L ${computedMidX} ${sourceY} L ${computedMidX} ${targetY} L ${targetX} ${targetY}`,
      handlePos: { x: computedMidX, y: (sourceY + targetY) / 2 },
    };
  }, [edgePath, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, dx, dy, bezierOffset, computedMidX, useOrthoFallback]);

  const startDrag = useCallback((e, type) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;

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
        return edge;
      }));
    };

    const onUp = () => {
      isDragging.current = false;
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
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Visible edge path */}
      <path id={id} className={className} d={pathD} fill="none" />
      {/* Wide invisible hit area for easier hovering/clicking */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer' }} />

      {/* Bezier control handle */}
      {showHandles && edgePath === 'bezier' && handlePos && (
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
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => startDrag(e, 'bezier')}
          />
        </>
      )}

      {/* Orthogonal segment handle (drag left/right to move the vertical segment) */}
      {showHandles && edgePath === 'orthogonal' && !useOrthoFallback && handlePos && (
        <rect
          x={handlePos.x - 5} y={handlePos.y - 14}
          width={10} height={28} rx={3}
          fill="var(--bg-secondary)" stroke="var(--color-primary)" strokeWidth={2}
          style={{ cursor: 'ew-resize' }}
          onMouseDown={(e) => startDrag(e, 'ortho')}
        />
      )}
    </g>
  );
};

export default memo(CustomEdge);