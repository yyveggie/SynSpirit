import React, { useCallback } from 'react';
import { SearchResults, Article, Post } from '../services/contentSearchService';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config'; // 用于拼接图片URL
import { motion } from 'framer-motion'; // Import motion
import { useRecommendations } from '../context/RecommendationsContext'; // <-- 导入 useRecommendations

interface RecommendedContentCardsProps {
  // results prop is no longer the primary source of data, 
  // as the component will now get all sets from the context and use an active index.
  // We can remove it if AICollapseChat directly uses the context to add sets and this component
  // solely relies on the context for displaying the active set.
  // For now, let's assume it might still be passed for some reason (e.g. initial load),
  // but the core logic will rely on context's recommendationSets and activeRecommendationIndex.
  results?: SearchResults; // Make it optional or remove if fully context-driven
}

// +++ 新增辅助函数 +++
const sanitizeContentForPreview = (htmlContent: string | undefined | null): string => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }
  let text = htmlContent;

  // 替换 HTML img 标签和 Markdown 图片语法为 [图片]
  text = text.replace(/<img[^>]*>|!\[[^\]]*\]\([^)]*\)/gi, '[图片]');

  // 替换 HTML iframe 和 video 标签为 [视频]
  text = text.replace(/<iframe[^>]*>(?:<\/iframe>)?|<video[^>]*>(?:.*?<\/video>)?/gi, '[视频]');
  
  // 移除所有其他HTML标签，得到纯文本
  text = text.replace(/<\/?[^>]+(>|$)/g, "");

  // 移除多余的空格
  text = text.replace(/\s+/g, ' ').trim();

  return text;
};
// +++ 结束新增辅助函数 +++

const RecommendedContentCards: React.FC<RecommendedContentCardsProps> = (/* { results } */) => { // results prop is now less relevant here
  const { 
    recommendationSets, 
    activeRecommendationIndex, 
    setActiveRecommendationIndex, 
    clearAllRecommendations 
  } = useRecommendations();

  const getFullImageUrl = useCallback((url: string | undefined | null): string => {
    if (!url) return ''; // Return empty string for placeholder logic to catch or handle

    // Log original and processed URL
    // console.log('[RecommendedContentCards DEBUG] Original cover_image URL:', url);

    let fullUrl = url;
    if (url.startsWith('/') && !url.startsWith('//')) {
      // Likely a relative path from the backend's perspective, e.g., /static/images/foo.jpg
      // Or, if it was meant to be an absolute path on the current domain but missing the scheme.
      if (url.startsWith('/static/')) {
        fullUrl = `${API_BASE_URL}${url}`; // Assuming API_BASE_URL is http://localhost:5001
      } else {
        // If it's a path like /uploads/image.png, it might be relative to the frontend's public folder
        // or needs a different base. For now, assume it might be served from the same origin as frontend.
        // This part might need adjustment based on actual image serving strategy.
        fullUrl = `${window.location.origin}${url}`;
      }
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // Already a full URL
      fullUrl = url;
    } else if (url.includes('cos.ap-shanghai.myqcloud.com')) {
      // Tencent COS URL that might be missing https:
      if (!url.startsWith('http')) {
        fullUrl = `https://${url}`;
      }
    } else {
      // Potentially a relative path that doesn't start with '/', or a malformed URL.
      // If your backend serves images from a specific path, prepend it here.
      // For now, let's assume it might be a path relative to the frontend public folder.
      // This is a common case if backend stores something like "images/imagename.jpg"
      // and expects frontend to know the base. If not using a public folder, this needs specific handling.
      // console.warn(`[RecommendedContentCards DEBUG] Unhandled URL format, attempting as relative to origin: ${url}`);
      // fullUrl = `${window.location.origin}/${url.startsWith('/') ? url.substring(1) : url}`;
      // Fallback: If not a clear case, return as is or empty to trigger placeholder
      // For now, let's try returning it as is if it's not an obvious pattern, image onError will handle it
      // If the backend sends just a filename like "image.jpg", this won't work without a base path.
    }
    
    // console.log('[RecommendedContentCards DEBUG] Processed fullUrl:', fullUrl);
    return fullUrl;
  }, []);

  const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // console.error("[RecommendedContentCards DEBUG] Image failed to load:", event.currentTarget.src);
    event.currentTarget.style.display = 'none'; // Hide broken image icon
    const parent = event.currentTarget.parentElement;
    if (parent) {
      // Attempt to show a placeholder icon if the image fails
      const placeholder = parent.querySelector('.image-placeholder-icon');
      if (placeholder) {
        (placeholder as HTMLElement).style.display = 'flex';
      }
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const year = date.getFullYear().toString().slice(-2); // YY
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // MM (getMonth is 0-indexed)
      const day = date.getDate().toString().padStart(2, '0'); // DD
      return `${year}/${month}/${day}`;
    } catch (e) {
      return dateString; // Fallback to original string if date is invalid
    }
  };

  // Get the currently active recommendation set based on the index
  const activeResults = recommendationSets[activeRecommendationIndex];

  const allContent = activeResults ? [
    ...(activeResults.articles || []).map(item => ({ ...item, type: 'article' as const })),
    ...(activeResults.posts || []).map(item => ({ ...item, type: 'post' as const }))
  ] : [];

  if (recommendationSets.length === 0 || !activeResults) {
    return null; 
  }

  const handleCardClick = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="recommended-content-cards-container relative mt-3 mb-2 px-3 h-[250px] flex flex-col overflow-y-hidden"> {/* 最外层推荐框高度 h-[400px], 使用 flex-col, 添加 overflow-y-hidden */}
      {/* 关闭按钮 */}
      <button 
        onClick={() => clearAllRecommendations()} 
        className="absolute top-0 right-3 z-20 p-1 text-black/70 hover:text-black transition-colors duration-150"
        aria-label="关闭推荐"
        title="关闭推荐"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 分页按钮区域 */}
      {recommendationSets.length > 0 && (
        <div className="flex justify-center space-x-1.5 mb-2 pt-0.5 mt-4">
          {recommendationSets.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveRecommendationIndex(index)}
              className={`px-2 py-0.5 text-xs rounded-md transition-colors duration-150 \
                ${activeRecommendationIndex === index 
                  ? 'bg-indigo-500 text-white shadow-md' 
                  : 'bg-slate-600/50 hover:bg-slate-500/80 text-slate-300/90'}`}
              aria-label={`查看第 ${index + 1} 组推荐`}
            >
              {recommendationSets.length - index} {/* 显示倒序的页码,最新的在最前 */}
            </button>
          ))}
        </div>
      )}

      {/* 卡片横向滚动区域 - flex-grow to take remaining space */}
      <div className="flex overflow-x-auto space-x-3 pt-1 pb-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50 scrollbar-thumb-rounded-full h-48 overflow-y-hidden"> {/* 内部卡片区域高度 h-48 (192px), overflow-y-hidden */}
        {allContent.map((item, itemIndex) => { // renamed index to itemIndex to avoid conflict with map's index
          const imageUrl = item.type === 'article' ? getFullImageUrl(item.cover_image) : '';
          const hasImage = !!imageUrl;
          
          const url = item.type === 'article' 
            ? (item.slug ? `/article/${item.slug}` : `/article/id/${item.id}`)
            : (item.slug ? `/posts/${item.slug}` : `/posts/id/${item.id}`);

          return (
            <motion.div
              key={`${item.type}-${item.id}-${activeRecommendationIndex}`} // Ensure key is unique across different sets
              className={`flex-shrink-0 w-40 h-44 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-indigo-500/40 transition-all duration-200 cursor-pointer group overflow-hidden flex flex-col justify-between`}
              onClick={() => handleCardClick(url)}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: itemIndex * 0.05, duration: 0.2 }} // Reduced delay for faster appearance
            >
              {item.type === 'article' && hasImage && (
                <div className="w-full h-16 bg-gray-100 overflow-hidden flex items-center justify-center">
                  <img 
                    src={imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    onError={handleImageError} 
                  />
                </div>
              )}
              
              <div className={`p-2 flex flex-col flex-grow ${ (item.type === 'article' && hasImage) ? 'h-[calc(100%-4rem)]' : 'h-full'}`}>
                <h4 className="text-xs font-semibold text-black group-hover:text-indigo-600 transition-colors duration-200 line-clamp-2" title={item.title}>
                  {item.title}
                </h4>
                
                <p className={`text-[11px] text-black mt-1 flex-grow ${ (item.type === 'article' && hasImage) ? 'line-clamp-2' : 'line-clamp-4'}`}>
                  {
                    sanitizeContentForPreview(
                      ('content' in item && item.content && typeof item.content === 'string' && item.content.trim() !== '')
                        ? item.content
                        : '' 
                    )
                  }
                </p>

                <div className="flex justify-between items-center mt-auto pt-1 border-t border-gray-200 text-[10px] text-gray-500 group-hover:text-indigo-600 transition-colors duration-200">
                  <div className="truncate">{item.author_nickname || '佚名'}</div>
                  <div>{formatDate(item.created_at)}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default RecommendedContentCards; 