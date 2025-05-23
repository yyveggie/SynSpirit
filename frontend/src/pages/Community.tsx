import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // 导入 useNavigate
import ReactFlow, {
  Controls, // 导入控制按钮
  Background, // 导入背景
  addEdge, // 用于添加边的辅助函数
  Connection, // 连接类型
  Edge, // 边类型
  Node, // 节点类型
  useNodesState, // 管理节点状态的 Hook
  useEdgesState, // 管理边状态的 Hook
  NodeMouseHandler, // 导入节点鼠标事件处理器类型
  OnNodesChange, // 节点变化事件类型
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios'; // Import axios for API calls
import { API_BASE_URL } from '../config'; // Import API base URL
import { useSidebar } from '../contexts/SidebarContext'; // 引入 useSidebar

// 为 Node 类型扩展，或者在 data 中添加 slug
interface TopicNodeData {
  label: string;
  slug?: string; // 添加 slug 字段
}

// --- REMOVE STATIC DATA ---
// const initialNodes: Node<TopicNodeData>[] = [ ... ];
// const initialEdges: Edge[] = [ ... ];
// --- END REMOVE STATIC DATA ---

const CommunityPage: React.FC = () => {
  const navigate = useNavigate(); // 获取 navigate 函数
  const { isSidebarOpen } = useSidebar(); // 使用 Context
  const [nodes, setNodes, onNodesChange] = useNodesState([]); 
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true); // Add loading state
  const [error, setError] = useState<string | null>(null); // Add error state
  const [isAuthenticated, setIsAuthenticated] = useState(false); // 添加认证状态
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle'); // 保存状态
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 用于保存延迟的引用
  const [hasLayoutChanged, setHasLayoutChanged] = useState(false); // 添加布局是否已更改状态

  // 检查用户登录状态
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch data from backend on component mount
  useEffect(() => {
    const fetchNetworkData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const isLoggedIn = !!token;
        setIsAuthenticated(isLoggedIn);
        
        // 根据用户登录状态使用不同的API端点
        const endpoint = isLoggedIn 
          ? `${API_BASE_URL}/api/topics/user_network`
          : `${API_BASE_URL}/api/topics/network`;
        
        // 如果用户已登录，添加授权头
        const config = isLoggedIn 
          ? { headers: { Authorization: `Bearer ${token}` } }
          : {};
        
        const response = await axios.get<{ nodes: Node<TopicNodeData>[], edges: Edge[] }>(
          endpoint, 
          config
        );
        
        console.log("Fetched network data:", response.data);
        setNodes(response.data.nodes || []); 
        setEdges(response.data.edges || []);
      } catch (err) {
        console.error("Failed to fetch topic network:", err);
        setError('无法加载社区网络图数据。');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNetworkData();
  }, [setNodes, setEdges]); // Dependencies ensure fetch runs once on mount

  // 当用户尝试连接节点时调用的回调函数
  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  // 保存节点位置的函数
  const saveNodePositions = useCallback(async () => {
    if (!isAuthenticated || !hasLayoutChanged) {
      return; // 未登录或布局未变化时不保存
    }
    
    setSaveStatus('saving');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_BASE_URL}/api/topics/save_positions`,
        { nodes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('Positions saved:', response.data);
      setSaveStatus('saved');
      setHasLayoutChanged(false); // 重置布局变化状态
      
      // 3秒后重置保存状态
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (err) {
      console.error('Failed to save node positions:', err);
      setSaveStatus('error');
    }
  }, [nodes, isAuthenticated, hasLayoutChanged]);
  
  // 使用 Debounce 延迟保存，避免频繁 API 调用
  const debounceSavePositions = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveNodePositions();
    }, 2000); // 2秒后保存
  }, [saveNodePositions]);

  // 当节点拖拽结束时调用
  const handleNodeDragStop = useCallback(() => {
    console.log('Node dragging stopped, scheduling position save');
    setHasLayoutChanged(true); // 标记布局已变化
    debounceSavePositions();
  }, [debounceSavePositions]);

  // 节点点击事件处理器
  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    const nodeSlug = node.data?.slug; // 获取节点的 slug
    if (nodeSlug) {
      console.log(`节点 ${node.id} (${node.data.label}) 被点击, slug: ${nodeSlug}, 导航到 /community/topic/${nodeSlug}`);
      navigate(`/community/topic/${nodeSlug}`); // 跳转到对应社区主题页面
    } else {
      console.warn(`节点 ${node.id} (${node.data.label}) 被点击, 但缺少 slug 数据`);
    }
  }, [navigate]);

  // --- 新增：边点击事件处理器 ---
  const handleEdgeClick = useCallback(async (event: React.MouseEvent, edge: Edge) => {
    console.log(`边 ${edge.id} (从 ${edge.source} 到 ${edge.target}) 被点击`);
    
    // 检查用户是否登录
    const token = localStorage.getItem('token');
    if (!token) {
      // 可以提示用户登录或重定向到登录页
      // 为了简单起见，暂时只在控制台打印信息
      console.warn('用户未登录，无法创建或跳转到关系主题。');
      // 可以添加 toast 提示:
      // toast.warn('请登录后查看或创建关系讨论区');
      return; 
    }

    try {
      // 调用后端接口创建或获取关系主题
      const response = await axios.post(
        `${API_BASE_URL}/api/relationship-topics/from-topics`,
        { 
          topic_id_1: parseInt(edge.source), // 确保 ID 是数字
          topic_id_2: parseInt(edge.target)  // 确保 ID 是数字
        },
        { 
          headers: { Authorization: `Bearer ${token}` } 
        }
      );
      
      // 从响应中获取 slug
      const relationshipSlug = response.data?.slug;
      
      if (relationshipSlug) {
        console.log(`获取到关系主题 slug: ${relationshipSlug}, 导航到 /community/relationship-topic/${relationshipSlug}`);
        // 跳转到关系主题页面
        navigate(`/community/relationship-topic/${relationshipSlug}`);
      } else {
        console.error('从后端获取关系主题 slug 失败', response.data);
        // 可以添加 toast 错误提示:
        // toast.error('无法获取关系讨论区信息');
      }
    } catch (err: any) {
      console.error('调用 /from-topics 接口失败:', err);
      // 可以根据错误类型显示不同的提示
      if (err.response && err.response.status === 401) {
         console.error('认证失败或令牌过期');
         // toast.error('请重新登录');
         // 可能需要清除本地 token 并重定向到登录页
         // localStorage.removeItem('token');
         // navigate('/login');
      } else {
        // toast.error('加载关系讨论区时出错');
      }
    }
  }, [navigate]); // 依赖 navigate
  // --- 结束新增 ---

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen text-white">
      <div className="flex flex-1 overflow-hidden pt-16">
        <main className={`flex-1 transition-all duration-300 ease-in-out overflow-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
          <div className="w-full h-full relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10">
                <p className="text-white text-lg">正在加载网络图...</p>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 z-10">
                <p className="text-white text-lg">错误: {error}</p>
              </div>
            )}
            
            {saveStatus !== 'idle' && (
              <div className={`absolute top-4 left-4 py-2 px-4 rounded-md z-20 transition-opacity duration-300 
                backdrop-filter backdrop-blur-md border border-gray-200/30
                ${
                  saveStatus === 'saving' ? 'bg-blue-500/70 text-white' : 
                  saveStatus === 'saved' ? 'bg-green-500/70 text-white' : 
                  'bg-red-500/70 text-white'
                }`}>
                  {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存失败'}
              </div>
            )}
            
            {!isLoading && !error && (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange as OnNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={handleNodeDragStop}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                fitView
                className="bg-transparent"
              >
                <Controls />
                <Background 
                   // variant="dots" // Temporarily remove variant to fix type error
                   gap={12} 
                   size={1} 
                   color="#4a5568"
                />
              </ReactFlow>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default CommunityPage; 