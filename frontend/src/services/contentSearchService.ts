import { API_BASE_URL } from '../config';

/**
 * 内容相似度搜索服务
 * 用于从后端获取与查询文本相似的文章和帖子
 */

// 定义文章结构
export interface Article {
  id: number;
  title: string;
  slug?: string;
  cover_image?: string;
  score?: number; // Added by search logic
  created_at?: string; // New (ISO date string)
  content?: string; // 新增 content 字段
  author_nickname?: string; // 新增 author_nickname 字段
}

// 定义帖子结构
export interface Post {
  id: number;
  title: string;
  slug?: string;
  // Posts might not have cover_image in the card, but API might send it
  cover_image?: string; 
  score?: number; // Added by search logic
  created_at?: string; // New (ISO date string)
  content?: string; // 新增 content 字段
  author_nickname?: string; // 新增 author_nickname 字段
}

// 搜索结果接口
export interface SearchResults {
  articles: Article[];
  posts: Post[];
}

/**
 * 从后端获取与查询文本相似的内容
 * @param query - 用户查询文本
 * @param token - 可选的认证令牌
 * @param limit - 可选的结果数量限制，默认为5
 * @returns 包含相似文章和帖子的结果对象
 */
export const fetchSimilarContent = async (
  query: string, 
  token?: string | undefined,
  limit: number = 5
): Promise<SearchResults> => {
  try {
    // 构建请求URL，包含查询参数
    const url = `${API_BASE_URL}/api/search/similar?query=${encodeURIComponent(query)}&limit=${limit}`;
    
    // 设置请求头
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    // 如果有令牌，添加到请求头
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 发送GET请求
    const response = await fetch(url, {
      method: 'GET',
      headers
    });
    
    // 检查响应状态
    if (!response.ok) {
      throw new Error(`搜索请求失败: ${response.status}`);
    }
    
    // 解析响应数据
    const data = await response.json();
    return data as SearchResults;
    
  } catch (error) {
    console.error('获取相似内容时出错:', error);
    // 返回空结果而不是抛出错误，以便UI能够优雅处理
    return { articles: [], posts: [] };
  }
};

/**
 * 本地计算文本相似度的函数（前端实现）
 * 当后端未提供相似度评分时使用
 * 
 * @param query - 用户查询文本
 * @param title - 要比较的标题
 * @returns 相似度评分 (0-1)
 */
export const calculateSimilarity = (query: string, title: string): number => {
  // 转换为小写并移除特殊字符进行简单比较
  const normalizedQuery = query.toLowerCase().replace(/[^\w\s]/g, '');
  const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, '');
  
  // 将文本分割成词
  const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
  const titleTerms = normalizedTitle.split(/\s+/).filter(term => term.length > 0);
  
  // 计算匹配的词数
  let matchCount = 0;
  queryTerms.forEach(term => {
    if (titleTerms.includes(term)) {
      matchCount++;
    }
  });
  
  // 计算Jaccard相似系数
  const uniqueTerms = new Set([...queryTerms, ...titleTerms]);
  return matchCount / uniqueTerms.size;
}; 