import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  addEdge,
  type Connection,
} from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { nextEdgeId } from '../utils/idGenerator';

interface FlowState {
  nodes: Node<RecipeNodeData>[];
  edges: Edge[];

  onNodesChange: OnNodesChange<Node<RecipeNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: Node<RecipeNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;

  updateNodeData: (nodeId: string, data: Partial<RecipeNodeData>) => void;
}

const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    const newEdge = { ...connection, id: nextEdgeId() } as Edge;
    set({ edges: addEdge(newEdge, get().edges) });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
    });
  },
}));

export default useFlowStore;
