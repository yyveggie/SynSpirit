import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
// 使用现有组件替代自定义UI组件
import SimpleArticleCard from '../components/SimpleArticleCard';
import SimplePostCard from '../components/SimplePostCard';
import SimpleDynamicCard from '../components/SimpleDynamicCard';

/**
 * UserSpacePage 组件
 * 
 * 功能：展示当前登录用户的收藏和点赞的文章、帖子和动态
 * - 分类显示用户交互的内容
 * - 支持筛选不同类型的内容和交互
 * - 分页加载
 * - 点击内容可跳转到详情页
 */
const UserSpacePage: React.FC = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [interactionType, setInteractionType] = useState('all');
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0,
    page: 1,
    per_page: 10
  });
  const [error, setError] = useState<string | null>(null);

  // 加载用户交互数据
  const fetchInteractions = async (page = 1, contentType: string | null = null, interactionType: string | null = null) => {
    setLoading(true);
    try {
      let url = `/api/users/me/interactions?page=${page}&per_page=${pagination.per_page}`;
      
      // 添加内容类型过滤
      if (contentType && contentType !== 'all') {
        url += `&content_type=${contentType}`;
      }
      
      // 添加交互类型过滤
      if (interactionType && interactionType !== 'all') {
        url += `&interaction_type=${interactionType}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('获取数据失败');
      }
      
      const data = await response.json();
      if (data.code === 200) {
        setInteractions(data.data.interactions);
        setPagination(data.data.pagination);
      } else {
        setError(data.message || '加载失败');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('获取交互数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载或者参数变化时重新获取数据
  useEffect(() => {
    if (token) {
      const contentType = activeTab === 'all' ? null : activeTab;
      const interaction = interactionType === 'all' ? null : interactionType;
      fetchInteractions(1, contentType, interaction);
    } else {
      // 未登录时跳转到登录页
      navigate('/login');
    }
  }, [token, activeTab, interactionType, navigate]);

  // 处理分页
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      const contentType = activeTab === 'all' ? null : activeTab;
      const interaction = interactionType === 'all' ? null : interactionType;
      fetchInteractions(newPage, contentType, interaction);
    }
  };

  // 处理内容类型Tab切换
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // 处理交互类型切换
  const handleInteractionTypeChange = (type: string) => {
    setInteractionType(type);
  };

  // 渲染内容列表
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-6 text-red-500">
          <p>{error}</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              setError(null);
              const contentType = activeTab === 'all' ? null : activeTab;
              const interaction = interactionType === 'all' ? null : interactionType;
              fetchInteractions(1, contentType, interaction);
            }}
          >
            重试
          </button>
        </div>
      );
    }

    if (interactions.length === 0) {
      return (
        <div className="text-center p-10 text-gray-400">
          暂无内容
        </div>
      );
    }

    return (
      <div className="grid gap-6 mt-6">
        {interactions.map((item) => {
          if (item.type === 'article') {
            return (
              <SimpleArticleCard
                key={`article-${item.id}`}
                article={{
                  id: item.content_id,
                  title: item.title,
                  coverImage: item.cover_image,
                  creator: item.creator,
                  createdAt: item.created_at
                }}
              />
            );
          } else if (item.type === 'post') {
            return (
              <SimplePostCard
                key={`post-${item.id}`}
                post={{
                  id: item.content_id,
                  title: item.title,
                  coverImage: item.cover_image,
                  creator: item.creator,
                  createdAt: item.created_at
                }}
              />
            );
          } else if (item.type === 'action') {
            // 确保images是数组类型
            let imagesArray: string[] = [];
            
            // 检查item.images是否存在且是数组
            if (item.images) {
              if (Array.isArray(item.images)) {
                imagesArray = item.images;
              } else if (typeof item.images === 'string') {
                // 如果是字符串(但可能是空字符串)，尝试分割
                imagesArray = item.images.trim() ? item.images.split(',') : [];
              }
            }
            
            return (
              <SimpleDynamicCard
                key={`action-${item.id}`}
                dynamic={{
                  id: item.content_id,
                  content: item.content_preview || item.content,
                  images: imagesArray,
                  user: item.creator,
                  createdAt: item.created_at
                }}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  // 渲染分页控件
  const renderPagination = () => {
    if (pagination.pages <= 1) return null;
    
    return (
      <div className="flex justify-center mt-8 mb-4">
        <div className="flex space-x-2">
          <button
            className={`px-4 py-2 rounded border border-blue-400/30 text-white ${
              pagination.page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-100/10'
            }`}
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            上一页
          </button>
          
          <span className="flex items-center px-4 bg-purple-100 text-purple-800 rounded">
            {pagination.page} / {pagination.pages}
          </span>
          
          <button
            className={`px-4 py-2 rounded border border-blue-400/30 text-white ${
              pagination.page === pagination.pages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-100/10'
            }`}
            disabled={pagination.page === pagination.pages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">我的空间</h1>
      
      {/* 交互类型过滤器 */}
      <div className="mb-6 flex gap-4">
        <button
          className={`px-4 py-2 rounded font-medium ${
            interactionType === 'all' 
              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
              : 'bg-transparent hover:bg-blue-100/10 text-white border border-blue-400/30'
          }`}
          onClick={() => handleInteractionTypeChange('all')}
        >
          全部
        </button>
        <button
          className={`px-4 py-2 rounded font-medium ${
            interactionType === 'like' 
              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
              : 'bg-transparent hover:bg-blue-100/10 text-white border border-blue-400/30'
          }`}
          onClick={() => handleInteractionTypeChange('like')}
        >
          我的点赞
        </button>
        <button
          className={`px-4 py-2 rounded font-medium ${
            interactionType === 'collect' 
              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
              : 'bg-transparent hover:bg-blue-100/10 text-white border border-blue-400/30'
          }`}
          onClick={() => handleInteractionTypeChange('collect')}
        >
          我的收藏
        </button>
      </div>
      
      {/* 内容类型选项卡 */}
      <div className="border-b border-gray-200/20 mb-6">
        <div className="-mb-px flex space-x-8">
          <button
            className={`py-2 px-1 font-medium text-sm border-b-2 ${
              activeTab === 'all'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-300 hover:text-gray-100 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('all')}
          >
            全部内容
          </button>
          <button
            className={`py-2 px-1 font-medium text-sm border-b-2 ${
              activeTab === 'article'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-300 hover:text-gray-100 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('article')}
          >
            文章
          </button>
          <button
            className={`py-2 px-1 font-medium text-sm border-b-2 ${
              activeTab === 'post'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-300 hover:text-gray-100 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('post')}
          >
            帖子
          </button>
          <button
            className={`py-2 px-1 font-medium text-sm border-b-2 ${
              activeTab === 'action'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-300 hover:text-gray-100 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('action')}
          >
            动态
          </button>
        </div>
      </div>
      
      {/* 内容列表 */}
      {renderContent()}
      
      {/* 分页控件 */}
      {renderPagination()}
    </div>
  );
};

export default UserSpacePage; 