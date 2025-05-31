import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  Position,
  NodeTypes,
  DefaultEdgeOptions,
  ReactFlowProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';

// Node data from server/for React Flow
interface CustomNodeData {
  label: string;
  slug: string;
  description?: string;
  [key: string]: any; // To satisfy Record<string, unknown>
}

// Edge data from server/for React Flow
interface CustomEdgeData {
  [key: string]: any; // To satisfy Record<string, unknown>, if edges have data
}

// Node structure from the server
interface ApiNodeFromServer {
  id: string;
  position: { x: number; y: number };
  data: CustomNodeData;
  style?: React.CSSProperties;
  type?: string;
}

// Edge structure from the server
interface ApiEdgeFromServer {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  data?: CustomEdgeData; // Edges can optionally have data
}

interface FetchNetworkResponse {
  nodes: ApiNodeFromServer[];
  edges?: ApiEdgeFromServer[];
}

const flowStyles: React.CSSProperties = {
  width: '45vw',
  height: '40vh',
  background: 'transparent',
  border: '1px solid #ccc',
};

// const nodeTypes: NodeTypes = {
//   customNodeType: (props: NodeProps<CustomNodeData>) => <div>{props.data.label}</div>,
// };

const CommunityGraphViewInternal: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<CustomEdgeData>>([]);
  const navigate = useNavigate();
  const { token } = useAuth();
  const reactFlowInstance = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  useEffect(() => {
    const fetchNetworkData = async () => {
      try {
        const url = token
          ? `${API_BASE_URL}/api/topics/user_network`
          : `${API_BASE_URL}/api/topics/network`;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await axios.get<FetchNetworkResponse>(url, { headers });

        const fetchedNodes: Node<CustomNodeData>[] = response.data.nodes.map(apiNode => ({
          id: apiNode.id,
          position: apiNode.position,
          data: apiNode.data,
          style: apiNode.style,
          type: apiNode.type || 'default',
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        }));
        setNodes(fetchedNodes);

        if (response.data.edges) {
          const fetchedEdges: Edge<CustomEdgeData>[] = response.data.edges.map(apiEdge => ({
            id: apiEdge.id,
            source: apiEdge.source,
            target: apiEdge.target,
            label: apiEdge.label,
            animated: apiEdge.animated,
            style: apiEdge.style,
            data: apiEdge.data,
          }));
          setEdges(fetchedEdges);
        }

        setTimeout(() => {
          if (reactFlowInstance) {
            reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
          }
        }, 300);

      } catch (error) {
        console.error('Failed to fetch topic network data:', error);
      }
    };

    fetchNetworkData();
  }, [token, setNodes, setEdges, reactFlowInstance]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<CustomNodeData>) => {
      if (node.data.slug) {
        navigate(`/community/topic/${node.data.slug}`);
      }
    },
    [navigate]
  );

  const onNodeDragStop = useCallback(
    async (_event: React.MouseEvent, node: Node<CustomNodeData>) => {
      if (!token || !node.position) return;

      try {
        await axios.post(
          `${API_BASE_URL}/api/topics/save_positions`,
          { nodes: [{ id: node.id, position: node.position }] },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (error) {
        console.error('Failed to save node position:', error);
      }
    },
    [token]
  );

  const defaultEdgeOptions: DefaultEdgeOptions = useMemo(() => ({
    animated: false,
    style: { strokeWidth: 1.5, stroke: '#a1a1aa' },
  }), []);

  return (
    <div style={flowStyles} data-testid="community-graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        fitView
        defaultEdgeOptions={defaultEdgeOptions}
        attributionPosition="top-right"
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        {/* <Background variant={BackgroundVariant.Dots} gap={15} size={0.5} color="#6b7280" /> */}
      </ReactFlow>
    </div>
  );
};

const CommunityGraphView: React.FC = () => (
  <ReactFlowProvider>
    <CommunityGraphViewInternal />
  </ReactFlowProvider>
);

export default CommunityGraphView; 