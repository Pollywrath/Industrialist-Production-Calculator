import { useState, useRef, useCallback } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import { loadCanvasState } from '../data/dataLoader';

export const useAppState = (initialDisplayMode = 'perSecond', initialMachineDisplayMode = 'total') => {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);
  const [keepOverlayDuringTransition, setKeepOverlayDuringTransition] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectorMode, setSelectorMode] = useState('product');
  const [selectorOpenedFrom, setSelectorOpenedFrom] = useState('button');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterType, setFilterType] = useState('all');
  const [recipeFilter, setRecipeFilter] = useState('all');
  const [autoConnectTarget, setAutoConnectTarget] = useState(null);
  const [targetProducts, setTargetProducts] = useState([]);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetIdCounter, setTargetIdCounter] = useState(0);
  const [showMachineCountEditor, setShowMachineCountEditor] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingMachineCount, setEditingMachineCount] = useState('');
  const [newNodePendingMachineCount, setNewNodePendingMachineCount] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [extendedPanelOpen, setExtendedPanelOpen] = useState(false);
  const [edgeSettings, setEdgeSettings] = useState(() => {
    const theme = JSON.parse(localStorage.getItem('industrialist_theme') || '{}');
    return {
      edgePath: theme.edgePath || 'orthogonal',
      edgeStyle: theme.edgeStyle || 'animated'
    };
  });
  const [extendedPanelClosing, setExtendedPanelClosing] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [globalPollution, setGlobalPollution] = useState(0);
  const [pollutionInputFocused, setPollutionInputFocused] = useState(false);
  const [isPollutionPaused, setIsPollutionPaused] = useState(true);
  const [soldProducts, setSoldProducts] = useState({});
  const [displayMode, setDisplayMode] = useState(initialDisplayMode);
  const [machineDisplayMode, setMachineDisplayMode] = useState(initialMachineDisplayMode);
  const [favoriteRecipes, setFavoriteRecipes] = useState([]);
  const [lastDrillConfig, setLastDrillConfig] = useState(null);
  const [lastAssemblerConfig, setLastAssemblerConfig] = useState(null);
  const [lastTreeFarmConfig, setLastTreeFarmConfig] = useState(null);
  const [lastFireboxConfig, setLastFireboxConfig] = useState(null);
  const [recipeMachineCounts, setRecipeMachineCounts] = useState({});
  const [pendingNode, setPendingNode] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);
  const fileInputRef = useRef(null);
  const dragTimeoutRef = useRef(null);
  const pendingChangesRef = useRef([]);
  const nodesRef = useRef(nodes);

  const onNodesChange = useCallback((changes) => {
    const positionChanges = changes.filter(c => c.type === 'position' && c.dragging);
    const otherChanges = changes.filter(c => !(c.type === 'position' && c.dragging));
    
    if (positionChanges.length > 0) {
      onNodesChangeBase(positionChanges);
    }
    
    if (otherChanges.length > 0) {
      pendingChangesRef.current.push(...otherChanges);
      
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      
      dragTimeoutRef.current = setTimeout(() => {
        if (pendingChangesRef.current.length > 0) {
          onNodesChangeBase(pendingChangesRef.current);
          pendingChangesRef.current = [];
        }
      }, 50);
    }
  }, [onNodesChangeBase]);
  
  const onEdgesChange = useCallback((changes) => {
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase]);

  const resetSelector = useCallback(() => {
    setShowRecipeSelector(false);
    setSelectedProduct(null);
    setSelectedMachine(null);
    setSelectorMode('product');
    setSearchTerm('');
    setSortBy('name_asc');
    setFilterType('all');
    setRecipeFilter('all');
    setAutoConnectTarget(null);
    setSelectorOpenedFrom('button');
    setRecipeMachineCounts({});
  }, []);

  const loadState = useCallback(() => {
    const savedState = loadCanvasState();
    if (savedState?.nodes) {
      return savedState;
    }
    return null;
  }, []);

  return {
    // State
    nodes, setNodes, edges, setEdges, nodeId, setNodeId,
    showRecipeSelector, setShowRecipeSelector,
    keepOverlayDuringTransition, setKeepOverlayDuringTransition,
    selectedProduct, setSelectedProduct,
    selectedMachine, setSelectedMachine,
    selectorMode, setSelectorMode,
    selectorOpenedFrom, setSelectorOpenedFrom,
    searchTerm, setSearchTerm,
    sortBy, setSortBy,
    filterType, setFilterType,
    recipeFilter, setRecipeFilter,
    autoConnectTarget, setAutoConnectTarget,
    targetProducts, setTargetProducts,
    showTargetsModal, setShowTargetsModal,
    targetIdCounter, setTargetIdCounter,
    showMachineCountEditor, setShowMachineCountEditor,
    editingNodeId, setEditingNodeId,
    editingMachineCount, setEditingMachineCount,
    newNodePendingMachineCount, setNewNodePendingMachineCount,
    menuOpen, setMenuOpen,
    showThemeEditor, setShowThemeEditor,
    extendedPanelOpen, setExtendedPanelOpen,
    edgeSettings, setEdgeSettings,
    extendedPanelClosing, setExtendedPanelClosing,
    leftPanelCollapsed, setLeftPanelCollapsed,
    globalPollution, setGlobalPollution,
    pollutionInputFocused, setPollutionInputFocused,
    isPollutionPaused, setIsPollutionPaused,
    soldProducts, setSoldProducts,
    displayMode, setDisplayMode,
    machineDisplayMode, setMachineDisplayMode,
    favoriteRecipes, setFavoriteRecipes,
    lastDrillConfig, setLastDrillConfig,
    lastAssemblerConfig, setLastAssemblerConfig,
    lastTreeFarmConfig, setLastTreeFarmConfig,
    lastFireboxConfig, setLastFireboxConfig,
    recipeMachineCounts, setRecipeMachineCounts,
    pendingNode, setPendingNode,
    mousePosition, setMousePosition,
    
    // Refs
    reactFlowWrapper,
    reactFlowInstance,
    fileInputRef,
    nodesRef,
    
    // Callbacks
    onNodesChange,
    onEdgesChange,
    resetSelector,
    loadState
  };
};