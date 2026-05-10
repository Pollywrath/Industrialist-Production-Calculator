import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
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
  solverVersion: number;

  onNodesChange: OnNodesChange<Node<RecipeNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: Node<RecipeNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setNodesAndEdges: (nodes: Node<RecipeNodeData>[], edges: Edge[]) => void;

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

const useFlowStore = create(
  subscribeWithSelector<FlowState>((set, get) => ({
    nodes: [],
    nodesMap: new Map(),
    edges: [],
    solverVersion: 0,

    onNodesChange: (changes) => {
      const nextNodes = applyNodeChanges(changes, get().nodes);
      let hasStructuralChange = false;
      for (let i = 0; i < changes.length; i++) {
        const type = changes[i].type;
        if (type !== 'position' && type !== 'select' && type !== 'dimensions') {
          hasStructuralChange = true;
          break;
        }
      }

      set({
        nodes: nextNodes,
        nodesMap: hasStructuralChange ? createNodesMap(nextNodes) : get().nodesMap,
        solverVersion: hasStructuralChange ? get().solverVersion + 1 : get().solverVersion,
      });
    },

    onEdgesChange: (changes) => {
      const nextEdges = applyEdgeChanges(changes, get().edges);
      let hasStructuralChange = false;
      for (let i = 0; i < changes.length; i++) {
        const type = changes[i].type;
        if (type !== 'select') {
          hasStructuralChange = true;
          break;
        }
      }

      if (hasStructuralChange) {
        set({
          edges: nextEdges,
          solverVersion: get().solverVersion + 1,
        });
      } else {
        set({
          edges: nextEdges,
        });
      }
    },

    onConnect: (connection) => {
      const newEdge = { ...connection, id: nextEdgeId() } as Edge;
      set({
        edges: addEdge(newEdge, get().edges),
        solverVersion: get().solverVersion + 1,
      });
    },

    setNodes: (nodes) => {
      set({
        nodes,
        nodesMap: createNodesMap(nodes),
        solverVersion: get().solverVersion + 1,
      });
    },
    setEdges: (edges) => {
      set({
        edges,
        solverVersion: get().solverVersion + 1,
      });
    },
    setNodesAndEdges: (nodes, edges) => {
      set({
        nodes,
        nodesMap: createNodesMap(nodes),
        edges,
        solverVersion: get().solverVersion + 1,
      });
    },

    updateNodeData: (nodeId, data) => {
      const oldNodes = get().nodes;
      const nextNodes = new Array<Node<RecipeNodeData>>(oldNodes.length);
      let updatedNode: Node<RecipeNodeData> | null = null;

      for (let i = 0; i < oldNodes.length; i++) {
        const node = oldNodes[i];
        if (node.id === nodeId) {
          updatedNode = { ...node, data: { ...node.data, ...data } };
          nextNodes[i] = updatedNode;
        } else {
          nextNodes[i] = node;
        }
      }

      if (!updatedNode) return;

      const nextNodesMap = new Map(get().nodesMap);
      nextNodesMap.set(nodeId, updatedNode);

      set({
        nodes: nextNodes,
        nodesMap: nextNodesMap,
        solverVersion: get().solverVersion + 1,
      });
    },

    deleteNode: (nodeId) => {
      const oldNodes = get().nodes;
      const oldNodesMap = get().nodesMap;

      const nextNodesMap = new Map(oldNodesMap);
      nextNodesMap.delete(nodeId);

      const nextNodes = new Array<Node<RecipeNodeData>>(Math.max(0, oldNodes.length - 1));
      let idx = 0;
      for (let i = 0; i < oldNodes.length; i++) {
        const node = oldNodes[i];
        if (node.id !== nodeId) {
          nextNodes[idx++] = node;
        }
      }

      set({
        nodes: nextNodes,
        nodesMap: nextNodesMap,
        edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        solverVersion: get().solverVersion + 1,
      });
    },
  }))
);

export default useFlowStore;
