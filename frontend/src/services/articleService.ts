/**
 * 文章相关服务
 * 封装了与文章API相关的请求方法
 */
import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * 获取文章评论（支持分页）
 * @param articleId 文章ID
 * @param token 授权token
 * @param cursor 分页游标
 * @param limit 每页数量
 * @returns 评论数据
 */
export const getArticleComments = async (
  articleId: number,
  token: string | null,
  cursor: string = "",
  limit: number = 10
) => {
  const apiUrl = `${API_BASE_URL}/api/articles/${articleId}/comments?sort_by=latest&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
  const response = await axios.get(apiUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return {
    comments: response.data.comments || [],
    total: response.data.total || 0,
    has_more: response.data.has_more || false,
    next_cursor: response.data.next_cursor
  };
}; 