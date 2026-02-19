import React, { useMemo, useState, useRef, useCallback, memo } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';

// Catmull-Rom spline through all points. With 2 points it produces a standard
// cubic bezier S-curve using horizontal control points.
const catmullRomPath = (points) => {
  if (points.length < 2) return '';
  if (points.length === 2) {
    const ddx = points[1].x - points[0].x;
    const cp1x = points[0].x + ddx / 3;
    const cp2x = points[1].x - ddx / 3;
    return `M ${points[0].x} ${points[0].y} C ${cp1x} ${points[0].y} ${cp2x} ${points[1].y} ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
};

// Distance from point p to segment a→b
const distToSegment = (p, a, b) => {
  const ddx = b.x - a.x;
  const ddy = b.y - a.y;
  const lenSq = ddx * ddx + ddy * ddy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ddx + (p.y - a.y) * ddy) / lenSq));
  return Math.hypot(p.x - (a.x + t * ddx), p.y - (a.y + t * ddy));
};

// Finds the best segment gap to insert a new bezier waypoint into
const findInsertionIndex = (newPoint, allPoints) => {
  let minDist = Infinity;
  let bestIdx = 1;
  for (let i = 0; i < allPoints.length - 1; i++) {
    const dist = distToSegment(newPoint, allPoints[i], allPoints[i + 1]);
    if (dist < minDist) { minDist = dist; bestIdx = i + 1; }
  }
  return bestIdx;
};

// Guards against two edges starting drags simultaneously, and against
// canvas pan events being misread as edge drags
let globalEdgeDragging = false;
let globalCanvasBusy = false;
export const setCanvasBusy = (busy) => { globalCanvasBusy = busy; };

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, data, selected }) => {
  const edgePath = data?.edgePath || 'orthogonal';
  const edgeStyle = data?.edgeStyle || 'animated';
  const bezierPoints = data?.bezierPoints ?? [];
  const orthoMidX = data?.orthoMidX ?? null;
  const orthoMidY = data?.orthoMidY ?? null;

  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [midlinePos, setMidlinePos] = useState(null);
  const [hoverCursorPos, setHoverCursorPos] = useState(null);

  const isDragging = useRef(false);
  const dragStartPos = useRef(null);
  const activeBezierIdx = useRef(-1);
  const bezierPathRef = useRef(null);
  const snappedCurvePos = useRef(null);
  const rafHandle = useRef(null);

  const { setEdges, screenToFlowPosition } = useReactFlow();
  const isDraggingNode = useStore(s => s.nodes.some(n => n.dragging));
  const isConnecting = useStore(s => s.connectionNodeId != null);

  const dx = targetX - sourceX;
  const isBackward = edgePath === 'orthogonal' && dx < 60;
  const BACKWARD_EXIT_GAP = 40;

  // For forward orthogonal: clamp midX so the vertical segment stays between source and target
  const computedMidX = useMemo(() => {
    if (isBackward) return null;
    if (orthoMidX !== null) {
      const lo = Math.min(sourceX, targetX) + 20;
      const hi = Math.max(sourceX, targetX) - 20;
      return Math.max(lo, Math.min(hi, orthoMidX));
    }
    return (sourceX + targetX) / 2;
  }, [sourceX, targetX, orthoMidX, isBackward]);

  // For backward orthogonal: midY is the Y of the draggable horizontal bypass segment
  const computedMidY = useMemo(() => {
    if (!isBackward) return null;
    return orthoMidY ?? (sourceY + targetY) / 2;
  }, [sourceY, targetY, orthoMidY, isBackward]);

  const { pathD, handlePos, midlineSegment } = useMemo(() => {
    if (edgePath === 'straight') {
      return { pathD: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`, handlePos: null };
    }

    if (edgePath === 'bezier') {
      const allPoints = [{ x: sourceX, y: sourceY }, ...bezierPoints, { x: targetX, y: targetY }];
      return { pathD: catmullRomPath(allPoints), handlePos: null, midlineSegment: null };
    }

    // Orthogonal backward: Z-shaped path that hooks behind both nodes
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

    // Orthogonal forward: 3-segment elbow path
    return {
      pathD: `M ${sourceX} ${sourceY} L ${computedMidX} ${sourceY} L ${computedMidX} ${targetY} L ${targetX} ${targetY}`,
      handlePos: { x: computedMidX, y: (sourceY + targetY) / 2 },
      midlineSegment: {
        pathD: `M ${computedMidX} ${Math.min(sourceY, targetY)} L ${computedMidX} ${Math.max(sourceY, targetY)}`,
        clampMinY: Math.min(sourceY, targetY),
        clampMaxY: Math.max(sourceY, targetY),
      },
    };
  }, [edgePath, sourceX, sourceY, targetX, targetY, bezierPoints, computedMidX, computedMidY, isBackward]);

  // Keeps the visible drag handle snapped within the draggable segment's bounds
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

  // Walks the rendered SVG path in screen space to find the nearest point on the curve.
  // Used to snap the ghost dot and new waypoints exactly onto the visible curve.
  const getClosestPointOnCurve = useCallback((clientX, clientY) => {
    const pathEl = bezierPathRef.current;
    if (!pathEl) return null;
    const totalLength = pathEl.getTotalLength();
    if (totalLength === 0) return null;
    const ctm = pathEl.getScreenCTM();
    if (!ctm) return null;

    const samples = Math.min(120, Math.ceil(totalLength / 8) + 20);
    let bestScreenDist = Infinity;
    let bestFlowPoint = null;

    for (let i = 0; i <= samples; i++) {
      const svgPt = pathEl.getPointAtLength((i / samples) * totalLength);
      const screenX = ctm.a * svgPt.x + ctm.c * svgPt.y + ctm.e;
      const screenY = ctm.b * svgPt.x + ctm.d * svgPt.y + ctm.f;
      const dist = Math.hypot(screenX - clientX, screenY - clientY);
      if (dist < bestScreenDist) {
        bestScreenDist = dist;
        bestFlowPoint = { x: svgPt.x, y: svgPt.y };
      }
    }

    return { screenDist: bestScreenDist, flowPoint: bestFlowPoint };
  }, []);

  const startDrag = useCallback((e, type, pointIdx = -1) => {
    if (e.button !== 0) return;
    if (globalCanvasBusy || (globalEdgeDragging && !isDragging.current)) return;
    e.stopPropagation();
    e.preventDefault();

    // For new bezier points, snap to the curve rather than using raw cursor position
    const rawPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const initPos = (type === 'bezier-new' && snappedCurvePos.current) ? snappedCurvePos.current : rawPos;

    dragStartPos.current = initPos;
    setMidlinePos(initPos);
    isDragging.current = true;
    setDragging(true);
    globalEdgeDragging = true;

    if (type === 'bezier-new') {
      setEdges(eds => eds.map(edge => {
        if (edge.id !== id) return edge;
        const existingPts = edge.data.bezierPoints || [];
        const allPts = [{ x: sourceX, y: sourceY }, ...existingPts, { x: targetX, y: targetY }];
        const insertIdx = findInsertionIndex(initPos, allPts) - 1;
        activeBezierIdx.current = insertIdx;
        const newPts = [...existingPts];
        newPts.splice(insertIdx, 0, { x: initPos.x, y: initPos.y });
        return { ...edge, data: { ...edge.data, bezierPoints: newPts } };
      }));
    } else if (type === 'bezier-move') {
      activeBezierIdx.current = pointIdx;
    }

    const onMove = (me) => {
      if (!isDragging.current) return;
      const fp = screenToFlowPosition({ x: me.clientX, y: me.clientY });
      setEdges(eds => eds.map(edge => {
        if (edge.id !== id) return edge;
        if (type === 'bezier-new' || type === 'bezier-move') {
          const idx = activeBezierIdx.current;
          if (idx < 0) return edge;
          const pts = [...(edge.data.bezierPoints || [])];
          if (idx >= pts.length) return edge;
          pts[idx] = { x: fp.x, y: fp.y };
          return { ...edge, data: { ...edge.data, bezierPoints: pts } };
        }
        if (type === 'ortho') return { ...edge, data: { ...edge.data, orthoMidX: fp.x } };
        if (type === 'orthoY') return { ...edge, data: { ...edge.data, orthoMidY: fp.y } };
        return edge;
      }));
    };

    const onUp = () => {
      isDragging.current = false;
      setDragging(false);
      globalEdgeDragging = false;
      dragStartPos.current = null;
      activeBezierIdx.current = -1;
      setMidlinePos(null);
      setHoverCursorPos(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, sourceX, sourceY, targetX, targetY, setEdges, screenToFlowPosition]);

  // Ctrl/Cmd+click or double-click to remove a waypoint
  const removePoint = useCallback((idx) => {
    setEdges(eds => eds.map(edge => {
      if (edge.id !== id) return edge;
      const pts = (edge.data.bezierPoints || []).filter((_, i) => i !== idx);
      return { ...edge, data: { ...edge.data, bezierPoints: pts } };
    }));
  }, [id, setEdges]);

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
      {/* Visible edge */}
      <path id={id} className={className} d={pathD} fill="none" />
      {/* Wider invisible stroke for easier hover/click targeting */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} pointerEvents="stroke" />

      {/* Bezier mode: curve interaction layer */}
      {edgePath === 'bezier' && (
        <>
          {/* Narrow hit path — pointerEvents="stroke" prevents it eating the canvas fill area.
              Proximity to the actual curve is validated in screen space via getClosestPointOnCurve
              so clicks well away from the visible line are rejected. */}
          <path
            ref={bezierPathRef}
            d={pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={6}
            style={{ cursor: hoverCursorPos ? 'crosshair' : 'default' }}
            pointerEvents="stroke"
            onMouseMove={(e) => {
              if (globalCanvasBusy || (globalEdgeDragging && !isDragging.current)) return;
              const cx = e.clientX;
              const cy = e.clientY;
              // Throttle to one check per animation frame
              if (rafHandle.current) return;
              rafHandle.current = requestAnimationFrame(() => {
                rafHandle.current = null;
                const result = getClosestPointOnCurve(cx, cy);
                if (result && result.screenDist <= 5) {
                  snappedCurvePos.current = result.flowPoint;
                  setHoverCursorPos(result.flowPoint);
                } else {
                  snappedCurvePos.current = null;
                  setHoverCursorPos(null);
                }
              });
            }}
            onMouseLeave={() => {
              if (!isDragging.current) {
                if (rafHandle.current) { cancelAnimationFrame(rafHandle.current); rafHandle.current = null; }
                setHoverCursorPos(null);
                snappedCurvePos.current = null;
              }
            }}
            onMouseDown={(e) => {
              if (!snappedCurvePos.current) return;
              startDrag(e, 'bezier-new');
            }}
          />

          {/* Ghost dot snapped to the nearest point on the curve */}
          {hoverCursorPos && !dragging && (
            <circle
              cx={hoverCursorPos.x} cy={hoverCursorPos.y} r={5}
              fill="var(--color-primary)" opacity={0.5}
              pointerEvents="none"
            />
          )}

          {/* Existing waypoint handles — visible when hovered/selected/dragging */}
          {(hovered || selected || dragging) && bezierPoints.map((pt, idx) => (
            <g key={idx}>
              <circle
                cx={pt.x} cy={pt.y} r={6}
                fill="var(--bg-secondary)" stroke="var(--color-primary)" strokeWidth={2}
                style={{ cursor: 'grab' }} pointerEvents="all"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.ctrlKey || e.metaKey) { removePoint(idx); return; }
                  startDrag(e, 'bezier-move', idx);
                }}
                onDoubleClick={(e) => { e.stopPropagation(); removePoint(idx); }}
              />
              {/* Larger invisible hit zone so the point is easy to grab */}
              <circle
                cx={pt.x} cy={pt.y} r={20}
                fill="transparent" stroke="none" pointerEvents="all"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => { if (!isDragging.current) setHovered(false); }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.ctrlKey || e.metaKey) { removePoint(idx); return; }
                  startDrag(e, 'bezier-move', idx);
                }}
                onDoubleClick={(e) => { e.stopPropagation(); removePoint(idx); }}
              />
            </g>
          ))}
        </>
      )}

      {/* Orthogonal mode: draggable midline segment handle */}
      {edgePath === 'orthogonal' && handlePos && midlineSegment && (
        <>
          {/* Invisible hit zone along the draggable segment */}
          <path
            d={midlineSegment.pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={16}
            style={{ cursor: isBackward ? 'ns-resize' : 'ew-resize' }}
            pointerEvents="stroke"
            onMouseMove={(e) => {
              if (globalCanvasBusy || (globalEdgeDragging && !isDragging.current)) return;
              setMidlinePos(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
            }}
            onMouseLeave={() => { if (!isDragging.current) setMidlinePos(null); }}
            onMouseDown={(e) => startDrag(e, isBackward ? 'orthoY' : 'ortho')}
          />
          {/* Visual pill handle that follows the cursor along the segment */}
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