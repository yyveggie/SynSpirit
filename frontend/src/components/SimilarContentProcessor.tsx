import React from 'react';
import { Article, Post, SearchResults, calculateSimilarity } from '../services/contentSearchService';

/**
 * 相似内容处理器组件
 * 负责处理和格式化相似内容的展示逻辑
 */

// 扩展文章和帖子的类型，包含类型标记和URL
interface ProcessedArticle extends Article {
  type: 'article';
  url: string;
  score: number;
}

interface ProcessedPost extends Post {
  type: 'post';
  url: string;
  score: number;
}

// 处理后的内容类型
type ProcessedContent = ProcessedArticle | ProcessedPost;

interface SimilarContentProcessorProps {
  query: string;
  results: SearchResults;
  onContentSelect: (url: string) => void;
  threshold?: number; // 相似度阈值，低于此值的内容不展示
}

const SimilarContentProcessor: React.FC<SimilarContentProcessorProps> = ({
  query,
  results,
  onContentSelect,
  threshold = 0.1 // 默认相似度阈值为0.1
}) => {
  // 合并并处理文章和帖子，确保每个条目都有相似度评分
  const processResults = (): ProcessedContent[] => {
    // 处理文章
    const processedArticles: ProcessedArticle[] = results.articles.map(article => ({
      ...article,
      type: 'article',
      score: article.score ?? calculateSimilarity(query, article.title),
      url: article.slug ? `/article/${article.slug}` : (article.id ? `/article/id/${article.id}` : '#')
    }));

    // 处理帖子
    const processedPosts: ProcessedPost[] = results.posts.map(post => ({
      ...post,
      type: 'post',
      score: post.score ?? calculateSimilarity(query, post.title),
      url: post.slug ? `/posts/${post.slug}` : (post.id ? `/posts/id/${post.id}` : '#')
    }));

    // 合并、过滤低于阈值的内容、并按相似度排序
    return [...processedArticles, ...processedPosts]
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score);
  };

  // 渲染相似内容列表
  return (
    <div className="similar-content-results">
      {processResults().map((item, index) => (
        <div
          key={`${item.type}-${item.id}`}
          className="similar-content-item p-2 hover:bg-white/5 rounded cursor-pointer"
          onClick={() => onContentSelect(item.url)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-white/50 text-sm">{index + 1}.</span>
              <span className="text-white/90">{item.title}</span>
            </div>
            <div className="text-xs text-white/50">
              {item.type === 'article' ? '文章' : '讨论'}
              <span className="ml-2">
                相关度: {Math.round(item.score * 100)}%
              </span>
            </div>
          </div>
        </div>
      ))}
      
      {processResults().length === 0 && (
        <div className="text-center text-white/70 py-4">
          没有找到与您问题相关的内容
        </div>
      )}
    </div>
  );
};

/**
 * 格式化相似内容响应为Markdown文本
 * @param query 用户查询
 * @param results 搜索结果
 * @param threshold 相似度阈值
 * @returns 格式化后的Markdown文本
 */
export const formatSimilarContentResponse = (
  query: string,
  results: SearchResults,
  threshold: number = 0.1
): string => {
  // 处理文章
  const processedArticles: ProcessedArticle[] = results.articles.map(article => ({
    ...article,
    type: 'article',
    score: article.score ?? calculateSimilarity(query, article.title),
    url: article.slug ? `/article/${article.slug}` : (article.id ? `/article/id/${article.id}` : '#')
  }));

  // 处理帖子
  const processedPosts: ProcessedPost[] = results.posts.map(post => ({
    ...post,
    type: 'post',
    score: post.score ?? calculateSimilarity(query, post.title),
    url: post.slug ? `/posts/${post.slug}` : (post.id ? `/posts/id/${post.id}` : '#')
  }));

  // 合并、过滤低于阈值的内容、并按相似度排序
  const processed: ProcessedContent[] = [...processedArticles, ...processedPosts]
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score);
  
  if (processed.length === 0) {
    return "我没有找到与您问题相关的内容。请尝试用不同的方式提问，或者浏览我们的文章和讨论区。";
  }
  
  let response = "我找到了一些可能与您问题相关的内容：\n\n";
  
  processed.forEach((item, index) => {
    const scorePercentage = Math.round(item.score * 100);
    const typeText = item.type === 'article' ? '文章' : '讨论';
    
    response += `${index + 1}. [${item.title}](${item.url}) - ${typeText} (相关度: ${scorePercentage}%)\n`;
  });
  
  response += "\n您可以点击上面的链接查看详细内容。如果这些不是您要找的，请尝试用更具体的方式提问。";
  
  return response;
};

export default SimilarContentProcessor; 