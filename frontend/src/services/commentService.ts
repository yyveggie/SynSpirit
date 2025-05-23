/**
 * 评论相关服务
 * 封装了与评论API相关的请求方法
 */
import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * 创建评论
 * @param articleId 文章ID
 * @param content 评论内容
 * @param token 授权token
 * @returns 创建的评论数据
 */
export const createComment = async (
  articleId: number, 
  content: string, 
  token: string
) => {
  const response = await axios.post(
    `${API_BASE_URL}/api/articles/${articleId}/comments`,
    { content: content.trim() },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  return response.data;
}; 