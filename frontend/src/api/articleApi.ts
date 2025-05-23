/**
 * 文章相关API调用函数
 * 
 * 提供与文章相关的API请求函数，包括获取最新文章、社区文章等。
 */
import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * 文章接口定义
 */
export interface AuthorProfile {
  id: number;
  nickname: string;
  username?: string; // Optional: if username is used for profile URL
  avatar?: string | null; // 从数据库结构中看到有 avatar 字段
  bio?: string | null;    // 个性签名
  tags?: string[] | string | null; // 标签，可能是数组或逗号分隔的字符串
  // Add other author-related fields if available and needed, e.g., avatar_url
}

export interface Article {
  id: number;
  title: string;
  content: string;
  created_at: string;
  created_at_formatted?: string;
  tags?: string[];
  slug: string;
  series_articles?: any[];
  series_name?: string | null;
  like_count: number;
  collect_count: number;
  share_count: number;
  comment_count: number;
  category?: string | null;
  author?: AuthorProfile | null; // Updated type for author
  cover_image?: string | null;
  view_count?: number;
  communityNameDisplay?: string;
  communityType?: 'topic' | 'relationship' | null;
  communitySlug?: string | null;
  is_liked?: boolean;
  is_collected?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
}

/**
 * 测试API连接状态
 * @returns 返回Promise，成功时包含连接状态信息
 */
export const testApiConnection = async (): Promise<{ status: string, baseUrl: string }> => {
  console.log(`[API] 测试连接到: ${API_BASE_URL}`);
  try {
    // 尝试一个简单的GET请求来检查API是否可访问
    const response = await axios.get(`${API_BASE_URL}/health-check`, {
      timeout: 5000,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });
    return { 
      status: 'success', 
      baseUrl: API_BASE_URL 
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('[API] 连接测试失败:', error.message);
      if (error.response) {
        return { 
          status: `error-${error.response.status}`, 
          baseUrl: API_BASE_URL 
        };
      } else if (error.request) {
        return { 
          status: 'network-error', 
          baseUrl: API_BASE_URL 
        };
      }
    }
    return { 
      status: 'unknown-error', 
      baseUrl: API_BASE_URL 
    };
  }
};

/**
 * 获取最新文章列表
 * @returns Promise<Article[]> 文章列表
 */
export const fetchLatestArticles = async (): Promise<Article[]> => {
  // 为 "最新推荐" Tab 获取文章列表时请求的字段 (确保包含所有计数：like_count, collect_count, share_count, comment_count)
  // 以及用户交互状态：is_liked, is_collected, like_action_id, collect_action_id
  const fieldsForLatestArticles = 'id,title,content,summary,category,tags,author,cover_image,slug,view_count,created_at,series_name,series_articles,like_count,collect_count,share_count,comment_count,is_liked,is_collected,like_action_id,collect_action_id';
  
  try {
    const response = await axios.get<{ articles: Article[] }>(
      `${API_BASE_URL}/api/articles?limit=15&sort_by=created_at&sort_order=desc&fields=${fieldsForLatestArticles}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      }
    );
    
    if (response.data && Array.isArray(response.data.articles)) {
      // console.log(`[API] 获取最新文章成功: 共${response.data.articles.length}篇`);
      return response.data.articles;
    }
    
    // 如果数据格式不正确或请求失败，抛出错误，由React Query处理
    throw new Error('获取最新文章失败：响应格式不正确');
  } catch (error) {
    console.error('[API] 获取最新文章失败:', error);
    
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('获取最新文章超时，请检查网络连接');
      }
      if (error.response) {
        throw new Error(`获取最新文章失败: 服务器返回 ${error.response.status}`);
      }
      if (error.request) {
        throw new Error('获取最新文章失败: 无法连接到服务器，可能是CORS问题');
      }
    }
    
    throw new Error('获取最新文章失败');
  }
};

/**
 * 获取社区文章列表
 * @param communityType 社区类型 ('topic')
 * @param communityId 社区ID或slug
 * @returns Promise<Article[]> 社区文章列表
 */
export const fetchCommunityArticles = async (communityType: string, communityId: string | number): Promise<Article[]> => {
  // 为 "关注社区" Tab (以及单个社区 Tab) 获取文章列表时请求的字段 
  // (确保包含所有计数：like_count, collect_count, share_count, comment_count)
  // (同样需要包含用户交互状态：is_liked, is_collected, like_action_id, collect_action_id)
  const fieldsForCommunityArticles = 'id,title,content,summary,category,tags,author,cover_image,slug,view_count,created_at,series_name,series_articles,like_count,collect_count,share_count,comment_count,is_liked,is_collected,like_action_id,collect_action_id';
  
  // 添加时间戳以避免缓存问题
  const timestamp = new Date().getTime();
  
  // 我们现在只支持普通主题(topic)
  let apiPath = 'topics';
  
  // 确保communityId是字符串格式的slug
    communityId = String(communityId);
  
  // 构建完整URL用于日志
  const fullUrl = `${API_BASE_URL}/api/${apiPath}/${communityId}/posts?fields=${fieldsForCommunityArticles}&_=${timestamp}`;
  
  try {
    // 尝试请求社区文章
    const response = await axios.get<{posts: Article[]}>( 
      fullUrl,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    
    // 验证响应数据格式 - 注意response.data中应使用posts而不是articles
    if (response.data && Array.isArray(response.data.posts)) {
      
      // 检查并记录帖子内容是否存在
      for (const post of response.data.posts) {
        if (!post.content) {
          console.warn(`[API] 警告: 帖子ID ${post.id} 缺少内容字段`);
        }
      }
      
      return response.data.posts;
    }
    
    console.error('[API] 获取社区文章响应格式不正确:', response.data);
    throw new Error(`获取社区文章格式不正确`);
  } catch (error) {
    console.error(`[API] 获取社区 ${communityId} 文章失败:`, error);
    
    // 处理404错误，返回空数组而不是抛出错误
    if (axios.isAxiosError(error) && error.response && error.response.status === 404) {
      console.log(`[API] 社区 ${communityId} 不存在或没有文章，返回空数组`);
      return [];
    }
    
    // 如果是其他错误类型，抛出更友好的错误信息
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('获取社区文章超时');
      }
      if (error.response) {
        throw new Error(`获取社区文章失败: 服务器返回 ${error.response.status}`);
      }
      if (error.request) {
        throw new Error('获取社区文章失败: 无法连接到服务器');
      }
    }
    
    // 如果不是特定的错误类型，则抛出更简洁的错误
    throw new Error('获取社区文章失败');
  }
}; 