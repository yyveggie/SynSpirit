/**
 * 工具相关API调用函数
 * 
 * 提供与AI工具相关的API请求函数，包括获取工具列表等。
 */
import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * 工具接口定义
 */
export interface Tool {
  id: number;
  name: string;
  description: string;
  slug: string;
  screenshot_url?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  category?: { id: number; name: string }; 
  tags?: string[];
  is_free?: boolean;
}

/**
 * 获取AI工具列表
 * @returns Promise<Tool[]> 工具列表
 */
export const fetchAiTools = async (): Promise<Tool[]> => {
  const timestamp = new Date().getTime(); // 添加时间戳尝试绕过某些缓存
  const response = await axios.get<{ tools: Tool[]; total: number }>(
    `${API_BASE_URL}/api/tools/?_=${timestamp}`,
    {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }
  );
  
  if (response.data && Array.isArray(response.data.tools)) {
    return response.data.tools;
  }
  
  // 如果数据格式不正确或请求失败，抛出错误，由React Query处理
  throw new Error('获取AI工具列表失败');
}; 