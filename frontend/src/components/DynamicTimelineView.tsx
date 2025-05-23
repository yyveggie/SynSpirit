import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios'; // 导入 axios
import { useTimeline } from '../contexts/TimelineContext';
import { API_BASE_URL } from '../config'; // 导入 API base URL
import DynamicCard from './DynamicCard'; // 导入 DynamicCard
// --- 导入 QuotedDynamicView 以获取其类型 --- 
import { DynamicDetails } from './QuotedDynamicView'; 
import SkeletonDynamicCard from './SkeletonDynamicCard'; // <--- 导入骨架屏组件
// --- 新增：导入评论区组件 (假设我们创建一个新的或复用 Simple) --- 
// import CommentSectionForCard from './CommentSectionForCard'; // 稍后创建或替换
// --- 新增：导入 ActionCommentSection --- 
import ActionCommentSection from './ActionCommentSection'; 
import { useAuth } from '../context/AuthContext';
import ImageViewer from './ImageViewer';
import { useQueryClient, useQuery } from '@tanstack/react-query'; // 导入TanStack Query
// import { FaArrowLeft } from 'react-icons/fa'; // 不再使用左箭头
import { IoMdClose } from 'react-icons/io'; // 使用关闭图标
import { motion } from 'framer-motion'; // <--- 确认导入 motion

// --- 修改：TimelineData 现在是一个扁平列表 --- 
type TimelineData = DynamicDetails[]; 

/**
 * 动态时间线视图组件
 * 
 * 显示与选定动态相关的时间线动态，包括：
 * - 原始动态及其评论
 * - 支持图片查看
 * - 紧凑型布局设计，显示更多评论内容
 * - 使用TanStack Query缓存数据，提高性能
 * - 卡片宽度扩展，减少右侧空白
 * - 移除了垂直连接线和原点标记
 * - 支持延迟加载评论区，以提高初始渲染性能
 */

// 骨架屏组件
const TimelineSkeleton = () => (
  <div>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="animate-pulse bg-gray-200 h-16 rounded mb-3" />
    ))}
  </div>
);

// timeline数据获取函数
const fetchTimeline = async (actionId: number, token?: string) => {
  if (!actionId) return null;
  const response = await axios.get(
    `${API_BASE_URL}/api/actions/${actionId}/timeline`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (response.data && Array.isArray(response.data)) {
    return response.data.reverse();
  }
  return response.data;
};

const DynamicTimelineView: React.FC = () => {
  const { selectedDynamicId, closeTimeline, selectedDynamicData } = useTimeline();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { token } = useAuth();
  const queryClient = useQueryClient();
  
  // 移除 visibleCommentSections 状态
  // const [visibleCommentSections, setVisibleCommentSections] = useState<{ [key: number]: boolean }>({});

  // 使用TanStack Query缓存数据
  const { 
    data: actualData,
    isLoading,
    isFetching,
    error, 
    status
  } = useQuery<TimelineData | null>({
    queryKey: ['timeline', selectedDynamicId],
    queryFn: () => selectedDynamicId ? fetchTimeline(selectedDynamicId as number, token || undefined) : Promise.resolve(null),
    enabled: !!selectedDynamicId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    placeholderData: () => {
      if (selectedDynamicData && selectedDynamicData.action_id) {
        return [selectedDynamicData as DynamicDetails]; 
      }
      return undefined; 
    },
  });

  // 打开图片查看器
  const handleImageClick = (images: string[], index: number) => {
    setViewerImages(images.filter(img => img)); // 过滤掉空图片链接
    setCurrentImageIndex(index);
    setIsViewerOpen(true);
    
    // 记录当前滚动位置，以便图片关闭后恢复
    document.body.setAttribute('data-scroll-position', window.scrollY.toString());
  };
  
  // 关闭图片查看器
  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    
    // 恢复滚动位置
    const savedPosition = document.body.getAttribute('data-scroll-position');
    if (savedPosition) {
      setTimeout(() => {
        window.scrollTo({
          top: parseInt(savedPosition, 10),
          behavior: 'auto'
        });
      }, 100);
    }
  };

  // 判断是否需要显示骨架屏
  const hasDisplayData = !!(actualData && actualData.length > 0);
  const isFirstLoading = isLoading && !hasDisplayData && status === 'pending';

  const renderContent = () => {
    const displayData = actualData ?? (selectedDynamicData && selectedDynamicData.action_id ? [selectedDynamicData as DynamicDetails] : null);

    // 2. 加载出错
    if (status === 'error') {
      console.log("[TimelineView] Render: Error");
      return (
        <div className="relative px-1 pt-2 pb-2">
          <div className="p-4 text-red-400">{(error as Error).message || '获取时间线数据失败'}</div>
        </div>
      );
    }
    // 3. 有数据显示 (无论是真实数据还是占位数据)
    if (displayData && displayData.length === 0) {
      console.log("[TimelineView] Render: Empty Data");
      return (
        <div className="relative px-1 pt-2 pb-2">
          <div className="p-4 text-gray-500">未能加载时间线数据或此动态没有更多上下文。</div>
        </div>
      );
    }
    // 渲染真实数据
    return (
      <div className="relative px-1 pt-2 pb-2">
        {/* 过滤已删除的动态 */}
        {(() => {
          // 过滤掉已删除的动态
          const filteredData = displayData?.filter(dynamic => !dynamic.is_deleted);
          
          if(!filteredData || filteredData.length === 0) {
            return <div className="p-4 text-gray-500">未能加载时间线数据或此动态已被删除。</div>;
          }
          
          return (
            <motion.div 
              className="relative space-y-5 mt-0 w-full"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.1
                  }
                }
              }}
              initial="hidden"
              animate="visible"
            >
              {filteredData.map((dynamic, index) => {
                return (
                <motion.div 
                  key={dynamic.action_id} 
                  className={`w-full relative ${index === filteredData.length - 1 ? 'mb-0' : ''}`}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0 }
                  }}
                >
                  <div className="w-full flex flex-col gap-3 relative">
                    <DynamicCard 
                      dynamic={dynamic} 
                      variant="timeline"
                      onImageClick={handleImageClick}
                      forceExpandContent={true}
                      onActionComplete={handleActionComplete}
                      className="w-[750px] max-w-[750px] pr-0 mx-auto z-10"
                    />
                    <ActionCommentSection 
                      actionId={dynamic.action_id}
                      wrapperClassName="relative w-[750px] max-w-[750px] mx-auto mt-1 max-h-[450px] overflow-y-auto pr-0 bg-opacity-5 bg-purple-900 rounded-md p-2"
                      wrapperStyle={{ scrollbarWidth: 'thin' }}
                    />
                  </div>
                </motion.div>
                );
              })}
            </motion.div>
          );
        })()}
        
        {isViewerOpen && (
          <ImageViewer
            images={viewerImages}
            initialIndex={currentImageIndex}
            onClose={handleCloseViewer}
            isOpen={isViewerOpen}
          />
        )}
      </div>
    );
  };

  // 添加一个处理操作完成的回调函数
  const handleActionComplete = useCallback(() => {
    // 当卡片上的操作(如点赞/收藏/删除)完成时，刷新数据
    if (selectedDynamicId) {
      console.log('操作完成，刷新时间线数据:', selectedDynamicId);
      
      // 强制刷新时间线数据
      queryClient.invalidateQueries({
        queryKey: ['timeline', selectedDynamicId],
      });
      
      // 同时刷新全局动态列表，确保删除操作同步到主页面
      queryClient.invalidateQueries({
        queryKey: ['dynamics'],
      });
    }
  }, [selectedDynamicId, queryClient]);

  // 移除或调整useEffect，因为它依赖于 visibleCommentSections
  useEffect(() => {
    if (selectedDynamicId) {
        // Placeholder
    }
  }, [selectedDynamicId, queryClient]); // 保持 queryClient 作为依赖，如果将来有其他基于 queryClient 的逻辑

  // 预取逻辑：鼠标悬停时预取 timeline
  const handleCardMouseEnter = (actionId: number | null) => {
    if (!actionId) return;
    queryClient.prefetchQuery({
      queryKey: ['timeline', actionId],
      queryFn: () => fetchTimeline(actionId, token || undefined),
    });
  };

  // 监听浏览器返回按钮
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 如果用户点击了浏览器的后退按钮，需要检查是否在动态详情页
      if (window.location.pathname.startsWith('/dynamic/')) {
        // 如果还在动态详情页，但state丢失了，我们主动关闭时间线
        if (!event.state || !event.state.dynamicId) {
          console.log('检测到popstate事件，关闭时间线');
          closeTimeline();
          
          // 强制恢复URL
          const previousUrl = sessionStorage.getItem('previousUrl') || '/';
          sessionStorage.removeItem('previousUrl');
          window.history.replaceState(null, '', previousUrl);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [closeTimeline]);

  // 新增一个包装函数处理关闭
  const handleClose = () => {
    // 1. 先执行原有的关闭逻辑
    closeTimeline();
    
    // 2. 直接通过window.history强制恢复URL
    if (window.location.pathname.startsWith('/dynamic/')) {
      const previousUrl = sessionStorage.getItem('previousUrl') || '/';
      console.log('强制恢复URL从', window.location.pathname, '到', previousUrl);
      sessionStorage.removeItem('previousUrl');
      window.history.replaceState(null, '', previousUrl);
    }
  };

  return (
    <div className="w-full px-0 text-white relative h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
      {/* 关闭按钮移到这里，脱离滚动容器的影响 */}
      <button 
        onClick={handleClose} 
        className="fixed right-4 top-[var(--navbar-height,0px)] z-50 p-1.5 rounded-full text-white bg-blue-600/60 hover:bg-blue-500/80 transition-all duration-150 backdrop-blur-sm shadow-md" 
        aria-label="关闭时间线" 
        title="关闭时间线"
      >
        <IoMdClose className="h-4 w-4" />
      </button>
      
      {/* 骨架屏只在首次无数据时显示 */}
      {isFirstLoading ? (
        <TimelineSkeleton />
      ) : (
        renderContent()
      )}
    </div>
  );
};

export default DynamicTimelineView; 