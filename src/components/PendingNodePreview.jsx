import React from 'react';

const PendingNodePreview = ({ pendingNode, mousePosition }) => {
  if (!pendingNode) return null;

  return (
    <div
      className="pending-node-preview"
      style={{
        left: `${mousePosition.x + 20}px`,
        top: `${mousePosition.y + 20}px`
      }}
    >
      <div className="pending-node-recipe-name">{pendingNode.recipe.name}</div>
      <div className="pending-node-machine-name">{pendingNode.machine.name}</div>
      <div className="pending-node-machine-name">Count: {pendingNode.machineCount}</div>
      <div className="pending-node-hint">Left-click to place | Right-click to cancel</div>
    </div>
  );
};

export default PendingNodePreview;