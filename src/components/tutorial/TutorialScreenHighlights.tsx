import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { TutorialHighlight } from '../../tutorials/types';
import { useTutorialStore } from '../../stores/useTutorialStore';
import {
  getElementForTutorialHighlight,
  getSecondaryTutorialHighlights,
  TUTORIAL_DRIVER_REFRESH_EVENT,
} from './tutorialHighlightUtils';
import styles from './TutorialScreenHighlights.module.css';

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ScreenHighlights {
  rects: ScreenRect[];
  edges: ScreenEdge[];
}

const RECT_PADDING = 6;
const HANDLE_PADDING = 12;
const RETRY_DELAY_MS = 120;

function rectFromElement(element: Element, padding: number): ScreenRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    x: rect.left - padding,
    y: rect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function centerFromElement(element: Element): { x: number; y: number } | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function resolveEdgeHighlight(
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

  const source = centerFromElement(sourceElement);
  const target = centerFromElement(targetElement);
  if (!source || !target) return null;

  return {
    x1: source.x,
    y1: source.y,
    x2: target.x,
    y2: target.y,
  };
}

function resolveRectHighlight(
  highlight: TutorialHighlight,
  getNodeId: ReturnType<typeof useTutorialStore.getState>['getNodeId'],
): ScreenRect | null {
  if (highlight.kind === 'edge') return null;

  const element = getElementForTutorialHighlight(highlight, getNodeId);
  if (!element) return null;

  return rectFromElement(
    element,
    highlight.kind === 'handle' ? HANDLE_PADDING : RECT_PADDING,
  );
}

function resolveScreenHighlights(
  highlights: TutorialHighlight[],
  getNodeId: ReturnType<typeof useTutorialStore.getState>['getNodeId'],
): ScreenHighlights {
  const rects: ScreenRect[] = [];
  const edges: ScreenEdge[] = [];

  for (let i = 0; i < highlights.length; i++) {
    const highlight = highlights[i];
    const rect = resolveRectHighlight(highlight, getNodeId);
    const edge = resolveEdgeHighlight(highlight, getNodeId);
    if (rect) rects.push(rect);
    if (edge) edges.push(edge);
  }

  return { rects, edges };
}

export function TutorialScreenHighlights() {
  const activeTutorialId = useTutorialStore((s) => s.activeTutorialId);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const aliases = useTutorialStore((s) => s.aliases);
  const getCurrentStep = useTutorialStore((s) => s.getCurrentStep);
  const getNodeId = useTutorialStore((s) => s.getNodeId);
  const frameRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const [screenHighlights, setScreenHighlights] = useState<ScreenHighlights>({
    rects: [],
    edges: [],
  });

  useEffect(() => {
    const clearRetry = () => {
      if (retryRef.current != null) {
        window.clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };

    const step = activeTutorialId ? getCurrentStep() : null;
    const secondaryHighlights = step ? getSecondaryTutorialHighlights(step) : [];

    const updateHighlights = () => {
      clearRetry();

      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;

        const next = resolveScreenHighlights(secondaryHighlights, getNodeId);
        setScreenHighlights(next);

        if (
          activeTutorialId &&
          secondaryHighlights.length > 0 &&
          next.rects.length + next.edges.length < secondaryHighlights.length
        ) {
          retryRef.current = window.setTimeout(updateHighlights, RETRY_DELAY_MS);
        }
      });
    };

    updateHighlights();
    window.addEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, updateHighlights);
    window.addEventListener('resize', updateHighlights);

    return () => {
      clearRetry();
      window.removeEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, updateHighlights);
      window.removeEventListener('resize', updateHighlights);
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [activeTutorialId, currentStepIndex, aliases, getCurrentStep, getNodeId]);

  if (!activeTutorialId) return null;
  if (screenHighlights.rects.length === 0 && screenHighlights.edges.length === 0) return null;

  return createPortal(
    <div className={styles.layer} data-tutorial-screen-highlights={currentStepIndex}>
      {screenHighlights.edges.length > 0 && (
        <svg className={styles.layer} aria-hidden="true" focusable="false">
          {screenHighlights.edges.map((edge, index) => (
            <line
              key={`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}-${index}`}
              className={styles.edge}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
            />
          ))}
        </svg>
      )}
      {screenHighlights.rects.map((rect, index) => (
        <div
          key={`${rect.x}-${rect.y}-${rect.width}-${rect.height}-${index}`}
          className={styles.rect}
          style={{
            transform: `translate(${rect.x}px, ${rect.y}px)`,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden="true"
        />
      ))}
    </div>,
    document.body,
  );
}
