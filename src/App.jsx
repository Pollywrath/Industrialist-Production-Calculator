import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CustomNode from './components/CustomNode';
import CustomEdge from './components/CustomEdge';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

// Shared button styles
const btnBase = {
  padding: '12px 24px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '14px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
};

const btnPrimary = { ...btnBase, background: '#d4a637', color: '#0a0a0a' };
const btnSecondary = { ...btnBase, background: '#1a1a1a', color: '#d4a637', border: '2px solid #d4a637' };

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [leftHandles, setLeftHandles] = useState(1);
  const [rightHandles, setRightHandles] = useState(1);
  const reactFlowWrapper = useRef(null);

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
  }, [setEdges]);

  const addNode = useCallback(() => setShowModal(true), []);

  const createNode = useCallback(() => {
    if (leftHandles === 0 && rightHandles === 0) {
      alert('At least one side must have nodes!');
      return;
    }

    setNodes((nds) => [...nds, {
      id: `node-${nodeId}`,
      type: 'custom',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: { label: `Box ${nodeId + 1}`, leftHandles, rightHandles },
      sourcePosition: 'right',
      targetPosition: 'left',
    }]);
    setNodeId((id) => id + 1);
    setShowModal(false);
    setLeftHandles(1);
    setRightHandles(1);
  }, [nodeId, leftHandles, rightHandles, setNodes]);

  const onNodeClick = useCallback((event, node) => {
    if (event.ctrlKey && event.altKey) {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
    }
  }, [setNodes, setEdges]);

  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeId(0);
  }, [setNodes, setEdges]);

  const closeModal = () => {
    setShowModal(false);
    setLeftHandles(1);
    setRightHandles(1);
  };

  const invalid = leftHandles === 0 && rightHandles === 0;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
      <ReactFlow
        ref={reactFlowWrapper}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        style={{ background: '#0a0a0a' }}
      >
        <Background color="#333" gap={16} size={1} />
        <Controls style={{ button: { background: '#1a1a1a', color: '#d4a637', border: '1px solid #d4a637' } }} />
        <MiniMap nodeColor="#d4a637" maskColor="rgba(10, 10, 10, 0.8)" style={{ background: '#1a1a1a', border: '1px solid #d4a637' }} />

        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={closeModal}
          >
            <div
              style={{
                background: '#1a1a1a',
                border: '2px solid #d4a637',
                borderRadius: '12px',
                padding: '30px',
                minWidth: '300px',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ color: '#d4a637', marginBottom: '20px', textAlign: 'center' }}>Configure New Box</h2>
              
              <InputField label="Left Nodes:" value={leftHandles} onChange={setLeftHandles} />
              <InputField label="Right Nodes:" value={rightHandles} onChange={setRightHandles} />

              {invalid && (
                <div style={{
                  marginBottom: '20px',
                  padding: '10px',
                  background: '#3a1a1a',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#fca5a5',
                  fontSize: '13px',
                  textAlign: 'center',
                }}>
                  ⚠️ At least one side must have nodes
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <HoverButton
                  onClick={createNode}
                  disabled={invalid}
                  style={{
                    ...btnPrimary,
                    flex: 1,
                    background: invalid ? '#555' : '#d4a637',
                    cursor: invalid ? 'not-allowed' : 'pointer',
                    opacity: invalid ? 0.5 : 1,
                  }}
                  hoverStyle={{ background: '#f5d56a' }}
                >
                  Create Box
                </HoverButton>
                <HoverButton
                  onClick={closeModal}
                  style={{ ...btnSecondary, flex: 1 }}
                  hoverStyle={{ background: '#d4a637', color: '#0a0a0a' }}
                >
                  Cancel
                </HoverButton>
              </div>
            </div>
          </div>
        )}
        
        <Panel position="top-left" style={{ margin: 10 }}>
          <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
            <HoverButton onClick={addNode} style={btnPrimary} hoverStyle={{ background: '#f5d56a' }}>
              + Add Box
            </HoverButton>
            <HoverButton onClick={clearAll} style={btnSecondary} hoverStyle={{ background: '#d4a637', color: '#0a0a0a' }}>
              Clear All
            </HoverButton>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Reusable input field component
const InputField = ({ label, value, onChange }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={{ color: '#f5d56a', display: 'block', marginBottom: '8px' }}>{label}</label>
    <input
      type="number"
      min="0"
      max="10"
      value={value}
      onChange={(e) => onChange(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
      style={{
        width: '100%',
        padding: '10px',
        background: '#0a0a0a',
        border: '2px solid #d4a637',
        borderRadius: '6px',
        color: '#f5d56a',
        fontSize: '16px',
      }}
    />
  </div>
);

// Button with hover effect
const HoverButton = ({ children, onClick, disabled, style, hoverStyle }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={isHovered && !disabled ? { ...style, ...hoverStyle } : style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
};

export default App;