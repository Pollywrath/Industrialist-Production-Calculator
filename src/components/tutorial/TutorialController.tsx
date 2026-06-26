import { useEffect, useRef, useState } from 'react';
import { driver, type AllowedButtons, type Driver, type Popover } from 'driver.js';
import 'driver.js/dist/driver.css';
import styles from './TutorialController.module.css';
if (typeof window !== 'undefined') {
  (window as Window & { __tutorialStyles?: typeof styles }).__tutorialStyles = styles;
}
import { useTutorialStore } from '../../stores/useTutorialStore';
import { useUIStore } from '../../stores/useUIStore';
import type { TutorialStep } from '../../tutorials/types';
import {
  getElementForTutorialHighlight,
  isTutorialFlowHighlight,
  TUTORIAL_DRIVER_REFRESH_EVENT,
} from './tutorialHighlightUtils';
import { TutorialScreenHighlights } from './TutorialScreenHighlights';

function buildPopover(step: TutorialStep, isFirstStep: boolean): Popover {
  const isContinueStep = step.action.type === 'continue';
  const showButtons: AllowedButtons[] = isContinueStep
    ? ['previous', 'close', 'next']
    : ['previous', 'close'];
  const disableButtons: AllowedButtons[] | undefined = isFirstStep ? ['previous'] : undefined;

  return {
    title: step.title,
    description: step.description,
    side: step.popoverSide ?? ('bottom' as const),
    align: 'center' as const,
    showButtons,
    disableButtons,
    nextBtnText: 'Continue',
    prevBtnText: 'Previous',
    doneBtnText: 'Continue',
    progressText: '',
    onNextClick: () => {
      useTutorialStore.getState().completeAction({ type: 'continue' });
    },
    onPrevClick: () => {
      void useTutorialStore.getState().previousStep();
    },
    onCloseClick: () => {
      void useTutorialStore.getState().exitTutorial();
    },
  };
}

function getDriverElementForStep(
  step: TutorialStep,
  getNodeId: ReturnType<typeof useTutorialStore.getState>['getNodeId'],
): Element | null {
  return getElementForTutorialHighlight(step.highlight, getNodeId);
}

function makeDriverOverlayPassThrough(): void {
  const overlays = document.querySelectorAll<SVGElement>('.driver-overlay');
  overlays.forEach((overlay) => {
    overlay.style.pointerEvents = 'none';
    overlay.querySelectorAll<SVGElement>('*').forEach((child) => {
      child.style.pointerEvents = 'none';
    });
  });
}

function syncDriverCanvasInteractivity(): void {
  window.requestAnimationFrame(makeDriverOverlayPassThrough);
}

export function TutorialController() {
  const activeTutorialId = useTutorialStore((s) => s.activeTutorialId);
  const currentStepIndex = useTutorialStore((s) => s.currentStepIndex);
  const aliases = useTutorialStore((s) => s.aliases);
  const getCurrentStep = useTutorialStore((s) => s.getCurrentStep);
  const getNodeId = useTutorialStore((s) => s.getNodeId);
  const isRecipeSelectorOpen = useUIStore((s) => s.isRecipeSelectorOpen);
  const isSavesOverlayOpen = useUIStore((s) => s.isSavesOverlayOpen);
  const isDataOverlayOpen = useUIStore((s) => s.isDataOverlayOpen);
  const isThemeOverlayOpen = useUIStore((s) => s.isThemeOverlayOpen);
  const isMachineOverlayOpen = useUIStore((s) => s.isMachineOverlayOpen);
  const isHelpOverlayOpen = useUIStore((s) => s.isHelpOverlayOpen);
  const isLPSolverOpen = useUIStore((s) => s.isLPSolverOpen);
  const hasConfirmDialog = useUIStore((s) => s.confirmDialog !== null);
  const preselectedNodeId = useUIStore((s) => s.preselectedNodeId);
  const preselectedSourceSide = useUIStore((s) => s.preselectedSourceSide);
  const preselectedHandleIndex = useUIStore((s) => s.preselectedHandleIndex);
  const driverRef = useRef<Driver | null>(null);
  const retryRef = useRef<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const currentStep = activeTutorialId ? getCurrentStep() : null;
  const isFlowHighlightStep = !!currentStep && isTutorialFlowHighlight(currentStep.highlight);

  const isCanvasInteractionEnabled =
    !!activeTutorialId &&
    !isRecipeSelectorOpen &&
    !isSavesOverlayOpen &&
    !isDataOverlayOpen &&
    !isThemeOverlayOpen &&
    !isMachineOverlayOpen &&
    !isHelpOverlayOpen &&
    !isLPSolverOpen &&
    !hasConfirmDialog;

  useEffect(() => {
    document.body.classList.toggle(
      'tutorial-canvas-interaction-enabled',
      isCanvasInteractionEnabled,
    );
    document.body.classList.toggle('tutorial-flow-highlight-active', isFlowHighlightStep);

    return () => {
      document.body.classList.remove('tutorial-canvas-interaction-enabled');
      document.body.classList.remove('tutorial-flow-highlight-active');
    };
  }, [isCanvasInteractionEnabled, isFlowHighlightStep]);

  useEffect(() => {
    if (!activeTutorialId || !isRecipeSelectorOpen) return;
    const state = useTutorialStore.getState();
    const step = state.getCurrentStep();
    if (!step || step.action.type !== 'node-rect') return;

    const expectedNodeId = state.getNodeId(step.action.alias);
    if (
      !expectedNodeId ||
      preselectedNodeId !== expectedNodeId ||
      preselectedSourceSide !== step.action.side ||
      preselectedHandleIndex !== step.action.index
    ) {
      return;
    }

    state.completeAction({
      type: 'node-rect',
      nodeId: preselectedNodeId,
      side: preselectedSourceSide,
      index: preselectedHandleIndex,
    });
  }, [
    activeTutorialId,
    currentStepIndex,
    isRecipeSelectorOpen,
    preselectedNodeId,
    preselectedSourceSide,
    preselectedHandleIndex,
  ]);

  useEffect(() => {
    if (!activeTutorialId) {
      driverRef.current?.destroy();
      driverRef.current = null;
      if (retryRef.current != null) {
        window.clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      return;
    }

    if (!driverRef.current) {
      driverRef.current = driver({
        animate: false,
        allowClose: false,
        allowKeyboardControl: false,
        overlayClickBehavior: () => undefined,
        overlayOpacity: 0.68,
        stagePadding: 6,
        stageRadius: 6,
        popoverClass: 'tutorial-popover',
        showProgress: false,
      });
    }
  }, [activeTutorialId]);

  useEffect(() => {
    if (!activeTutorialId) return;

    const refreshDriver = () => {
      driverRef.current?.refresh();
      syncDriverCanvasInteractivity();
    };

    window.addEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, refreshDriver);
    window.addEventListener('resize', refreshDriver);

    return () => {
      window.removeEventListener(TUTORIAL_DRIVER_REFRESH_EVENT, refreshDriver);
      window.removeEventListener('resize', refreshDriver);
    };
  }, [activeTutorialId]);

  useEffect(() => {
    if (!activeTutorialId || !driverRef.current) return;

    if (retryRef.current != null) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    const step = getCurrentStep();
    if (!step) return;

    const element = getDriverElementForStep(step, getNodeId);
    if (!element) {
      retryRef.current = window.setTimeout(() => {
        setRetryNonce((value) => value + 1);
      }, 120);
      return;
    }

    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });

    driverRef.current.highlight({
      element,
      disableActiveInteraction: isTutorialFlowHighlight(step.highlight)
        ? false
        : step.disableActiveInteraction ?? (step.action.type === 'continue'),
      popover: buildPopover(step, currentStepIndex === 0),
    });
    syncDriverCanvasInteractivity();
  }, [
    activeTutorialId,
    currentStepIndex,
    aliases,
    retryNonce,
    getCurrentStep,
    getNodeId,
  ]);

  return <TutorialScreenHighlights />;
}
