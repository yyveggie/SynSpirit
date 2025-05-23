/**
 * @file useDynamicFeedQueries.ts
 * @description 自定义 Hook，用于封装动态信息流 (推荐/关注) 的数据获取和缓存逻辑。
 *              使用 TanStack Query (useInfiniteQuery) 实现无限滚动加载。
 */
import { useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { DynamicItem } from '../components/DynamicFeed'; // 导入类型

// --- 定义 useInfiniteQuery 返回的数据类型 --- (可选但推荐，增强类型安全)
interface DynamicPage {
  dynamics: DynamicItem[];
  nextPage: number | undefined;
  currentPage: number;
  totalPages: number;
}

// --- 定义 useDynamicFeed Hook 的参数类型 ---
interface UseDynamicFeedOptions {
  feedType: 'latest' | 'following';
  token: string | null;
  enabled?: boolean; // 允许外部控制是否启用查询
}

// --- 内部获取数据的函数 (与 DynamicFeed 中的版本相同) ---
export const fetchDynamicsPage = async ({ pageParam = 1, queryKey, token }: { pageParam?: number; queryKey: (string | null)[]; token: string | null }): Promise<DynamicPage> => {
  const [_key, feedType] = queryKey; // 从 queryKey 解构出 feedType
  // const endpoint = feedType === 'latest'
  //   ? `${API_BASE_URL}/api/dynamics/shares`
  //   : `${API_BASE_URL}/api/following/dynamics`;

  // 修改：始终调用新的 /api/dynamics/feed 端点获取组合动态流
  // feedType ('latest' vs 'following') 的区分逻辑现在应该在 /api/dynamics/feed 后端实现（如果需要的话）
  // 或者，如果 /api/dynamics/feed 已经处理了所有情况（比如返回全局最新，或根据token判断关注）
  // 如果 /api/dynamics/feed 还需要区分 latest/following，则需要传递 feedType 参数给它
  // 假设 /api/dynamics/feed 目前返回全局最新的混合动态
  let endpoint = `${API_BASE_URL}/api/dynamics/feed`;

  // 如果将来需要区分关注的 feed，可以这样做：
  // if (feedType === 'following') {
  //   endpoint = `${API_BASE_URL}/api/dynamics/following_feed`; // 假设有这样一个端点
  // } else { // 'latest'
  //   endpoint = `${API_BASE_URL}/api/dynamics/feed`; // 全局最新混合动态
  // }

  // 当前我们先统一使用 /feed，让后端根据情况（如是否提供token）返回推荐或关注内容
  // 或者如果后端 /feed 仅用于"最新"，那么"关注"需要另一个端点，如 /api/following_dynamics (已存在) 或新的 /api/following_feed
  // 为了简单起见，并假设 /feed 是我们主要的混合时间线：
  if (feedType === 'following' && token) {
    // 如果是请求关注动态，并且有 token，则使用原有的关注接口
    // 注意：/api/following/dynamics 可能只返回 action_type='share' 的。如果它也需要更新以包含 create_status，则后端也需调整。
    // 为了本次任务聚焦于"发动态"并使其显示在"最新"中，我们暂时不修改关注流的获取逻辑，除非明确指示。
    // 因此，如果 feedType 是 'following'，我们还是用原来的端点。
    endpoint = `${API_BASE_URL}/api/following/dynamics`;
  } else {
    // 对于 'latest'，我们使用新的组合 feed 端点
    endpoint = `${API_BASE_URL}/api/dynamics/feed`;
  }

  // console.log(`[fetchDynamicsPage] 开始请求: ${endpoint}, 页码: ${pageParam}, feedType: ${feedType}`);
  // console.time(`[fetchDynamicsPage] API请求时间-${pageParam}`);

  try {
    const response = await axios.get<{ dynamics: DynamicItem[], pages: number, page: number }>(endpoint, {
      params: { page: pageParam, limit: 15 },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    // console.timeEnd(`[fetchDynamicsPage] API请求时间-${pageParam}`);

    // ---> 增强日志信息，追踪每页数据 <---
    const originalDynamics = response.data.dynamics || [];
    // console.log(`[fetchDynamicsPage] 接收到${originalDynamics.length}条动态，页码: ${pageParam}, feedType: ${feedType}`);
    
    // 记录已删除的动态数量
    const deletedDynamics = originalDynamics.filter(d => d.is_deleted);
    if (deletedDynamics.length > 0) {
      // console.log(`[fetchDynamicsPage] 过滤掉${deletedDynamics.length}条已删除动态`);
    }

    // 检查响应数据结构
    if (!response.data || typeof response.data !== 'object') {
      throw new Error('Invalid response structure from API');
    }

    // 确保 dynamics 是数组
    const dynamics = Array.isArray(response.data.dynamics) ? response.data.dynamics : [];
    
    // 增强客户端过滤 - 确保排除所有已删除或异常的动态
    const filteredDynamics = dynamics.filter(dynamic => {
      // 过滤主要条件: 未删除
      if (dynamic.is_deleted) {
        return false;
      }
      
      // 额外健壮性检查:
      // 1. 确保动态有合法的ID
      if (!dynamic.action_id) {
        // console.warn('[fetchDynamicsPage] 跳过缺少action_id的动态');
        return false;
      }
      
      // 2. 确保有分享者信息
      if (!dynamic.sharer_username) {
        // console.warn(`[fetchDynamicsPage] 动态 ${dynamic.action_id} 缺少分享者信息`);
        return false;
      }
      
      return true;
    });
    
    // console.log(`[fetchDynamicsPage] 过滤后返回${filteredDynamics.length}条有效动态`);
    
    const totalPages = typeof response.data.pages === 'number' ? response.data.pages : 0;
    const currentPage = typeof response.data.page === 'number' ? response.data.page : pageParam; // 使用服务器返回的当前页码，如果不可用则回退

    // 返回符合 DynamicPage 接口的对象
    return {
      dynamics: filteredDynamics,
      nextPage: currentPage < totalPages ? currentPage + 1 : undefined, // 计算下一页页码
      currentPage: currentPage, // 传递当前页码
      totalPages: totalPages,   // 传递总页数
    };
  } catch (error) {
    // console.error(`[fetchDynamicsPage] 请求失败:`, error);
    // 重新抛出错误，让调用方处理
    throw error;
  }
};

/**
 * 自定义 Hook: useDynamicFeed
 * 封装了获取推荐或关注动态的 useInfiniteQuery 逻辑。
 * 
 * @param {UseDynamicFeedOptions} options 配置项，包括 feedType 和 token。
 * @returns useInfiniteQuery 返回的对象，包含数据、加载状态、错误状态和操作函数，以及 isRefetching 和 queryClient。
 */
export const useDynamicFeed = ({ feedType, token, enabled = true }: UseDynamicFeedOptions) => {
  const queryClient = useQueryClient(); // 获取 QueryClient 实例，可能用于后续的 mutation 或手动更新

  // Destructure isRefetching from the query result
  const { isRefetching, ...restQueryResult } = useInfiniteQuery<DynamicPage, Error, { pages: DynamicPage[], flatDynamics: DynamicItem[] }, (string | null)[], number>({
    // queryKey: Query 的唯一标识符，包含 feedType 以区分缓存
    queryKey: ['dynamics', feedType, token], // 保持与原组件一致的 key 结构
    // queryFn: 获取数据的异步函数
    queryFn: ({ pageParam }) => fetchDynamicsPage({ pageParam, queryKey: ['dynamics', feedType, token], token }),
    // getNextPageParam: 根据最后一页的数据确定下一页的参数 (页码)
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1, // 初始页码
    staleTime: 1000 * 60 * 5, // 数据在 5 分钟内被认为是新鲜的
    gcTime: 1000 * 60 * 10, // 数据在 10 分钟不活跃后被垃圾回收
    // 控制查询是否启用，外部可控，并增加 feedType 为 following 时 token 必须存在的逻辑
    enabled: enabled && (feedType === 'latest' || !!token),
    select: (data) => ({
      // 使用 select 转换数据结构，将所有页面的 dynamics 合并为一个数组
      pages: data.pages,
      flatDynamics: data.pages.flatMap(page => page.dynamics)
    })
  });

  // 可以根据需要在这里添加 mutation (例如点赞、收藏等)，并返回给组件使用
  // const likeMutation = useMutation(...);

  // 返回 useInfiniteQuery 的结果以及 isRefetching 和 queryClient
  return {
    ...restQueryResult,
    isRefetching, // Explicitly return isRefetching
    queryClient // 将 queryClient 也返回，方便组件在 updateItem 时使用
  };
}; 