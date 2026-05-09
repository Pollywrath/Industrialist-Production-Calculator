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
  nodesMap: Map<string, Node<RecipeNodeData>>;
  edges: Edge[];

  onNodesChange: OnNodesChange<Node<RecipeNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: Node<RecipeNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;

  updateNodeData: (nodeId: string, data: Partial<RecipeNodeData>) => void;
  deleteNode: (nodeId: string) => void;
}

const createNodesMap = (nodes: Node<RecipeNodeData>[]): Map<string, Node<RecipeNodeData>> => {
  const map = new Map<string, Node<RecipeNodeData>>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    map.set(node.id, node);
  }
  return map;
};

const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  nodesMap: new Map(),
  edges: [],

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes);
    let hasStructuralChange = false;
    for (let i = 0; i < changes.length; i++) {
      const type = changes[i].type;
      if (type !== 'position' && type !== 'select') {
        hasStructuralChange = true;
        break;
      }
    }

    if (hasStructuralChange) {
      set({
        nodes: nextNodes,
        nodesMap: createNodesMap(nextNodes),
      });
    } else {
      const currentMap = get().nodesMap;
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.type === 'position' || change.type === 'select') {
          let updatedNode = null;
          for (let j = 0; j < nextNodes.length; j++) {
            if (nextNodes[j].id === change.id) {
              updatedNode = nextNodes[j];
              break;
            }
          }
          if (updatedNode) {
            currentMap.set(change.id, updatedNode);
          }
        }
      }
      set({
        nodes: nextNodes,
      });
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection) => {
    const newEdge = { ...connection, id: nextEdgeId() } as Edge;
    set({ edges: addEdge(newEdge, get().edges) });
  },

  setNodes: (nodes) => {
    set({
      nodes,
      nodesMap: createNodesMap(nodes),
    });
  },
  setEdges: (edges) => set({ edges }),

  updateNodeData: (nodeId, data) => {
    const nextNodes = get().nodes.map((node) => {
      if (node.id === nodeId) {
        return { ...node, data: { ...node.data, ...data } };
      }
      return node;
    });
    set({
      nodes: nextNodes,
      nodesMap: createNodesMap(nextNodes),
    });
  },

  deleteNode: (nodeId) => {
    const nextNodes = get().nodes.filter((n) => n.id !== nodeId);
    set({
      nodes: nextNodes,
      nodesMap: createNodesMap(nextNodes),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
  },
}));

export default useFlowStore;
