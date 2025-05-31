/**
 * 
 * ArticleListPage.tsx
 * 
 * 此文件定义了展示文章列表页面的 React 组件。
 *
 * 主要功能:
 * - 使用 TanStack Query 的自定义 Hook (`useArticles`) 获取并缓存文章列表。
 * - 使用 TanStack Query 的自定义 Hook (`useArticleTags`) 获取并缓存文章标签列表。
 * - 支持按分类、标签进行筛选。
 * - 包含分页功能，并使用 TanStack Query 的 `placeholderData` 优化分页/筛选时的加载体验。
 * - 提供到单个文章详情页的链接。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import axios from 'axios';
import { useSidebar } from '../contexts/SidebarContext';
// --- TanStack Query Import ---
import { useQuery } from '@tanstack/react-query';
// --- End TanStack Query Import ---
import { fixImageUrl } from '../utils/imageProxy';

// --- Define Custom Hooks ---

const ARTICLES_PER_PAGE = 15; // Keep constant accessible

interface Author {
  id: number;
  email: string;
  nickname?: string | null;
}

interface Article {
  id: number;
  title: string;
  author: Author | null;
  category: string | null;
  summary: string | null;
  content: string;
  cover_image: string | null;
  created_at: string;
  tags: string[] | null;
  slug: string;
  view_count: number;
  series_name?: string | null;
  series_articles?: any[] | null;
  like_count?: number;
  collect_count?: number;
  share_count?: number;
  comment_count?: number;
}

// --- Hook for fetching articles ---
const useArticles = (page: number, category: string | 'all', tag: string | 'all') => {
  const queryKey = ['articles', { page, category, tag }];

  const fetchArticlesAPI = async () => {
    const offset = (page - 1) * ARTICLES_PER_PAGE;
    const fields = 'id,title,summary,content,category,tags,author,cover_image,slug,view_count,created_at,series_name,like_count,collect_count,share_count,comment_count';
    let articlesUrl = `${API_BASE_URL}/api/articles/?limit=${ARTICLES_PER_PAGE}&offset=${offset}&fields=${fields}`;

    if (tag !== 'all') {
      articlesUrl += `&tag=${encodeURIComponent(tag)}`;
    } else if (category && category !== 'all') {
      articlesUrl += `&category=${encodeURIComponent(category)}`;
    }
    articlesUrl += `&sort_by=created_at&sort_order=desc`;

    const response = await axios.get<{ articles: Article[], total: number }>(articlesUrl);
    return response.data; // Return { articles: [], total: 0 }
  };

  return useQuery<{ articles: Article[], total: number }, Error>({
    queryKey: queryKey,
    queryFn: fetchArticlesAPI,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Correct option for TanStack Query v5+
  });
};

// --- Hook for fetching article tags ---
const useArticleTags = () => {
    const queryKey = ['articleTags'];

    const fetchTagsAPI = async () => {
        const response = await axios.get<{ tags: string[] }>(`${API_BASE_URL}/api/articles/tags`);
        return response.data.tags || []; // Return tags array or empty array
    };

    return useQuery<string[], Error>({
        queryKey: queryKey,
        queryFn: fetchTagsAPI,
        staleTime: 30 * 60 * 1000, // 30 minutes, tags might not change often
        gcTime: 60 * 60 * 1000, // 1 hour
    });
};
// --- End Custom Hooks ---

interface Tool {
  id: number;
  name: string;
  description: string;
  category_id: number;
}

// Define the static categories for filtering
const displayCategories = ["全部", "AI发展", "投资", "未来", "心理", "理性", "时间"];

const ArticleListPage: React.FC = () => {
  // Removed useState for articles, loading, error, allTags, totalPages
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | 'all'>('all');
  const { isSidebarOpen } = useSidebar();
  const [currentPage, setCurrentPage] = useState(1);
  // Removed totalPages state
  
  const location = useLocation(); // Get location object

  // Effect to read category from URL query parameter on initial load
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const categoryFromUrl = params.get('category');
    if (categoryFromUrl && displayCategories.includes(categoryFromUrl)) {
      setSelectedCategory(categoryFromUrl);
      setSelectedTag('all'); // Reset tag if category is loaded from URL
      setCurrentPage(1); // Reset page when category changes from URL
    } else {
      setSelectedCategory('all'); // Default to 'all' if no valid category in URL
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [location.search]); // Rerun if the search query changes

  // Fetch tags using the custom hook
  const { data: allTags = [], isLoading: isLoadingTags, isError: isTagsError } = useArticleTags();

  // Fetch articles using the custom hook
  const { 
    data: articlesData, // articlesData is of type { articles: Article[], total: number } | undefined
    isLoading: loadingArticles, 
    isError: isArticlesError,
    error: articlesError,
    isFetching: isFetchingArticles, // Use isFetching to show loading indicator during background updates/refetches
   } = useArticles(currentPage, selectedCategory, selectedTag);

  // Extract articles and calculate totalPages from articlesData
  // Use optional chaining and default values for safety
  const articles: Article[] = articlesData?.articles ?? []; 
  const totalArticles: number = articlesData?.total ?? 0;
  const totalPages = Math.ceil(totalArticles / ARTICLES_PER_PAGE);

  // Effect to reset page when category or tag changes (handled by user interaction)
  // This useEffect replaces the previous one that was triggered by state changes
  // Note: Resetting via URL change is handled in the useEffect above
  // This handles direct button clicks
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedTag]);


  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setSelectedTag('all');
    // No need to manually set currentPage to 1 here, the effect above handles it.
  };

  const handleTagClick = (tag: string | 'all') => {
      setSelectedTag(tag);
      setSelectedCategory('all'); // Clicking a tag resets the category filter
      // No need to manually set currentPage to 1 here, the effect above handles it.
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo(0, 0);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getImageUrl = (imagePath: string | null): string | undefined => {
    if (!imagePath) return undefined;

    // 使用我们的图片代理处理所有图片URL
    return fixImageUrl(imagePath);
  };

  // Determine overall loading state (initial load vs background fetching)
  const isLoading = loadingArticles && !articlesData; // Show main loading spinner only on initial load
  const isFetching = isFetchingArticles; // Use for subtle loading indicators if needed

  // Determine error state
  const error = isArticlesError ? (articlesError?.message || '加载文章时出错') : null;

  return (
    <div className="min-h-screen flex flex-col text-black">
      {/* 移除Navbar组件 */}
      
      <div className="flex flex-1 overflow-hidden">
        {/* 移除SideNavbar组件 */}
        
        <main className={`flex-grow overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
          <div className="container mx-auto px-4 pb-4 pt-4">

            <div className="mb-6">
              <div className="flex flex-wrap gap-2">
                {displayCategories.map((category) => (
                  <button
                    key={category}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === (category === '全部' ? 'all' : category) && selectedTag === 'all'
                        ? 'bg-blue-500/90 text-white shadow-md' 
                        : 'bg-gray-100/90 hover:bg-gray-200/90 text-gray-700 border border-gray-200/50'
                    }`}
                    onClick={() => handleCategoryChange(category === '全部' ? 'all' : category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditionally render tags section based on loading/error state */}
            {!isLoadingTags && !isTagsError && allTags.length > 0 && (
                <div className="mb-8 flex flex-wrap gap-2"> 
                    <button
                        onClick={() => handleTagClick('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${ 
                            selectedTag === 'all'
                            ? 'bg-teal-500/90 text-white shadow-md' 
                            : 'bg-gray-100/90 hover:bg-gray-200/90 text-gray-700 border border-gray-200/50'
                        }`}
                    >
                        # 所有标签
                    </button>
                    {allTags.map((tag) => (
                        <button
                            key={tag} 
                            onClick={() => handleTagClick(tag)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${ 
                                selectedTag === tag 
                                ? 'bg-teal-500/90 text-white shadow-md' 
                                : 'bg-gray-100/90 hover:bg-gray-200/90 text-gray-700 border border-gray-200/50'
                            }`}
                        >
                            # {tag}
                        </button>
                    ))}
                </div>
            )}
            {isLoadingTags && <p className="text-sm text-black mb-4">正在加载标签...</p>}
            {isTagsError && <p className="text-sm text-red-400 mb-4">加载标签失败。</p>}
            
            {/* Use isLoading for the main loading spinner */}
            {isLoading ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black mx-auto"></div>
                <span className="mt-3 text-black block">正在加载文章...</span>
              </div>
            ) : error ? (
              <div className="text-center py-10 bg-red-900/30 border border-red-700 text-black p-4 rounded">
                <strong className="font-bold">加载失败!</strong>
                <span className="block sm:inline"> {error}</span>
              </div>
            ) : articles.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {articles.map((article: Article) => (
                    <div 
                      key={article.id} 
                      className="mx-auto max-w-lg w-full overflow-hidden rounded-lg bg-white shadow-lg transition-all duration-200 hover:shadow-xl flex flex-col h-[380px]"
                    >
                      <Link to={`/article/${article.slug}`} className="flex flex-col h-full overflow-hidden">
                        {article.cover_image ? (
                          <>
                            <div className="h-40 w-full overflow-hidden flex-shrink-0">
                              <img 
                                src={getImageUrl(article.cover_image) ?? '/placeholder.jpg'}
                                alt={article.title} 
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                              />
                            </div>
                            <div className="p-4 flex flex-col flex-grow overflow-hidden">
                              <p className="mb-1 text-sm text-blue-600 flex-shrink-0">
                                {article.author?.nickname || article.author?.email?.split('@')[0] || '匿名'} • <time>{formatDate(article.created_at)}</time>
                              </p>
                              <h3 
                                className="text-xl font-medium text-gray-900 mb-1 line-clamp-2 flex-shrink-0"
                                title={article.title}
                              >
                                {article.title}
                              </h3>
                              <p className="mt-1 text-gray-600 text-sm line-clamp-3 flex-grow mb-2 overflow-hidden">
                                {article.summary || (article.content ? article.content.substring(0, 120) + (article.content.length > 120 ? '...' : '') : '') || '无可用预览'} 
                              </p>
                              <div className="mt-auto pt-2 border-t border-gray-200 flex-shrink-0">
                                {article.tags && article.tags.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {article.tags.slice(0, 3).map((tag, index) => (
                                      <span 
                                        key={index} 
                                        className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-600"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                    {article.tags.length > 3 && (
                                      <span className="text-xs text-gray-400 self-center ml-1">...</span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="h-[22px]">&nbsp;</div> 
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="p-4 flex flex-col h-full overflow-hidden">
                            <p className="mb-1 text-sm text-blue-600 flex-shrink-0">
                              {article.author?.nickname || article.author?.email?.split('@')[0] || '匿名'} • <time>{formatDate(article.created_at)}</time>
                            </p>
                            <h3 
                              className="text-xl font-medium text-gray-900 mb-1 line-clamp-2 flex-shrink-0"
                              title={article.title}
                            >
                              {article.title}
                            </h3>
                            <p className="mt-1 text-gray-600 text-sm line-clamp-6 flex-grow mb-2 overflow-hidden">
                              {article.summary || (article.content ? article.content.substring(0, 250) + (article.content.length > 250 ? '...' : '') : '') || '无可用预览'} 
                            </p>
                            <div className="mt-auto pt-2 border-t border-gray-200 flex-shrink-0">
                              {article.tags && article.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {article.tags.slice(0, 3).map((tag, index) => (
                                    <span 
                                      key={index} 
                                      className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-600"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {article.tags.length > 3 && (
                                    <span className="text-xs text-gray-400 self-center ml-1">...</span>
                                  )}
                                </div>
                              ) : (
                                <div className="h-[22px]">&nbsp;</div> 
                              )}
                            </div>
                          </div>
                        )}
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="mt-8 flex justify-center items-center space-x-4">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1 || isFetching} // Disable during fetching
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      上一页
                    </button>
                    <span className="text-black text-sm">
                      第 {currentPage} / {totalPages} 页 {isFetching ? '(加载中...)' : ''}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages || isFetching} // Disable during fetching
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-black rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </>
            ) : (
              // Show this message when not loading, no error, but no articles found for the filter
              <div className="text-center py-10 text-black">
                <p className="text-lg">该分类/标签下暂无文章</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default ArticleListPage; 