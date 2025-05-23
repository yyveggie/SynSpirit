import { useState, useCallback } from 'react';
import { fetchSimilarContent, SearchResults } from '../services/contentSearchService';
import { formatSimilarContentResponse } from '../components/SimilarContentProcessor';

/**
 * 相似内容搜索Hook
 * 
 * 用于处理探索模式下相似内容的搜索、处理和展示
 */
export const useSimilarContentSearch = (token?: string) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults>({ articles: [], posts: [] });
  const [searchError, setSearchError] = useState<string | null>(null);
  
  /**
   * 搜索相似内容
   * @param query 用户查询
   * @param limit 结果数量限制
   * @returns 原始搜索结果对象
   */
  const searchSimilarContent = useCallback(async (
    query: string,
    limit: number = 5
  ): Promise<SearchResults> => {
    if (!query.trim()) {
      throw new Error('请输入搜索内容');
    }
    
    setIsSearching(true);
    setSearchError(null);
    setSearchResults({ articles: [], posts: [] });
    
    try {
      // 调用后端API获取相似内容
      const results = await fetchSimilarContent(query, token, limit);
      setSearchResults(results);
      
      return results;
      
    } catch (error) {
      console.error('搜索相似内容时出错:', error);
      const errorMessage = error instanceof Error ? error.message : '搜索过程中发生错误，请稍后再试';
      setSearchError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsSearching(false);
    }
  }, [token]);
  
  /**
   * 重置搜索状态
   */
  const resetSearch = useCallback(() => {
    setSearchResults({ articles: [], posts: [] });
    setSearchError(null);
  }, []);
  
  return {
    isSearching,
    searchResults,
    searchError,
    searchSimilarContent,
    resetSearch
  };
}; 