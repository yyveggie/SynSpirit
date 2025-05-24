/**
 * 首页内容区组件
 * 
 * 整合最新推荐和关注社区的内容，按时间顺序显示文章和帖子
 * 包含性能优化：限制初始加载数量，使用下拉加载更多，添加防抖动和虚拟化渲染
 * 包含图片和视频预加载优化，减少滚动时的加载延迟
 */
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import ArticleCard from './ArticleCard';
import { Article } from '../api/articleApi';
import { FavoriteItem } from '../hooks/useFavoriteQueries';
import ArticleCardSkeleton from './Skeletons/ArticleCardSkeleton';
import { throttle } from 'lodash'; // 导入throttle函数进行滚动优化

// Helper function (can be moved to utils if used elsewhere)
// This is a simplified version. In ArticleCard, a more complex extractMediaItems is used.
// For estimation, we might not need the full complexity here.
const extractMediaItems = (content: string | null | undefined): any[] => {
  if (!content) return [];
  const media = [];
  // Simplified regex for estimation, checking for common image/video patterns
  // This does NOT need to be as robust as the one in ArticleCard for parsing, just for estimation
  if (content.match(/!\[.*?\]\(https?:\/\/[^)]+\.(?:png|jpg|jpeg|gif|webp)\)/i)) {
    media.push({ type: 'image' }); // Placeholder for estimation
  }
  if (content.match(/\\[视频占位符:[^]]+\\]/i)) {
    media.push({ type: 'video' }); // Placeholder for estimation
  }
  return media;
};

interface HomeContentProps {
  activeTab: string;
  latestArticles: Article[];
  latestLoading: boolean;
  latestError: Error | null;
  communityArticles: Article[];
  communityArticlesLoading: boolean;
  communityArticlesError: Error | null;
  selectedCommunity: FavoriteItem | null | undefined;
  isAllCommunitiesView?: boolean;
}

// 定义合并内容项的接口
interface CombinedContentItem extends Article {
  contentType: 'article' | 'post';
}

// 定义每页加载的内容数量
const ITEMS_PER_PAGE = 10;

// 性能优化：创建一个图片预加载映射表，防止重复预加载
const preloadedImages = new Set<string>();

// 图片预加载函数
const preloadImage = (url: string): void => {
  // 性能优化：避免重复预加载相同的图片
  if (preloadedImages.has(url)) return;
  preloadedImages.add(url);

  const img = new Image();
  img.src = url;
};

// 从内容中提取图片URL，使用缓存正则提高性能
const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+\.(?:png|jpg|jpeg|gif|webp))\)/gi;
const extractImageUrls = (content: string): string[] => {
  const urls: string[] = [];
  let match;
  
  // 重置正则表达式的lastIndex，防止多次调用的问题
  imageRegex.lastIndex = 0;
  
  while ((match = imageRegex.exec(content)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  
  return urls;
};

const HomeContent: React.FC<HomeContentProps> = ({
  activeTab,
  latestArticles,
  latestLoading,
  latestError,
  communityArticles,
  communityArticlesLoading,
  communityArticlesError,
  selectedCommunity,
  isAllCommunitiesView,
}) => {
  // 当前显示的内容数量
  const [visibleItemsCount, setVisibleItemsCount] = useState(ITEMS_PER_PAGE);
  
  // 是否正在加载更多内容
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // 内容列表的引用，用于检测滚动位置
  const contentRef = useRef<HTMLDivElement>(null);
  
  // 标记是否正在滚动，用于性能优化
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 整合文章和帖子并按时间排序
  const combinedContent = useMemo(() => {
    let combined: CombinedContentItem[] = [];
    
    // 添加最新推荐的文章，并标记类型
    if (latestArticles && latestArticles.length > 0) {
      combined = [...latestArticles.map(article => ({
        ...article,
        contentType: 'article' as const
      }))];
    }
    
    // 添加社区帖子，并标记类型
    if (communityArticles && communityArticles.length > 0) {
      combined = [...combined, ...communityArticles.map(post => ({
        ...post,
        contentType: 'post' as const
      }))];
    }
    
    // 按时间排序 (降序，最新的在前)
    return combined.sort((a, b) => {
      const dateA = new Date(a.created_at || a.created_at_formatted || 0);
      const dateB = new Date(b.created_at || b.created_at_formatted || 0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [latestArticles, communityArticles]);
  
  // 判断是否所有内容都已加载完成
  const hasMoreContent = useMemo(() => {
    return visibleItemsCount < combinedContent.length;
  }, [visibleItemsCount, combinedContent.length]);
  
  // 当前可见的内容列表
  const visibleContent = useMemo(() => {
    return combinedContent.slice(0, visibleItemsCount);
  }, [combinedContent, visibleItemsCount]);

  // 需要预加载的下一批内容
  const nextContentToPreload = useMemo(() => {
    if (!hasMoreContent) return [];
    const nextBatchStart = visibleItemsCount;
    const nextBatchEnd = Math.min(nextBatchStart + ITEMS_PER_PAGE, combinedContent.length);
    return combinedContent.slice(nextBatchStart, nextBatchEnd);
  }, [combinedContent, visibleItemsCount, hasMoreContent]);

  // 判断是否在加载中
  const isLoading = latestLoading || communityArticlesLoading;
  
  // 判断是否有错误
  const hasError = latestError || communityArticlesError;
  const errorMessage = latestError?.message || communityArticlesError?.message || '未知错误';
  
  // 加载更多内容的函数
  const loadMoreContent = useCallback(() => {
    if (isLoadingMore || !hasMoreContent) return;
    
    setIsLoadingMore(true);
    // 使用setTimeout模拟异步加载，避免UI阻塞
    setTimeout(() => {
      setVisibleItemsCount(prev => prev + ITEMS_PER_PAGE);
      setIsLoadingMore(false);
    }, 300);
  }, [isLoadingMore, hasMoreContent]);
  
  // 性能优化：使用throttle创建一个节流版本的滚动处理函数
  const handleScroll = useCallback(throttle(() => {
    if (!contentRef.current) return;
    
    // 获取可视区域底部位置
    const { scrollTop, clientHeight, scrollHeight } = document.documentElement;
    
    // 如果滚动到距离底部300px的位置，加载更多内容
    if (scrollHeight - scrollTop - clientHeight < 300 && hasMoreContent && !isLoadingMore) {
      loadMoreContent();
    }
    
    // 更新滚动状态
    if (!isScrolling) {
      setIsScrolling(true);
      
      // 滚动停止后重置状态
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
      
      scrollingTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    }
  }, 100, { leading: true, trailing: true }), [loadMoreContent, hasMoreContent, isLoadingMore, isScrolling]);
  
  // 添加滚动监听，使用 passive 标志提升性能
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      // 清除可能存在的timeout
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
    };
  }, [handleScroll]);
  
  // 当内容变化时，重置可见数量
  useEffect(() => {
    setVisibleItemsCount(ITEMS_PER_PAGE);
  }, [activeTab, latestArticles.length, communityArticles.length]);

  // 性能优化：优化图片预加载逻辑，限制同时预加载的数量
  useEffect(() => {
    if (nextContentToPreload.length > 0) {
      // 延迟200ms再开始预加载，避免干扰当前渲染
      const preloadTimeout = setTimeout(() => {
        // 限制每批次最多预加载3篇文章的图片
        const itemsToPreload = nextContentToPreload.slice(0, 3);
        
        // 批量处理预加载，每200ms处理一篇文章的图片，避免同时请求过多资源
        itemsToPreload.forEach((item, index) => {
          setTimeout(() => {
            if (item.content) {
              const imageUrls = extractImageUrls(item.content);
              // 限制每篇文章最多预加载3张图片
              imageUrls.slice(0, 3).forEach((url, imgIndex) => {
                // 再次延迟每张图片的加载，减轻网络负担
                setTimeout(() => preloadImage(url), imgIndex * 150);
              });
            }
            
            // 预加载封面图（如果有）
            if (item.cover_image) {
              preloadImage(item.cover_image);
            }
          }, index * 200);
        });
      }, 200);
      
      return () => clearTimeout(preloadTimeout);
    }
  }, [nextContentToPreload]);

  return (
    <div className={`relative ${isScrolling ? 'scrolling' : ''}`} ref={contentRef}>
      {isLoading ? (
        <div className="space-y-2">
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
          <ArticleCardSkeleton />
        </div>
      ) : hasError ? (
        <div className="text-center py-8 text-red-300 bg-red-900/30 p-4 rounded">
          加载内容失败: {errorMessage}
        </div>
      ) : visibleContent.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-2">
            {visibleContent.map((item) => (
              <ArticleCard 
                key={`${item.id}-${item.contentType === 'post' ? 'post' : 'article'}-${item.communityNameDisplay || 'no-community'}`}
                id={item.id}
                title={item.title}
                content={item.content}
                date={item.created_at_formatted || item.created_at}
                tags={item.tags || []}
                slug={item.slug}
                seriesArticles={item.series_articles}
                series_name={item.series_name || null}
                like_count={item.like_count}
                collect_count={item.collect_count}
                share_count={item.share_count}
                comment_count={item.comment_count}
                author={item.author || null}
                communityType={item.contentType === 'post' ? (item.communityType || selectedCommunity?.type || null) : null}
                communitySlug={item.contentType === 'post' ? (item.communitySlug || selectedCommunity?.slug || null) : null}
                communityNameDisplay={item.communityNameDisplay || null}
                targetType={item.contentType === 'post' ? 'post' : 'article'}
                is_liked={item.is_liked}
                is_collected={item.is_collected}
                like_action_id={item.like_action_id}
                collect_action_id={item.collect_action_id}
              />
            ))}
          </div>
          {hasMoreContent && (
            <div className="text-center py-4">
              {isLoadingMore ? (
                <div className="inline-block animate-pulse text-indigo-300">
                  正在加载更多内容...
                </div>
              ) : (
                <button 
                  onClick={loadMoreContent}
                  className="px-4 py-2 bg-white hover:bg-gray-50 rounded-md text-black transition-colors duration-200 border border-gray-200"
                >
                  加载更多
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-indigo-300 bg-indigo-900/20 p-8 rounded-lg">
          {activeTab === 'latest' ? '没有找到最新文章' :
           activeTab === 'all_communities' ? '关注的社区暂无内容' :
           activeTab.startsWith('community-') ? (selectedCommunity ? `${selectedCommunity.name} 社区暂无内容` : '该社区暂无内容') :
           '没有找到相关内容'}
        </div>
      )}
    </div>
  );
};

export default React.memo(HomeContent); 