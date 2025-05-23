/**
 * @file DynamicFeed.tsx
 * @description 动态信息流组件，负责显示和无限滚动加载用户分享动态。
 *              使用自定义 Hook (useDynamicFeed) 结合 TanStack Query 进行数据获取和缓存管理。
 *              支持切换"推荐动态"和"关注动态"两种模式。
 *              支持切换时的平滑动画效果。
 *              支持无限滚动加载更多内容。
 *              通过 useImperativeHandle 暴露 updateItem 和 refreshFeed 方法，允许父组件更新或刷新列表。
 *              使用 react-virtuoso 实现列表虚拟化以提高性能。
 * 
 * @note 数据获取和缓存逻辑已封装在 frontend/src/hooks/useDynamicFeedQueries.ts 中。
 */
import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
// 移除 axios，因为 API 调用在 Hook 中
import DynamicCard from './DynamicCard';
import { DynamicDetails } from './QuotedDynamicView'; // 用于 openDynamicModal 类型
// 移除 List, 因为不再使用虚拟列表
import { motion, AnimatePresence } from 'framer-motion'; // 使用framer-motion增强动画效果
// 移除 useQueryClient, useInfiniteQuery, 因为它们在 Hook 中使用
import { useDynamicFeed } from '../hooks/useDynamicFeedQueries'; // 导入自定义 Hook
import { useSidebar } from '../contexts/SidebarContext'; // Example import, adjust if needed
import { useTimeline } from '../contexts/TimelineContext'; // <--- 导入 useTimeline
import { useNewDynamicsNotification } from '../hooks/useNewDynamicsNotification'; // <--- 导入新动态通知 Hook
import { fetchDynamicsPage } from '../hooks/useDynamicFeedQueries';
import { throttle } from 'lodash'; // 导入lodash的throttle函数
import { Virtuoso } from 'react-virtuoso'; // <--- 导入 Virtuoso

// --- 与 HomePage 中的 DynamicItem 接口保持一致 --- 
// (理想情况下应定义在共享类型文件中)
// 导出 DynamicItem 类型
export interface DynamicItem {
  action_id: number; 
  share_comment: string | null;
  shared_at: string;
  sharer_id: number | null;
  sharer_username: string;
  sharer_avatar_url?: string | null;
  is_repost: boolean; 
  original_action: DynamicDetails | null;
  target_type: 'article' | 'post' | 'action' | 'tool' | 'user' | 'user_status' | 'deleted' | string; 
  target_title: string | null;
  target_slug: string | null; 
  target_id: number | null;
  images?: string[];
  likes_count?: number;      
  collects_count?: number;
  reposts_count?: number;
  is_liked_by_current_user?: boolean;
  is_collected_by_current_user?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
  is_deleted?: boolean;
}

interface DynamicFeedProps {
  token: string | null;
  // 点击动态卡片时调用的函数，用于打开详情模态框
  openDynamicModal: (item: DynamicItem) => void; 
  // 添加className属性，允许从外部传入样式类
  className?: string;
}

// --- 定义handle接口用于命令式方法 --- 
export interface DynamicFeedHandle {
  updateItem: (updatedItem: DynamicItem) => void;
  refreshFeed: () => void;
  scrollToTop: () => void; // 新增滚动到顶部的方法
}

// 动态类型枚举
type DynamicFeedType = 'latest' | 'following';

// --- 移除 fetchDynamicsPage 函数 --- 
/*
const fetchDynamicsPage = async ({ pageParam = 1, queryKey, token }: { pageParam?: number; queryKey: (string | null)[]; token: string | null }) => {
  // ... (逻辑已移至 Hook)
};
*/

// --- 使用 forwardRef 包装组件并实现 useImperativeHandle --- 
const DynamicFeed = forwardRef<DynamicFeedHandle, DynamicFeedProps>(({ token, openDynamicModal, className }, ref) => {
  const { isSidebarOpen } = useSidebar();
  const { selectedDynamicId } = useTimeline(); // <--- 获取 selectedDynamicId
  const [feedType, setFeedType] = useState<DynamicFeedType>('latest');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // --- 使用新动态通知 Hook ---
  const {
    latestFeedNewCount,
    followingFeedNewCount,
    updateLastSeenLatestFeedId,
    updateLastSeenFollowingFeedId,
    forceRefreshCounts // 可选：如果需要在父组件或内部刷新计数
  } = useNewDynamicsNotification();

  // --- 使用自定义 Hook 获取数据和状态 (包含 isRefetching) ---
  const {
    data,             // 包含 pages 和 flatDynamics
    error,            // 错误对象
    fetchNextPage,    // 加载下一页的函数
    hasNextPage,      // 是否有下一页
    isLoading,        // 初始加载状态
    isFetchingNextPage,// 是否正在加载下一页
    isError,          // 是否出错
    refetch,          // 手动触发重新获取第一页
    isRefetching,     // 新增：获取手动刷新的状态
    queryClient       // 从 Hook 获取 queryClient
  } = useDynamicFeed({ feedType, token });

  /* 移除内部 useInfiniteQuery 调用
  const {
    // ... (内部调用已移除)
  } = useInfiniteQuery({
    // ... (配置已移至 Hook)
  });
  */

  // --- 从 Hook 返回的数据中获取扁平化列表和错误 ---
  const flatDynamics = data?.flatDynamics ?? [];
  const dynamicsError = error instanceof Error ? error.message : null;
  
  // 虚拟列表ref（移除，因为不再使用虚拟列表）
  // const listRef = useRef<List>(null);
  // 外部容器ref
  const containerRef = useRef<HTMLDivElement>(null);
  // 滚动容器ref（新增，用于直接滚动控制）
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // 是否已滚动到底部
  const reachedBottomRef = useRef<boolean>(false);

  const virtuosoRef = useRef<any>(null); // Ref for Virtuoso component

  // --- 获取动态项目高度的函数 --- (保留但不再使用)
  const getItemSize = (index: number): number => {
    // ... 保持原始逻辑，但不再使用
    return 150; // 返回默认值，因为我们现在不使用虚拟滚动
  };

  // --- 暴露方法通过 useImperativeHandle --- 
  useImperativeHandle(ref, () => ({
    updateItem: (updatedItem) => {
      console.log("[DynamicFeed] Updating item via ref using setQueryData:", updatedItem);
      // 使用 setQueryData 手动更新缓存
      // 注意：这直接修改缓存，如果后端更新失败，可能导致UI与后端不一致
      // 推荐做法是在 mutation 成功后 invalidateQueries(['dynamics', feedType])
      queryClient.setQueryData(['dynamics', feedType, token], (oldData: any) => {
        if (!oldData || !oldData.pages) return oldData; // 添加检查

        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => {
             // 添加对 page 和 page.dynamics 的检查
             if (!page || !page.dynamics) return page;
            return {
              ...page,
              dynamics: page.dynamics.map((d: DynamicItem) =>
          d.action_id === updatedItem.action_id ? updatedItem : d
              ),
          }
          }),
        };
      });
    },
    refreshFeed: () => {
      console.log("[DynamicFeed] Refreshing feed via ref by invalidating queries");
      // 使当前 feedType 的查询失效，React Query 会自动重新获取
      queryClient.invalidateQueries({ queryKey: ['dynamics', feedType, token] });
      
      // 滚动到顶部
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
      }
    },
    scrollToTop: () => { // 实现 scrollToTop
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: 0, align: 'start', behavior: 'smooth' });
      }
    }
  }), [queryClient, feedType, token]);

  // --- 处理动态类型切换 ---
  const handleFeedTypeChange = useCallback((type: DynamicFeedType) => {
    if (type === feedType || isTransitioning) return;
    
    console.log(`[DynamicFeed] handleFeedTypeChange: Changing from ${feedType} to ${type}`);
    setIsTransitioning(true);
    setFeedType(type); // 设置新的 feedType
    
    // 发出事件通知HomePage当前动态类型已改变
    window.dispatchEvent(new CustomEvent('dynamicFeedTypeChanged', { detail: type }));
    
    // 在 feedType 更新后，调用 refetch 来获取新类型的数据
    // React Query 会使用新的 feedType 来构建 queryKey 并执行查询
    refetch(); // <--- 新增：在这里调用 refetch

    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: 0, align: 'start' }); // 切换时滚动到顶部
    }
    
    // 动画完成后重置 transitioning 状态
    // 当 feedType 改变后，useDynamicFeed 会重新获取数据
    // 数据获取完成后，上面的 useEffect 会处理 updateLastSeen...Id
    setTimeout(() => {
      setIsTransitioning(false);
      console.log("[DynamicFeed] Transition complete.");
    }, 400);
  }, [feedType, isTransitioning, refetch]);

  // Virtuoso 的 endReached 回调
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      console.log("[DynamicFeed] Virtuoso endReached: Fetching next page...");
        fetchNextPage().catch(error => {
        console.error('[DynamicFeed] Virtuoso fetchNextPage failed:', error);
      });
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  // 当 feedType 改变且数据加载完毕后，更新 lastSeenId
  useEffect(() => {
    if (!isLoading && !isRefetching && flatDynamics.length > 0) {
      const latestIdInFeed = flatDynamics[0]?.action_id ?? null;
      if (feedType === 'latest') {
        // 只有当用户确实在看这个tab且有新内容时才更新，避免后台轮询错误地清除红点
        // 这里的逻辑是：只要这个feed加载了，就认为用户看到了最新的内容
        updateLastSeenLatestFeedId(latestIdInFeed);
      } else if (feedType === 'following') {
        updateLastSeenFollowingFeedId(latestIdInFeed);
      }
    }
    // 依赖项包含 feedType, isLoading, isRefetching, 和 flatDynamics (间接通过data)
    // 当 flatDynamics 变化时，这个 effect 会执行
  }, [data, feedType, isLoading, isRefetching, updateLastSeenLatestFeedId, updateLastSeenFollowingFeedId]); 
  // flatDynamics 本身不能直接做依赖，因为它是派生状态。用 data 代替，或者更精确地用 data?.flatDynamics[0]?.action_id
  // 但为了简洁，当 data (代表整个分页数据结构) 改变时检查是可行的

  // 增强预加载逻辑 - 提前加载下一页数据
  useEffect(() => {
    if (hasNextPage && data?.pages.length && !isFetchingNextPage) {
      const nextPage = data.pages[data.pages.length - 1].nextPage;
      if (nextPage) {
        // 静默预加载下一页，提升用户体验
        queryClient.prefetchQuery({
          queryKey: ['dynamics', feedType, token, nextPage],
          queryFn: () => fetchDynamicsPage({ pageParam: nextPage, queryKey: ['dynamics', feedType, token], token }),
          staleTime: 60 * 1000 // 数据保持新鲜1分钟
        });
        // console.log(`[DynamicFeed] 预加载第 ${nextPage} 页数据`);
      }
    }
  }, [data, hasNextPage, isFetchingNextPage, feedType, token, queryClient]);

  // --- 添加事件监听，响应HomePage中按钮的点击事件 ---
  useEffect(() => {
    // 处理切换动态类型的事件
    const handleFeedTypeChangeEvent = (e: CustomEvent) => {
      const newType = e.detail as DynamicFeedType;
      console.log(`[DynamicFeed] 接收到动态类型切换事件: ${newType}, 当前类型: ${feedType}`);
      if (newType && (newType === 'latest' || newType === 'following')) {
        // 直接调用内部处理函数，以触发动画效果
        handleFeedTypeChange(newType);
      }
    };
    
    // 处理刷新动态的事件
    const handleRefreshEvent = () => {
      console.log('[DynamicFeed] 接收到刷新动态事件');
      refetch();
    };
    
    // 添加事件监听器
    window.addEventListener('dynamicFeedTypeChange', handleFeedTypeChangeEvent as EventListener);
    window.addEventListener('dynamicFeedRefresh', handleRefreshEvent);
    console.log('[DynamicFeed] 已添加事件监听器');
    
    // 清理函数
    return () => {
      window.removeEventListener('dynamicFeedTypeChange', handleFeedTypeChangeEvent as EventListener);
      window.removeEventListener('dynamicFeedRefresh', handleRefreshEvent);
      console.log('[DynamicFeed] 已移除事件监听器');
    };
  }, [feedType, refetch, handleFeedTypeChange]); // 添加handleFeedTypeChange为依赖项

  // 定义 Footer 组件
  const Footer = () => {
    if (!isFetchingNextPage) return null;
    return (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-6 my-2"
          >
            <div className="flex items-center space-x-3 px-4 py-2 bg-gray-800/40 rounded-full">
              <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
              <span className="text-gray-300 text-sm">加载更多动态...</span>
            </div>
          </motion.div>
    );
  };

  // --- 渲染动态项目 ---
  const renderDynamicItem = (index: number, dynamic: DynamicItem) => {
    if (!dynamic) {
      // 可以渲染一个占位符或者返回 null
      // console.warn(\`DynamicFeed: No dynamic data for index ${index}\`);
      return null; 
    }
    const isSelected = dynamic && selectedDynamicId === dynamic.action_id;
    return (
          <motion.div
        key={dynamic.action_id} // Virtuoso 会处理 key，但这里保留以备其他用途
        layout // framer-motion layout prop
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="px-1 py-0.8" // 根据需要调整padding
          >
        <div 
          onClick={() => dynamic && openDynamicModal(dynamic)}
          className="cursor-pointer relative"
        >
          <DynamicCard
            dynamic={dynamic} 
            variant="sidebar" 
            isSelected={isSelected}
          />
            </div>
          </motion.div>
    );
  };

  // --- 渲染列表 ---
  return (
    <div
      ref={containerRef}
      className={`${className || ''}`}
    >
      {/* 主内容区 (滚动容器) */}
      <div 
        ref={scrollContainerRef}
        className={`h-full overflow-y-auto transition-opacity duration-300 ${isTransitioning ? 'opacity-50 filter blur-sm' : 'opacity-100 filter blur-none'} scrollbar-hide`}
        style={{ 
          scrollbarWidth: 'none', // Firefox隐藏滚动条
          msOverflowStyle: 'none' // IE隐藏滚动条
        }}
      >
        {/* CSS滚动条样式 */}
        <style>{`
          /* 完全隐藏滚动条样式 */
          div[class*="overflow-y-auto"]::-webkit-scrollbar,
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
            background: transparent;
          }
          
          /* 针对 Virtuoso 组件内部的滚动容器 */
          [data-virtuoso-scroller]::-webkit-scrollbar {
            display: none;
            width: 0;
            height: 0;
          }
          
          /* 确保 Virtuoso 滚动区域也没有滚动条 */
          [data-virtuoso-scroller] {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
        `}</style>

        {/* 包裹渲染内容以支持 AnimatePresence */} 
        <AnimatePresence mode="popLayout">
          {flatDynamics.length > 0 ? (
            <Virtuoso
              ref={virtuosoRef}
              style={{ width: '100%', height: '100%' }} // 添加高度100%确保填充父容器
              data={flatDynamics}
              itemContent={renderDynamicItem}
              endReached={loadMore}
              overscan={200} // 根据平均项目高度和视口调整
              components={{ Footer: isFetchingNextPage ? Footer : undefined }}
              initialTopMostItemIndex={0} // 确保切换时能正确重置
              className="scrollbar-hide"
            />
          ) : (
            // 当 flatDynamics 为空但 isLoading 为 false 时（例如，初始加载后没有数据）
            // 这个情况由上面的 (!isLoading && flatDynamics.length === 0 && !hasNextPage) 处理
            // 这里可以留空或根据需要显示特定内容
            null 
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

export default DynamicFeed; 