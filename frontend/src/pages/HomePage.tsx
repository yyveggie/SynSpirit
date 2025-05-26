/**
 * 首页组件 (HomePage)
 * 
 * 功能:
 * - 展示网站核心内容概览，包括最新文章、关注社区的文章等。
 * - 使用 TanStack Query (React Query) 进行数据获取和缓存管理
 * - 集成动态Feed
 * - 实现左侧内容区和右侧动态Feed区的独立滚动
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useUserFavorites } from '../hooks/useFavoriteQueries';
import { toast } from 'react-toastify';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useNewDynamicsNotification } from '../hooks/useNewDynamicsNotification';

// 导入API函数
import { fetchLatestArticles, fetchCommunityArticles, Article } from '../api/articleApi';

// 导入组件
import DynamicFeed, { DynamicFeedHandle, DynamicItem } from '../components/DynamicFeed';
import HomeTabs from '../components/HomeTabs';
import HomeContent from '../components/HomeContent';
import CreateDynamicModal from '../components/CreateDynamicModal';
import AICollapseChat from '../components/AICollapseChat';
import { RecommendationsProvider } from '../context/RecommendationsContext';
import GlobalRecommendationsDisplay from '../components/GlobalRecommendationsDisplay';

const HomePage: React.FC = () => {
  const { user, token } = useAuth();
  const [isAIChatExpanded, setIsAIChatExpanded] = useState(false);
  const { isSidebarOpen } = useSidebar();
  const [activeTab, setActiveTab] = useState('unified');
  // 注释掉动态详情相关状态
  // const [isModalOpen, setIsModalOpen] = useState(false);
  // const [selectedDynamic, setSelectedDynamic] = useState<DynamicDetails | null>(null);
  const navigate = useNavigate();

  // States for CreateDynamicModal
  const [isCreateDynamicModalOpen, setIsCreateDynamicModalOpen] = useState(false);
  const [dynamicContent, setDynamicContent] = useState('');
  const [createDynamicError, setCreateDynamicError] = useState<string | null>(null);
  const [isSubmittingDynamic, setIsSubmittingDynamic] = useState(false);
  const [currentDynamicFeedType, setCurrentDynamicFeedType] = useState<'latest' | 'following'>('latest');

  const dynamicFeedRef = useRef<DynamicFeedHandle>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // 获取用户收藏的社区列表
  const {
    data: favoriteItems = [],
    isLoading: loadingFavorites,
  } = useUserFavorites(token);

  // 获取最新推荐文章
  const {
    data: latestArticles = [],
    isLoading: latestLoading,
    error: latestError,
    refetch: refetchLatestArticles,
  } = useQuery({
    queryKey: ['latestArticles'],
    queryFn: async () => {
      const articles = await fetchLatestArticles();
      return articles;
    },
    staleTime: 5 * 60 * 1000, // 5分钟内不重新获取
  });

  // 确定当前选择的单个社区 (用于原有的单个社区 Tab 逻辑，后续可能移除或重构)
  const selectedCommunity = activeTab.startsWith('community-') 
    ? favoriteItems.find(item => `community-${item.type}-${item.id}` === activeTab) 
    : null;

  // 获取当前选中的单个社区的文章 (用于原有的单个社区 Tab 逻辑)
  const {
    data: communityArticles = [], // 这个状态将主要用于显示单个社区的文章，或作为下面 allFavoriteCommunityArticles 的一部分
    isLoading: communityArticlesLoading,
    error: communityArticlesError,
  } = useQuery({
    queryKey: ['communityArticles', selectedCommunity?.type, selectedCommunity?.id],
    queryFn: () => {
      if (!selectedCommunity) return Promise.resolve([]); // 返回一个解析为数组的 Promise
      const communityIdentifier = selectedCommunity.type === 'topic' 
        ? selectedCommunity.slug 
        : selectedCommunity.id;
      return fetchCommunityArticles(selectedCommunity.type, communityIdentifier);
    },
    enabled: !!selectedCommunity && activeTab !== 'all_communities', // 只有在选中单个社区且不是 'all_communities' tab 时才执行
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // 新增: 获取所有关注社区的文章，用于 "关注社区" Tab
  const {
    data: allFavoriteCommunityArticles = [],
    isLoading: allFavoriteCommunityArticlesLoading,
    error: allFavoriteCommunityArticlesError,
  } = useQuery<Article[], Error>({
    queryKey: ['allFavoriteCommunityArticles', token, favoriteItems.map(fav => fav.id).join(',')],
    queryFn: async (): Promise<Article[]> => {
      if (!user || favoriteItems.length === 0) {
        return [];
      }
      try {
        // 过滤出只有'topic'类型的收藏项
        const topicItems = favoriteItems.filter(item => item.type === 'topic');
        
        if (topicItems.length === 0) {
          return [];
        }
        
        const articlesPromises = topicItems.map(async (item) => {
          // 所有项都是'topic'类型，直接使用slug
          const communityIdentifier = item.slug;
          const articlesFromThisCommunity = await fetchCommunityArticles('topic', communityIdentifier);
          
          // 进行字段名映射，确保计数正确传递
          return articlesFromThisCommunity.map((article: any) => ({
            ...article,
            like_count: article.likes_count !== undefined ? article.likes_count : article.like_count,
            collect_count: article.collects_count !== undefined ? article.collects_count : article.collect_count,
            comment_count: article.comments_count !== undefined ? article.comments_count : article.comment_count,
            share_count: article.shares_count !== undefined ? article.shares_count : article.share_count,
            communityNameDisplay: item.name, 
            communityType: 'topic',
            communitySlug: item.slug
          }));
        });
        const articlesByCommunityWithNames = await Promise.all(articlesPromises);
        const allArticles = articlesByCommunityWithNames.flat();
        
        allArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        return allArticles;
      } catch (error) {
        console.error('[HomePage] 获取所有关注社区文章失败:', error);
        throw error;
      }
    },
    enabled: !!user && (activeTab === 'all_communities' || activeTab === 'unified') && favoriteItems.length > 0 && !loadingFavorites,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // 获取动态新消息计数
  const {
    latestFeedNewCount,
    followingFeedNewCount,
    updateLastSeenLatestFeedId,
    updateLastSeenFollowingFeedId,
    forceRefreshCounts,
    incrementLatestCount,
    incrementFollowingCount
  } = useNewDynamicsNotification();

  // 创建空函数用于满足DynamicFeed的属性要求，但不执行任何操作
  const emptyHandler = useCallback((dynamicData: DynamicItem) => {
    // 空函数，不做任何操作
    // console.log('动态详情已禁用'); // 减少不必要的日志
  }, []);

  // 在渲染 HomeContent 前打印相关数据
  const articlesForHomeContent = activeTab === 'all_communities' ? allFavoriteCommunityArticles : communityArticles;
  const finalLatestArticles = activeTab === 'latest' ? latestArticles : [];

  // --- ADDED: Handler for submitting new dynamic post ---
  const handleCreateDynamicSubmit = async (content: string, images?: string[]) => {
    if (!token || !user) {
      toast.error('请先登录后再发布动态');
      setCreateDynamicError('请先登录');
      return;
    }
    setIsSubmittingDynamic(true);
    setCreateDynamicError(null);

    const payload = {
      action_type: 'create_status',
      target_type: 'user',
      target_id: user.id,
      content: content,
      images: images || [],
    };

    try {
      console.log('Submitting new dynamic (status) with payload:', payload);
      const response = await axios.post(`${API_BASE_URL}/api/actions`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 201 && response.data) {
        toast.success('动态发布成功！');
        setIsCreateDynamicModalOpen(false);
        setDynamicContent('');
        
        // 在成功发布后强制刷新计数，确保在"关注"和"推荐"中都能看到红点通知
        forceRefreshCounts();
        
        // 特别确保"关注动态"按钮也会闪红光，因为自己的动态也在关注列表中
        // 这里使用setTimeout确保计数更新在UI上显示
        setTimeout(() => {
          // 使用新的方法增加关注动态的计数
          incrementFollowingCount();
          // 同时也增加推荐动态的计数
          incrementLatestCount();
        }, 500);
        
        // 刷新动态Feed内容
        if (dynamicFeedRef.current && typeof dynamicFeedRef.current.refreshFeed === 'function') {
          dynamicFeedRef.current.refreshFeed();
        }
      } else {
        const errorMsg = response.data?.message || '发布动态时出错，请稍后重试。';
        setCreateDynamicError(errorMsg);
        toast.error(`发布失败: ${errorMsg}`);
      }
    } catch (err: any) {
      console.error('创建动态失败:', err);
      const errorMsg = err.message || '发布动态时出错，请稍后重试。';
      setCreateDynamicError(errorMsg);
      toast.error(`发布失败: ${errorMsg}`);
    } finally {
      setIsSubmittingDynamic(false);
    }
  };

  const handleToggleAIChatExpand = () => {
    setIsAIChatExpanded(prev => !prev);
  };

  // 添加一个事件监听器，用于从导航栏打开创建动态模态框
  useEffect(() => {
    const handleOpenCreateDynamicModal = () => {
      setIsCreateDynamicModalOpen(true);
    };
    // 监听自定义事件
    window.addEventListener('openCreateDynamicModal', handleOpenCreateDynamicModal);
    
    // 清理函数
    return () => {
      window.removeEventListener('openCreateDynamicModal', handleOpenCreateDynamicModal);
    };
  }, []);

  // 添加一个事件监听器，用于从DynamicFeed组件接收当前动态类型的变化
  useEffect(() => {
    const handleFeedTypeChange = (e: CustomEvent) => {
      if (e.detail === 'latest' || e.detail === 'following') {
        setCurrentDynamicFeedType(e.detail);
      }
    };
    
    window.addEventListener('dynamicFeedTypeChanged', handleFeedTypeChange as EventListener);
    
    return () => {
      window.removeEventListener('dynamicFeedTypeChanged', handleFeedTypeChange as EventListener);
    };
  }, []);

  // 处理动态类型切换的函数
  const handleFeedTypeChange = (type: 'latest' | 'following') => {
    if (type === currentDynamicFeedType) return; // 避免重复切换相同类型
    
    console.log(`[HomePage] 切换动态类型从 ${currentDynamicFeedType} 到 ${type}`);
    setCurrentDynamicFeedType(type);
    
    // 发送切换事件，让DynamicFeed组件处理动画和数据加载
    window.dispatchEvent(new CustomEvent('dynamicFeedTypeChange', { detail: type }));
    
    // 强制刷新后直接重置红点提示，不需要等待DynamicFeed组件处理
    forceRefreshCounts();
    
    // 尝试获取DynamicFeed中的最新ID
    setTimeout(() => {
      if (dynamicFeedRef.current) {
        // 刷新Feed数据
        dynamicFeedRef.current.refreshFeed();
      }
      
      // 无论获取到ID与否，都直接重置当前类型的计数
      if (type === 'latest') {
        updateLastSeenLatestFeedId(Date.now()); // 使用当前时间戳作为ID，确保大于服务器返回的任何ID
      } else {
        updateLastSeenFollowingFeedId(Date.now());
      }
    }, 500); // 给DynamicFeed一点时间加载数据
  };
  
  // 处理刷新动态的函数
  const handleRefreshFeed = () => {
    console.log('[HomePage] 触发动态刷新');
    // 添加一个刷新按钮旋转动画的类
    const refreshButton = document.getElementById('refresh-button-icon');
    if (refreshButton) {
      refreshButton.classList.add('animate-spin');
      // 动画持续1秒后移除
      setTimeout(() => {
        refreshButton.classList.remove('animate-spin');
      }, 1000);
    }
    
    // 触发动态刷新事件
    window.dispatchEvent(new CustomEvent('dynamicFeedRefresh'));
    
    // 强制刷新计数
    forceRefreshCounts();
    
    // 使用DynamicFeed的引用直接刷新
    if (dynamicFeedRef.current) {
      dynamicFeedRef.current.refreshFeed();
    }
    
    // 500ms后重置当前类型的计数，确保红点消失
    setTimeout(() => {
      // 无论是否获取到新ID，都重置计数
      if (currentDynamicFeedType === 'latest') {
        updateLastSeenLatestFeedId(Date.now());
      } else {
        updateLastSeenFollowingFeedId(Date.now());
      }
    }, 500);
  };

  return (
    <RecommendationsProvider>
      <div className="text-gray-200 relative bg-transparent flex flex-col min-h-screen">
        <main 
          ref={mainContentRef} 
          className={`w-full max-w-screen-2xl mx-auto px-6 md:px-8 pt-4 pb-16 transition-transform duration-500 ease-out ${isSidebarOpen ? 'md:translate-x-48' : 'translate-x-0'} relative z-30 flex flex-col md:flex-row gap-8 flex-1`}
        >
          {/* 左侧内容区：主内容，无限滚动 */}
          <div className="flex-grow min-w-0 md:max-w-2xl lg:max-w-3xl md:pt-0 flex flex-col">
            
            {/* 顶部固定区域：AI对话框 */}
            <div className="mb-2 flex-shrink-0">
              <AICollapseChat isExpanded={isAIChatExpanded} onToggleExpand={handleToggleAIChatExpand} />
            </div>

            {/* 全局推荐内容展示区域 */}
            <GlobalRecommendationsDisplay isChatboxExpanded={isAIChatExpanded} />
            
            {/* 顶部固定区域：Tabs 按钮 */}
            <HomeTabs 
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              favoriteItems={favoriteItems}
              user={user}
            />

            {/* Tab 下方内容：主要内容区域 */}
            <div className="flex-1">
              <HomeContent 
                activeTab={activeTab}
                latestArticles={latestArticles}
                latestLoading={latestLoading}
                latestError={latestError}
                communityArticles={allFavoriteCommunityArticles}
                communityArticlesLoading={allFavoriteCommunityArticlesLoading}
                communityArticlesError={allFavoriteCommunityArticlesError}
                selectedCommunity={selectedCommunity}
                isAllCommunitiesView={true}
              />
            </div>
          </div>
          
        {/* 右侧整体区域 - 包含动态Feed和按钮 */}
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0 md:sticky md:top-0 md:self-start md:h-screen relative overflow-hidden">
          {/* 动态Feed */}
          <div className="w-full h-full md:overflow-y-auto scrollbar-hide dynamic-feed-container relative" id="dynamic-feed">
            {/* 自定义滚动条样式 */}
            <style>{`
              #dynamic-feed::-webkit-scrollbar {
                display: none;
                width: 0;
                background: transparent;
              }
              #dynamic-feed {
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE and Edge */
                height: 100vh; /* 设置动态Feed容器高度为视口高度 */
                overflow-y: auto; /* 确保可滚动 */
              }
            `}</style>
            
            {/* 动态信息流 - 传递空函数给openDynamicModal以满足类型要求 */}
            <DynamicFeed 
              className="h-full w-full scrollbar-hide"
              ref={dynamicFeedRef} 
              token={token} 
              openDynamicModal={emptyHandler}
            />
            
            {/* 动态Feed控制按钮组 - 固定在右侧但无背景 */}
            <div className="absolute top-4 right-2 flex flex-col space-y-2 z-10">
              {/* 推荐动态按钮 */}
              <button 
                onClick={() => handleFeedTypeChange('latest')}
                className={`p-1 rounded-full w-6 h-6 flex items-center justify-center transition-all duration-200 focus:outline-none ${
                  currentDynamicFeedType === 'latest' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-200 hover:text-white'
                } ${latestFeedNewCount > 0 ? 'shadow-[0_0_10px_rgba(239,68,68,0.7)] animate-pulse' : ''}`}
                title="推荐动态"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
              
              {/* 关注动态按钮 */}
              <button 
                onClick={() => handleFeedTypeChange('following')}
                className={`p-1 rounded-full w-6 h-6 flex items-center justify-center transition-all duration-200 focus:outline-none ${
                  currentDynamicFeedType === 'following' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-200 hover:text-white'
                } ${followingFeedNewCount > 0 ? 'shadow-[0_0_10px_rgba(239,68,68,0.7)] animate-pulse' : ''}`}
                title="关注动态"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
              
              {/* 刷新按钮 */}
              <button 
                onClick={handleRefreshFeed}
                className="p-1 rounded-full w-6 h-6 flex items-center justify-center text-gray-200 hover:text-white focus:outline-none focus:ring-0 transition-all"
                title="刷新动态"
              >
                <svg id="refresh-button-icon" className="h-3 w-3 transition-transform duration-1000" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
      
      {/* 移除右下角的Chatbot组件，使用顶部的AICollapseChat代替 */}
      {/* <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} /> */}

      {/* ADDED CreateDynamicModal */}
      <CreateDynamicModal
        isOpen={isCreateDynamicModalOpen}
        onClose={() => {
          setIsCreateDynamicModalOpen(false);
          setDynamicContent(''); // Clear content when modal is closed without submitting
          setCreateDynamicError(null);
        }}
        onSubmit={handleCreateDynamicSubmit}
        content={dynamicContent}
        setContent={setDynamicContent}
        error={createDynamicError}
        isLoading={isSubmittingDynamic}
      />

      {/* 注释掉动态详情模态框 */}
      {/*
      {isModalOpen && selectedDynamic && (
        <Modal 
          isOpen={isModalOpen} 
          onClose={handleCloseDetailModal}
          maxWidthClass="max-w-5xl"
        >
          <DynamicDetailView 
            dynamic={selectedDynamic} 
            onClose={handleCloseDetailModal} 
          />
        </Modal>
      )}
      */}
    </div>
    </RecommendationsProvider>
  );
};

export default HomePage;
