import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

// 定义收藏项的数据结构 (与 SideNavbar 一致)
export interface FavoriteItem {
  id: number;
  name: string;
  slug: string;
  type: 'topic'; // 只保留 'topic' 类型
}

// --- 后端 API 返回结构类型 ---
interface TopicFavoritesResponse {
  favorite_topics: { id: number; name: string; slug: string }[];
}

/**
 * 获取用户收藏的主题列表的 API 函数。
 * @param token - 用户认证 Token。如果为 null，则不执行请求。
 * @returns FavoriteItem 数组。
 */
const fetchUserFavoritesAPI = async (token: string | null): Promise<FavoriteItem[]> => {
  // 如果没有 token，直接返回空数组，因为 useQuery 的 enabled 会处理
  if (!token) {
    return [];
  }

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // 只请求普通主题收藏
    const topicPromise = axios.get<TopicFavoritesResponse>(
      `${API_BASE_URL}/api/users/favorites/topics`, { headers }
    );

    // 等待结果
    const topicResponse = await topicPromise; // 直接等待 topicPromise

    // 处理和映射数据
    const topicItems: FavoriteItem[] = (topicResponse.data.favorite_topics || []).map(topic => ({
      ...topic,
      type: 'topic' as const // 明确类型
    }));

    // 按名称排序
    const sortedItems = [...topicItems].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-CN') // 使用中文排序
    );

    // console.log(`[API][useUserFavorites] Fetched ${sortedItems.length} favorite items.`);
    return sortedItems;

  } catch (error) {
    // console.error("[API][useUserFavorites] Failed to fetch favorites:", error);
    // 在出错时抛出错误，让 useQuery 处理
    throw error;
  }
};

/**
 * TanStack Query Hook 用于获取当前用户的收藏列表（仅主题）。
 * @param token - 用户认证 Token。
 */
export const useUserFavorites = (token: string | null) => {
  const queryKey = ['userFavorites']; // 定义查询键

  return useQuery<FavoriteItem[], Error>({ // 指定 data 和 error 类型
    queryKey: queryKey,
    queryFn: () => fetchUserFavoritesAPI(token), // 调用 API 函数
    enabled: !!token, // 只有在 token 存在时才执行查询
    staleTime: 5 * 60 * 1000, // 5 分钟内数据被认为是新鲜的
    gcTime: 15 * 60 * 1000, // 15 分钟后清除未使用的数据
    refetchOnWindowFocus: true, // 窗口聚焦时自动重新获取（保持数据最新）
    // 可以考虑添加 refetchOnMount: true/false/always 根据需要调整
  });
};
