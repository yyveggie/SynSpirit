import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext';
import CommunityGraphView from '../components/CommunityGraphView'; // 导入新的图谱组件

// 定义社区主题的数据结构 (主要用于创建表单，图谱组件内部会重新获取和处理节点数据)
interface CommunityTopicForForm {
  name: string;
  description?: string;
}

// API返回的原始节点数据结构
interface ApiTopicNode {
    id: string | number;
    data: {
        label: string; // 这对应我们的 name
        slug: string;
        description?: string; // 可选的描述
    };
    // ReactFlow 特有的其他字段 (例如 position, style)，我们在这里会忽略大部分
    style?: any; // style 对象可以包含颜色等信息，暂时不用
}

// 获取主题列表API的响应结构
interface FetchTopicsResponse {
    nodes: ApiTopicNode[];
}

const CommunityPage: React.FC = () => {
  const navigate = useNavigate(); // navigate 仍然可能用于其他地方，或者在图谱组件内部处理节点点击
  const { isSidebarOpen } = useSidebar();
  
  // 创建表单相关的 state 保持不变
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDescription, setNewTopicDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // topics, isLoading, error state 将不再直接用于此页面渲染主题列表，
  // 因为 CommunityGraphView 会自己获取和管理这些数据。
  // 但 fetchCommunityTopics 仍然可以在成功创建主题后被调用，以触发图谱组件的刷新
  // (虽然理想情况下图谱组件应该自己处理数据更新，例如通过 React Query 或 SWR)
  // 为了简单起见，我们暂时保留 fetchCommunityTopics 并在创建成功后调用，
  // 假设 CommunityGraphView 会在 token 或其内部依赖变化时重新获取数据。
  const [triggerGraphRefresh, setTriggerGraphRefresh] = useState(0); // 用于强制刷新图谱

  const fetchCommunityTopicsDummy = useCallback(async () => {
    // 这个函数现在主要用于创建成功后触发 CommunityGraphView 的刷新
    // 实际的数据获取在 CommunityGraphView 内部
    setTriggerGraphRefresh(prev => prev + 1);
  }, []);

  // 创建新主题的表单提交处理 (基本保持不变)
  const handleCreateTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    if (!newTopicName.trim()) {
      setCreateError('主题名称不能为空。');
      setIsCreating(false);
      return; 
    }

    try {
      // API端点创建主题，根据你的后端文档是 POST /api/
      // 后端需要处理：1. 移除管理员权限 2. 根据name生成slug 3. 确保name/slug唯一
      const response = await axios.post<CommunityTopicForForm>(
        `${API_BASE_URL}/api/`, 
        { 
          name: newTopicName, 
          description: newTopicDescription,
          style_shape: 'circle'
        }
      );
      // 成功后不再强制刷新图谱，而是提示用户
      // fetchCommunityTopicsDummy(); 
      alert('新社区主题已成功提交，正在等待管理员审核。'); // New success message
      
      setNewTopicName('');
      setNewTopicDescription('');
      setShowCreateForm(false); // 关闭创建表单
    } catch (err: any) {
      console.error("创建主题失败:", err);
      if (err.response && err.response.status === 409) {
        setCreateError('该主题名称已存在，请使用其他名称。');
      } else if (err.response && err.response.data && err.response.data.error) {
        setCreateError(`创建失败: ${err.response.data.error}`);
      } else {
        setCreateError('创建主题失败，请检查网络或稍后重试。');
      }
    } finally {
      setIsCreating(false);
      }
    };

  // 加载和错误状态现在由 CommunityGraphView 内部处理，
  // CommunityPage 的顶层不再需要这些状态的条件渲染（除非是针对创建表单的）。

  return (
    <div className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto p-4 md:p-6 ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'} text-white min-h-screen bg-transparent pt-2 md:pt-3`}>
      <div className="container mx-auto max-w-7xl px-4">
        {/* 创建新社区的表单区域 */} 
        {showCreateForm && (
          <section id="create-topic-form" className="bg-gray-800 p-6 md:p-8 rounded-xl shadow-2xl mb-10 md:mb-12 border border-gray-700">
            <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-gray-100">创建你的社区主题</h2>
            <form onSubmit={handleCreateTopicSubmit} className="space-y-6">
              <div>
                <label htmlFor="topicName" className="block text-sm font-medium text-gray-300 mb-1.5">社区名称*</label>
                <input 
                  type="text" 
                  id="topicName"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  className="w-full p-3 rounded-md bg-gray-700/80 border border-gray-600 text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-500 shadow-sm text-base transition-colors duration-150"
                  placeholder="例如：科幻电影鉴赏、健康饮食与健身"
                  required
                  aria-describedby="topicNameHelp"
                />
                <p id="topicNameHelp" className="mt-1.5 text-xs text-gray-400">为你的社区起一个独特且吸引人的名称。</p>
              </div>
              <div>
                <label htmlFor="topicDescription" className="block text-sm font-medium text-gray-300 mb-1.5">社区描述 (可选)</label>
                <textarea 
                  id="topicDescription"
                  value={newTopicDescription}
                  onChange={(e) => setNewTopicDescription(e.target.value)}
                  rows={4}
                  className="w-full p-3 rounded-md bg-gray-700/80 border border-gray-600 text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-500 shadow-sm text-base transition-colors duration-150"
                  placeholder="简单介绍一下你的社区是关于什么的，成员们可以在这里讨论哪些话题..."
                  aria-describedby="topicDescriptionHelp"
                />
                <p id="topicDescriptionHelp" className="mt-1.5 text-xs text-gray-400">一段好的描述能帮助大家更好地了解你的社区。</p>
              </div>
              {createError && (
                <div role="alert" className="text-red-300 text-sm bg-red-800/50 p-3 rounded-md border border-red-700/70">
                  <p className="font-medium">创建失败：</p>
                  <p>{createError}</p>
              </div>
            )}
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-md transition-all duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 text-base"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      正在创建...
                    </>
                  ) : '确认创建'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* 新的容器，包裹按钮和图谱，按钮在图谱左上方 */}
        <div className="mt-6 md:mt-8">
          <div className="mb-4"> {/* Container for the button to position it above the graph */}
            <button 
              type="button" 
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="rounded-lg border border-primary-100 bg-primary-100 px-5 py-2.5 text-center text-sm font-medium text-primary-600 transition-all hover:border-primary-200 hover:bg-primary-200 focus:ring focus:ring-primary-50 disabled:border-primary-50 disabled:bg-primary-50 disabled:text-primary-400"
              aria-expanded={showCreateForm}
              aria-controls="create-topic-form"
            >
              {showCreateForm ? '收起创建表单' : '创建新社区'}
            </button>
          </div>

          {/* 包裹图谱组件的 div */}
          {/* Applying w-auto and inline-block to see if it constrains to graph's internal width */}
          <div className="inline-block bg-transparent"> 
            <CommunityGraphView key={triggerGraphRefresh} /> { /* key 用于在创建新主题后强制刷新图谱 */ }
          </div>
        </div>

      </div>
      {/* 辅助CSS类，用于多行文本截断 (如果其他地方还需要) */}
      {/* 如果不需要，可以考虑移除这些样式，或者将它们移到全局CSS文件 */}
      <style dangerouslySetInnerHTML={{ __html: `
        .G_truncate_2_lines {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 3em; /* 假设 line-height 约为 1.5em */
        }
        .G_truncate_3_lines {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          max-height: 4.5em; /* 假设 line-height 约为 1.5em */
        }
      ` }} />
    </div>
  );
};

export default CommunityPage; 
