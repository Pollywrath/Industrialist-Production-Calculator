import { useEffect } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { areCanvasModesBlocked, useUIStore } from '../stores/useUIStore';
import { isTutorialActive, useTutorialStore } from '../stores/useTutorialStore';

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function canUseTutorialTextInput(event: KeyboardEvent): boolean {
  if (!isEditableTarget(event.target)) return false;
  if (event.key === 'Escape' || event.key === 'Tab' || event.key === 'Enter') return false;

  const action = useTutorialStore.getState().getCurrentStep()?.action;
  if (!action) return false;

  if (action.type === 'selector-search') {
    return !!event.target.closest('[data-tutorial-selector-search]');
  }
  if (action.type === 'save-name') {
    return !!event.target.closest('[data-tutorial-save="name"]');
  }
  if (action.type === 'node-editor-machine-count') {
    return !!event.target.closest('[data-tutorial-node-editor="machine-count"]');
  }
  if (action.type === 'node-editor-setting') {
    const editorField = event.target.closest('[data-tutorial-node-editor]');
    return editorField?.getAttribute('data-tutorial-node-editor') === `setting-${action.key}`;
  }
  if (action.type === 'data-search') {
    const dataSearch = event.target.closest('[data-tutorial-data-search]');
    return dataSearch?.getAttribute('data-tutorial-data-search') === action.entity;
  }
  if (action.type === 'data-field') {
    const dataField = event.target.closest('[data-tutorial-data-field]');
    return dataField?.getAttribute('data-tutorial-data-field') === action.field;
  }
  return false;
}

export function useCanvasKeyboardModes(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (isTutorialActive()) {
        if (canUseTutorialTextInput(event)) return;
        event.preventDefault();
        return;
      }
      if (areCanvasModesBlocked()) return;
      if (isEditableTarget(event.target)) return;

      const isDragging = document.querySelector(
        '.react-flow__nodesselection-rect, .react-flow__connection-path, .react-flow__node.dragging',
      );
      if (isDragging) return;

      const key = event.key.toLowerCase();
      const hasCommandModifier = event.ctrlKey || event.metaKey;
      const isUndoShortcut = hasCommandModifier && !event.shiftKey && key === 'z';
      const isRedoShortcut = hasCommandModifier && ((event.shiftKey && key === 'z') || key === 'y');

      if (isUndoShortcut || isRedoShortcut) {
        if (event.repeat) return;
        event.preventDefault();
        const flowStore = useFlowStore.getState();
        if (isUndoShortcut) flowStore.undo();
        else flowStore.redo();
        return;
      }

      if (event.key === 'Alt') {
        event.preventDefault();
        uiStore.pushOverride('delete_mode');
      } else if (event.key === 'Control' || event.key === 'Meta') {
        event.preventDefault();
        uiStore.pushOverride('multi_select');
      } else if (event.key === 'Shift') {
        uiStore.pushOverride('target');
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (isTutorialActive()) {
        if (canUseTutorialTextInput(event)) return;
        event.preventDefault();
        return;
      }
      if (uiStore.isRecipeSelectorOpen) return;

      if (event.key === 'Alt') uiStore.popOverride('delete_mode');
      else if (event.key === 'Control' || event.key === 'Meta') uiStore.popOverride('multi_select');
      else if (event.key === 'Shift') uiStore.popOverride('target');
    };

    const handleBlur = () => useUIStore.setState({ temporaryOverrides: [] });

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
}
