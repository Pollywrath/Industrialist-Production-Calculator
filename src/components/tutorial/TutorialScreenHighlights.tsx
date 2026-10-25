import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TutorialHighlight } from '../../tutorials/types';
import { getCanvasAdapter, subscribeCanvasAdapter } from '../../canvas/canvasAdapterApi';
import { useTutorialStore } from '../../stores/useTutorialStore';
import {
  getElementForTutorialHighlight,
  getSecondaryTutorialHighlights,
  isTutorialFlowHighlight,
  resolvePixiTutorialGeometry,
  TUTORIAL_DRIVER_REFRESH_EVENT,
  getOffscreenTutorialAnchor,
} from './tutorialHighlightUtils';
import styles from './TutorialScreenHighlights.module.css';

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: boolean;
  visible?: boolean;
  stepIndex?: number;
  targetKey?: string;
  cue?: { x: number; y: number; direction: 'up' | 'right' | 'down' | 'left' };
}

interface ScreenEdge {
  points: readonly { x: number; y: number }[];
  primary: boolean;
}

interface ScreenHighlights {
  rects: ScreenRect[];
  edges: ScreenEdge[];
}

const RECT_PADDING = 6;
const HANDLE_PADDING = 12;
const RETRY_DELAY_MS = 120;
const DRIVER_REFRESH_INTERVAL_MS = 40;

function paddedRect(
  bounds: { x: number; y: number; width: number; height: number },
  padding: number,
): ScreenRect {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.max(1, bounds.width + padding * 2),
    height: Math.max(1, bounds.height + padding * 2),
  };
}

function rectFromElement(element: Element, padding: number): ScreenRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return paddedRect(rect, padding);
}

function resolveDomEdge(
  highlight: TutorialHighlight,
  getNodeId: ReturnType<typeof useTutorialStore.getState>['getNodeId'],
): ScreenEdge | null {
  if (highlight.kind !== 'edge') return null;
  const sourceElement = getElementForTutorialHighlight(
    {
      kind: 'handle',
      alias: highlight.sourceAlias,
      side: 'output',
      index: highlight.sourceIndex,
    },
    getNodeId,
  );
  const targetElement = getElementForTutorialHighlight(
    {
      kind: 'handle',
      alias: highlight.targetAlias,
      side: 'input',
      index: highlight.targetIndex,
    },
    getNodeId,
  );
  if (!sourceElement || !targetElement) return null;
  const source = sourceElement.getBoundingClientRect();
  const target = targetElement.getBoundingClientRect();
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0)
    return null;
  return {
    points: [
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      { x: target.left + target.width / 2, y: target.top + target.height / 2 },
    ],
    primary: false,
  };
}

function resolveHighlights(
  primary: TutorialHighlight | null,
  secondary: TutorialHighlight[],
  getNodeId: ReturnType<typeof useTutorialStore.getState>['getNodeId'],
  currentStepIndex: number,
  targetKey: string,
): ScreenHighlights {
  const adapter = getCanvasAdapter();
  const isPixi = adapter?.canvasType === 'pixi';
  const rects: ScreenRect[] = [];
  const edges: ScreenEdge[] = [];
  const targets = [...(primary ? [primary] : []), ...secondary];

  for (let index = 0; index < targets.length; index++) {
    const highlight = targets[index];
    if (!highlight) continue;
    const isPrimary = index === 0 && primary !== null;

    if (isPixi && isTutorialFlowHighlight(highlight)) {
      const geometry = resolvePixiTutorialGeometry(highlight, getNodeId);
      if (!geometry) continue;
      const canvas = isPrimary
        ? document.querySelector('canvas[role="application"]')?.getBoundingClientRect()
        : null;
      const cue =
        canvas &&
        getOffscreenTutorialAnchor(geometry.bounds, {
          x: canvas.left,
          y: canvas.top,
          width: canvas.width,
          height: canvas.height,
        });
      if (cue) {
        rects.push({
          x: cue.x - 1,
          y: cue.y - 1,
          width: 2,
          height: 2,
          anchor: true,
          visible: false,
          stepIndex: currentStepIndex,
          targetKey,
          cue,
        });
        continue;
      }
      if (highlight.kind === 'edge' && geometry.points) {
        edges.push({ points: geometry.points, primary: isPrimary });
        if (isPrimary)
          rects.push({
            ...paddedRect(geometry.bounds, 1),
            anchor: true,
            visible: false,
            stepIndex: currentStepIndex,
            targetKey,
          });
      } else {
        rects.push({
          ...paddedRect(
            geometry.bounds,
            highlight.kind === 'handle' ? HANDLE_PADDING : RECT_PADDING,
          ),
          anchor: isPrimary,
          visible: true,
          stepIndex: isPrimary ? currentStepIndex : undefined,
          targetKey: isPrimary ? targetKey : undefined,
        });
      }
      continue;
    }

    if (isPrimary) continue;
    if (highlight.kind === 'edge') {
      const edge = resolveDomEdge(highlight, getNodeId);
      if (edge) edges.push(edge);
      continue;
    }
    const element = getElementForTutorialHighlight(highlight, getNodeId);
    if (!element) continue;
    const rect = rectFromElement(
      element,
      highlight.kind === 'handle' ? HANDLE_PADDING : RECT_PADDING,
    );
    if (rect) rects.push(rect);
  }

  return { rects, edges };
}

function sameHighlights(left: ScreenHighlights, right: ScreenHighlights): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function TutorialScreenHighlights() {
  const activeTutorialId = useTutorialStore((s) => s.activeTutorialId);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const aliases = useTutorialStore((s) => s.aliases);
  const getCurrentStep = useTutorialStore((s) => s.getCurrentStep);
  const getNodeId = useTutorialStore((s) => s.getNodeId);
  const retryRef = useRef<number | null>(null);
  const updateFrameRef = useRef<number | null>(null);
  const lastAnchorKeyRef = useRef<string | null>(null);
  const lastAnchorTargetKeyRef = useRef<string | null>(null);
  const driverRefreshTimerRef = useRef<number | null>(null);
  const lastDriverRefreshAtRef = useRef(0);
  const highlightsRef = useRef<ScreenHighlights>({ rects: [], edges: [] });
  const [adapterRevision, setAdapterRevision] = useState(0);
  const [screenHighlights, setScreenHighlights] = useState<ScreenHighlights>({
    rects: [],
    edges: [],
  });

  useEffect(() => subscribeCanvasAdapter(() => setAdapterRevision((value) => value + 1)), []);

  useEffect(
    () => () => {
      if (driverRefreshTimerRef.current !== null) {
        window.clearTimeout(driverRefreshTimerRef.current);
        driverRefreshTimerRef.current = null;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const clearRetry = () => {
      if (retryRef.current != null) {
        window.clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
    const adapter = getCanvasAdapter();
    const step = activeTutorialId ? getCurrentStep() : null;
    const secondaryHighlights = step ? getSecondaryTutorialHighlights(step) : [];
    const primaryHighlight =
      step && adapter?.canvasType === 'pixi' && isTutorialFlowHighlight(step.highlight)
        ? step.highlight
        : null;

    const updateHighlightsNow = () => {
      clearRetry();
      const next = resolveHighlights(
        primaryHighlight,
        secondaryHighlights,
        getNodeId,
        currentStepIndex,
        step ? `${activeTutorialId}:${currentStepIndex}:${step.id}` : '',
      );
      if (!sameHighlights(highlightsRef.current, next)) {
        highlightsRef.current = next;
        setScreenHighlights(next);
      }
      if (
        activeTutorialId &&
        (primaryHighlight !== null || secondaryHighlights.length > 0) &&
        next.rects.length + next.edges.length <
          secondaryHighlights.length + (primaryHighlight ? 1 : 0)
      ) {
        retryRef.current = window.setTimeout(updateHighlightsNow, RETRY_DELAY_MS);
      }
    };

    const scheduleHighlightsUpdate = () => {
      if (updateFrameRef.current !== null) return;
      updateFrameRef.current = window.requestAnimationFrame(() => {
        updateFrameRef.current = null;
        updateHighlightsNow();
      });
    };

    updateHighlightsNow();
    window.addEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, scheduleHighlightsUpdate);
    window.addEventListener('resize', scheduleHighlightsUpdate);
    const unsubscribeViewport = adapter?.subscribeViewport?.(scheduleHighlightsUpdate);
    const unsubscribeResize = adapter?.subscribeResize?.(scheduleHighlightsUpdate);
    const unsubscribeScene = adapter?.subscribeScene?.(scheduleHighlightsUpdate);

    return () => {
      clearRetry();
      if (updateFrameRef.current !== null) {
        window.cancelAnimationFrame(updateFrameRef.current);
        updateFrameRef.current = null;
      }
      window.removeEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, scheduleHighlightsUpdate);
      window.removeEventListener('resize', scheduleHighlightsUpdate);
      unsubscribeViewport?.();
      unsubscribeResize?.();
      unsubscribeScene?.();
    };
  }, [activeTutorialId, currentStepIndex, aliases, adapterRevision, getCurrentStep, getNodeId]);

  useLayoutEffect(() => {
    const anchor = screenHighlights.rects.find((rect) => rect.anchor);
    const anchorKey = anchor
      ? [
          anchor.targetKey,
          anchor.x,
          anchor.y,
          anchor.width,
          anchor.height,
          anchor.cue?.x,
          anchor.cue?.y,
          anchor.cue?.direction,
        ].join(':')
      : null;
    if (lastAnchorKeyRef.current === anchorKey) return;
    const targetChanged = lastAnchorTargetKeyRef.current !== (anchor?.targetKey ?? null);
    lastAnchorKeyRef.current = anchorKey;
    lastAnchorTargetKeyRef.current = anchor?.targetKey ?? null;
    if (driverRefreshTimerRef.current !== null) {
      if (!targetChanged) return;
      window.clearTimeout(driverRefreshTimerRef.current);
      driverRefreshTimerRef.current = null;
    }
    const refreshDriver = () => {
      driverRefreshTimerRef.current = null;
      lastDriverRefreshAtRef.current = performance.now();
      window.dispatchEvent(new Event(TUTORIAL_DRIVER_REFRESH_EVENT));
    };
    const elapsed = performance.now() - lastDriverRefreshAtRef.current;
    const delay = targetChanged ? 0 : Math.max(0, DRIVER_REFRESH_INTERVAL_MS - elapsed);
    if (delay === 0) refreshDriver();
    else driverRefreshTimerRef.current = window.setTimeout(refreshDriver, delay);
  }, [screenHighlights]);

  if (!activeTutorialId) return null;
  if (screenHighlights.rects.length === 0 && screenHighlights.edges.length === 0) return null;

  return createPortal(
    <div className={styles.layer} data-tutorial-screen-highlights={currentStepIndex}>
      {screenHighlights.edges.length > 0 && (
        <svg className={styles.layer} aria-hidden="true" focusable="false">
          {screenHighlights.edges.map((edge, index) => (
            <polyline
              key={`${edge.primary}-${index}-${edge.points.map((point) => `${point.x},${point.y}`).join(';')}`}
              className={styles.edge}
              points={edge.points.map((point) => `${point.x},${point.y}`).join(' ')}
            />
          ))}
        </svg>
      )}
      {screenHighlights.rects.map((rect, index) => (
        <div
          key={
            rect.anchor
              ? 'primary-anchor'
              : `${rect.x}-${rect.y}-${rect.width}-${rect.height}-${index}`
          }
          className={rect.visible === false ? styles.anchor : styles.rect}
          data-tutorial-canvas-anchor={rect.anchor ? 'primary' : undefined}
          data-tutorial-step-index={rect.anchor ? rect.stepIndex : undefined}
          data-tutorial-target-key={rect.anchor ? rect.targetKey : undefined}
          style={{
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden="true"
        />
      ))}
      {screenHighlights.rects.some((rect) => rect.cue) && (
        <svg className={styles.cueLayer} aria-hidden="true" focusable="false">
          {screenHighlights.rects.flatMap((rect, index) =>
            rect.cue
              ? [
                  <g key={`cue-${index}-${rect.cue.x}-${rect.cue.y}`}>
                    <circle className={styles.cueCircle} cx={rect.cue.x} cy={rect.cue.y} r="12" />
                    <text className={styles.cueArrow} x={rect.cue.x} y={rect.cue.y}>
                      {rect.cue.direction === 'up'
                        ? '↑'
                        : rect.cue.direction === 'right'
                          ? '→'
                          : rect.cue.direction === 'down'
                            ? '↓'
                            : '←'}
                    </text>
                  </g>,
                ]
              : [],
          )}
        </svg>
      )}
    </div>,
    document.body,
  );
}
