import { beforeEach, describe, expect, it } from 'vitest';
import type { Edge, Node, NodeChange } from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { useFlowStore } from './useFlowStore';

const makeNode = (
  id: string,
  x = 0,
  y = 0,
  machineCount = 1,
): Node<RecipeNodeData> => ({
  id,
  type: 'recipe',
  position: { x, y },
  data: {
    recipeId: 'missing-recipe-id',
    machineCount,
    inputOrder: [0],
    outputOrder: [0],
  },
});

const makeEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: `${source}-output-0`,
  targetHandle: `${target}-input-0`,
});

const resetFlowStore = () => {
  useFlowStore.getState().setNodesAndEdges([], [], {
    recordHistory: false,
    resetHistory: true,
  });
};

describe('useFlowStore undo/redo history', () => {
  beforeEach(() => {
    resetFlowStore();
  });

  it('captures drag as one history step when drag stops', () => {
    const store = useFlowStore.getState();
    store.setNodesAndEdges([makeNode('n1', 0, 0)], [], {
      recordHistory: false,
      resetHistory: true,
    });

    store.captureDragStart(['n1']);
    const positionChange: NodeChange<Node<RecipeNodeData>> = {
      id: 'n1',
      type: 'position',
      position: { x: 120, y: 80 },
      dragging: false,
    };
    store.onNodesChange([positionChange]);

    expect(useFlowStore.getState().historyPast).toHaveLength(0);

    store.commitDragStop(['n1']);
    expect(useFlowStore.getState().historyPast).toHaveLength(1);

    useFlowStore.getState().undo();
    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 0, y: 0 });

    useFlowStore.getState().redo();
    expect(useFlowStore.getState().nodes[0].position).toEqual({ x: 120, y: 80 });
  });

  it('records clear-canvas as one step and restores graph on undo', () => {
    const store = useFlowStore.getState();
    const nodes = [makeNode('n1'), makeNode('n2', 200, 0)];
    const edges = [makeEdge('e1', 'n1', 'n2')];
    store.setNodesAndEdges(nodes, edges, {
      recordHistory: false,
      resetHistory: true,
    });

    store.setNodesAndEdges([], []);
    expect(useFlowStore.getState().historyPast).toHaveLength(1);
    expect(useFlowStore.getState().nodes).toHaveLength(0);
    expect(useFlowStore.getState().edges).toHaveLength(0);

    store.undo();
    expect(useFlowStore.getState().nodes).toHaveLength(2);
    expect(useFlowStore.getState().edges).toHaveLength(1);
  });

  it('limits undo history to 50 steps', () => {
    const store = useFlowStore.getState();
    store.setNodesAndEdges([makeNode('n1', 0, 0, 0)], [], {
      recordHistory: false,
      resetHistory: true,
    });

    for (let i = 1; i <= 60; i++) {
      store.updateNodeData('n1', { machineCount: i });
    }

    expect(useFlowStore.getState().historyPast).toHaveLength(50);

    for (let i = 0; i < 50; i++) {
      useFlowStore.getState().undo();
    }

    expect(useFlowStore.getState().canUndo).toBe(false);
    expect(useFlowStore.getState().nodes[0].data.machineCount).toBe(10);
  });

  it('clears redo stack after a new action', () => {
    const store = useFlowStore.getState();
    store.setNodesAndEdges([makeNode('n1', 0, 0, 1)], [], {
      recordHistory: false,
      resetHistory: true,
    });

    store.updateNodeData('n1', { machineCount: 2 });
    store.undo();
    expect(useFlowStore.getState().canRedo).toBe(true);

    store.updateNodeData('n1', { machineCount: 3 });
    expect(useFlowStore.getState().canRedo).toBe(false);
    expect(useFlowStore.getState().historyFuture).toHaveLength(0);
  });

  it('groups transaction mutations into one history entry', () => {
    const store = useFlowStore.getState();
    store.setNodesAndEdges([makeNode('n1', 0, 0, 1)], [], {
      recordHistory: false,
      resetHistory: true,
    });

    store.runTransaction(() => {
      store.updateNodeData('n1', { machineCount: 2 });
      store.updateNodeData('n1', { machineCount: 3 });
    });

    expect(useFlowStore.getState().historyPast).toHaveLength(1);
    expect(useFlowStore.getState().nodes[0].data.machineCount).toBe(3);

    store.undo();
    expect(useFlowStore.getState().nodes[0].data.machineCount).toBe(1);
  });

  it('does not commit transaction history when the transaction throws', () => {
    const store = useFlowStore.getState();
    store.setNodesAndEdges([makeNode('n1', 0, 0, 1)], [], {
      recordHistory: false,
      resetHistory: true,
    });

    expect(() => {
      store.runTransaction(() => {
        store.updateNodeData('n1', { machineCount: 2 });
        throw new Error('intentional test failure');
      });
    }).toThrow('intentional test failure');

    expect(useFlowStore.getState().historyPast).toHaveLength(0);
  });
});
