import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { SearchResults } from '../services/contentSearchService';

interface RecommendationsContextType {
  recommendationSets: SearchResults[];
  activeRecommendationIndex: number;
  addRecommendationSet: (newSet: SearchResults) => void;
  setActiveRecommendationIndex: (index: number) => void;
  clearAllRecommendations: () => void;
}

const RecommendationsContext = createContext<RecommendationsContextType | undefined>(undefined);

export const RecommendationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [recommendationSets, setRecommendationSets] = useState<SearchResults[]>([]);
  const [activeRecommendationIndex, setActiveRecommendationIndex] = useState<number>(0);

  const addRecommendationSet = useCallback((newSet: SearchResults) => {
    // 只添加包含实际文章或帖子的结果集
    if ((newSet.articles && newSet.articles.length > 0) || (newSet.posts && newSet.posts.length > 0)) {
      setRecommendationSets(prevSets => [newSet, ...prevSets]); // 新的推荐放在最前面
      setActiveRecommendationIndex(0); // 新增：每次添加新的推荐集后，自动激活它（索引为0）
    }
  }, []);

  const clearAllRecommendations = useCallback(() => {
    setRecommendationSets([]);
    setActiveRecommendationIndex(0); // 新增：清空时重置激活索引为0 (或-1，如果希望明确表示无激活)
  }, []);

  return (
    <RecommendationsContext.Provider 
      value={{ 
        recommendationSets, 
        activeRecommendationIndex,
        addRecommendationSet, 
        setActiveRecommendationIndex,
        clearAllRecommendations 
      }}
    >
      {children}
    </RecommendationsContext.Provider>
  );
};

export const useRecommendations = (): RecommendationsContextType => {
  const context = useContext(RecommendationsContext);
  if (context === undefined) {
    throw new Error('useRecommendations must be used within a RecommendationsProvider');
  }
  return context;
}; 