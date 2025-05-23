import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { toast } from 'react-toastify';

/**
 * 此文件定义了文章相关的查询和操作钩子，基于TanStack Query实现。
 * 
 * 主要功能：
 * - 提供获取文章详情的useArticleDetails钩子
 * - 提供点赞文章的useLikeArticle钩子，采用乐观更新模式
 * - 提供收藏文章的useCollectArticle钩子，采用乐观更新模式
 * 
 * 核心设计原则：
 * 1. 乐观更新：操作立即更新UI，不等待API响应，提升用户体验
 * 2. 状态同步：确保不同组件间的点赞/收藏状态一致
 * 3. 错误恢复：API失败时能够恢复到正确状态
 * 4. 避免循环刷新：精确控制缓存失效时机，防止无限刷新
 */

// --- 为window对象添加自定义属性类型声明 ---
declare global {
  interface Window {
    lastLikeInvalidateTime?: number;
    lastCollectInvalidateTime?: number;
  }
}

// --- 初始化全局变量 ---
if (typeof window !== 'undefined') {
  window.lastLikeInvalidateTime = window.lastLikeInvalidateTime || 0;
  window.lastCollectInvalidateTime = window.lastCollectInvalidateTime || 0;
}

// --- 接口定义 ---
// 注意：如果这些接口在其他地方也需要，考虑将它们移动到共享的 types 文件中

// 文章作者信息
interface Author {
  id: number;
  email: string | null;
  nickname?: string | null;
  avatar?: string | null;
  bio?: string | null;
  tags?: string[] | null;
}

// 系列文章链接
interface SeriesArticleLink {
    id: number;
    title: string;
    slug: string;
    series_order: number;
    is_current?: boolean;
}

// 文章详情
interface Article {
  id: number;
  title: string;
  author: Author | null;
  category: string | null;
  content: string;
  cover_image: string | null;
  created_at: string;
  tags: string[] | null;
  slug: string;
  view_count: number;
  series_name?: string | null;
  series_articles?: SeriesArticleLink[] | null;
  is_liked?: boolean;
  is_collected?: boolean;
  like_count?: number;
  collect_count?: number;
  share_count?: number;
  like_action_id?: number | null;
  collect_action_id?: number | null;
}
// --- 结束接口定义 ---


// --- 自定义 Hook: 获取文章详情 ---
export const useArticleDetails = (slug: string | undefined, token: string | null) => {
    const queryKey = ['articleDetails', slug];

    const fetchArticleDetailsAPI = async () => {
        if (!slug) throw new Error("无效的文章标识符");
        console.log(`[useArticleDetails] Fetching data for article slug: ${slug}`);
        const headers: { [key: string]: string } = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const apiUrl = `${API_BASE_URL}/api/articles/slug/${slug}`;
        console.log(`[useArticleDetails][DEBUG] Fetching Article from: ${apiUrl}`);
        try {
        const response = await axios.get<Article>(apiUrl, { headers });
        console.log("[useArticleDetails] Article Data:", response.data);
        return response.data;
        } catch (error: any) {
            if (error.response && error.response.status === 429) {
                console.error("[useArticleDetails] Rate limit exceeded (429)");
                // 将错误信息添加到错误对象，方便UI层处理
                const rateError = new Error("请求频率过高，请稍后再试");
                rateError.name = "RateLimitExceeded";
                throw rateError;
            }
            throw error;
        }
    };

    return useQuery<Article, Error>({
        queryKey: queryKey,
        queryFn: fetchArticleDetailsAPI,
        enabled: !!slug,
        // --- 缓存配置 ---
        // staleTime: 10 分钟。在这段时间内，缓存数据被认为是新鲜的，不会触发后台重新获取。
        staleTime: 10 * 60 * 1000,
        // gcTime (Garbage Collection Time): 30 分钟。 在这段时间之后，如果没有活动的观察者（即组件已卸载），
        // 缓存数据才会被垃圾回收机制清除。
        gcTime: 30 * 60 * 1000,
        // --- 结束缓存配置 ---
        retry: (failureCount, error) => {
           // Don't retry on 404 Not Found
           if ((error as any)?.response?.status === 404) {
               return false;
           }
           // 如果是速率限制错误，限制重试次数为1次，并添加较长延迟
           if (error.name === "RateLimitExceeded") {
               return failureCount < 1;
           }
           return failureCount < 2;
        },
        retryDelay: (failureCount, error) => {
            // 对于速率限制错误，设置较长的延迟时间
            if (error.name === "RateLimitExceeded") {
                return 5000; // 5秒延迟
            }
            // 默认延迟时间
            return Math.min(1000 * 2 ** failureCount, 30000);
        }
    });
};

// --- Simplified Mutation Variables Type ---
// 只需传递执行操作所需的最少信息
interface ToggleActionVariables {
  articleId: number; // 需要知道目标文章 ID
  token: string | null; // 需要 Token
  currentActionState: boolean; // 当前是点赞/收藏状态吗？
  currentActionId: number | null; // 当前的点赞/收藏 Action ID (用于取消)
}

// --- 为乐观更新上下文定义类型，解决TypeScript错误 ---
// Mutation上下文类型，用于错误恢复
interface MutationContext {
  previousState: any;
}

// --- 自定义 Hook: 切换文章点赞状态 ---
export const useLikeArticle = (slug: string | undefined) => {
    const queryClient = useQueryClient();
    const queryKey = ['articleDetails', slug];

    return useMutation<void, Error, ToggleActionVariables, MutationContext>({
        mutationFn: async ({ articleId, token, currentActionState, currentActionId }) => {
            if (!token) throw new Error('需要登录才能操作');

            const headers = { Authorization: `Bearer ${token}` };

            if (currentActionState) {
                // 如果已点赞，首先查询获取action_id（如果未提供）
                let actionIdToDelete = currentActionId;
                
                if (!actionIdToDelete) {
                    // 查询点赞记录获取action_id
                    console.log('[useLikeArticle] No action_id provided, fetching from API');
                    try {
                        // 首先尝试获取文章详情
                        const response = await axios.get(
                            `${API_BASE_URL}/api/articles/slug/${slug}`,
                            { headers }
                        );
                        actionIdToDelete = response.data.like_action_id;
                        console.log(`[useLikeArticle] Found action_id from article details: ${actionIdToDelete}`);
                    } catch (error) {
                        console.error('[useLikeArticle] Failed to fetch action_id:', error);
                        throw new Error('无法获取操作ID');
                    }
                }
                
                // --- 取消点赞 --- 
                if (actionIdToDelete) {
                    console.log(`[useLikeArticle] Attempting to DELETE action ID: ${actionIdToDelete}`);
                    await axios.delete(`${API_BASE_URL}/api/actions/${actionIdToDelete}`, { headers });
                } else {
                    throw new Error('未找到点赞记录ID');
                }
            } else {
                // --- 添加点赞 --- 
                const payload = {
                    action_type: 'like',
                    target_type: 'article',
                    target_id: articleId,
                };
                console.log('[useLikeArticle] Attempting to POST action:', payload);
                await axios.post(`${API_BASE_URL}/api/actions`, payload, { headers });
            }
        },
        onMutate: async ({ articleId, currentActionState }) => {
            // 乐观更新：在API请求发出前立即更新UI
            
            // 取消正在进行的查询以避免它们覆盖我们的乐观更新
            await queryClient.cancelQueries({ queryKey: queryKey });
            
            // 保存当前状态，以便在出错时恢复
            const previousState = queryClient.getQueryData(queryKey);
            
            // 乐观更新缓存数据
            queryClient.setQueryData(queryKey, (oldData: any) => {
                if (!oldData) return oldData;
                
                // 更新点赞状态和计数
                const newState = {
                    ...oldData,
                    is_liked: !currentActionState,
                    like_count: currentActionState 
                        ? Math.max(0, oldData.like_count - 1)
                        : oldData.like_count + 1
                };
                
                console.log('[useLikeArticle] Optimistic update:', {
                    oldState: { is_liked: oldData.is_liked, like_count: oldData.like_count },
                    newState: { is_liked: newState.is_liked, like_count: newState.like_count }
                });
                
                return newState;
            });
            
            return { previousState };
        },
        onError: (err, variables, context) => {
            // --- 错误处理 --- 
            console.error("[useLikeArticle Mutation Error]:", err);
            toast.error('点赞操作失败');
            
            // 恢复原状态
            if (context?.previousState) {
                queryClient.setQueryData(queryKey, context.previousState);
            }
        },
        onSettled: () => {
            // 完全移除缓存无效化逻辑，让组件自己处理状态
            // 不再调用queryClient.invalidateQueries
            console.log("[useLikeArticle Settled] Skip invalidating queries to prevent refresh loops");
            
            // --- 添加: 强制刷新文章详情数据 ---
            // 使用强制刷新方式而不是invalidateQueries，避免循环刷新
            console.log("[useLikeArticle Settled] Forcing article details refetch");
            queryClient.refetchQueries({ queryKey: queryKey });
        },
    });
};

// --- 自定义 Hook: 切换文章收藏状态 ---
export const useCollectArticle = (slug: string | undefined) => {
    const queryClient = useQueryClient();
    const queryKey = ['articleDetails', slug];

    return useMutation<void, Error, ToggleActionVariables, MutationContext>({
        mutationFn: async ({ articleId, token, currentActionState, currentActionId }) => {
            if (!token) throw new Error('需要登录才能操作');

            const headers = { Authorization: `Bearer ${token}` };

            if (currentActionState) {
                // 如果已收藏，首先查询获取action_id（如果未提供）
                let actionIdToDelete = currentActionId;
                
                if (!actionIdToDelete) {
                    // 查询收藏记录获取action_id
                    console.log('[useCollectArticle] No action_id provided, fetching from API');
                    try {
                        // 首先尝试获取文章详情
                        const response = await axios.get(
                            `${API_BASE_URL}/api/articles/slug/${slug}`,
                            { headers }
                        );
                        actionIdToDelete = response.data.collect_action_id;
                        console.log(`[useCollectArticle] Found action_id from article details: ${actionIdToDelete}`);
                    } catch (error) {
                        console.error('[useCollectArticle] Failed to fetch action_id:', error);
                        throw new Error('无法获取操作ID');
                    }
                }
                
                // --- 取消收藏 --- 
                if (actionIdToDelete) {
                    console.log(`[useCollectArticle] Attempting to DELETE action ID: ${actionIdToDelete}`);
                    await axios.delete(`${API_BASE_URL}/api/actions/${actionIdToDelete}`, { headers });
                } else {
                    throw new Error('未找到收藏记录ID');
                }
            } else {
                // --- 添加收藏 --- 
                const payload = {
                    action_type: 'collect',
                    target_type: 'article',
                    target_id: articleId,
                };
                console.log('[useCollectArticle] Attempting to POST action:', payload);
                await axios.post(`${API_BASE_URL}/api/actions`, payload, { headers });
            }
        },
        onMutate: async ({ articleId, currentActionState }) => {
            // 乐观更新：在API请求发出前立即更新UI
            
            // 取消正在进行的查询以避免它们覆盖我们的乐观更新
            await queryClient.cancelQueries({ queryKey: queryKey });
            
            // 保存当前状态，以便在出错时恢复
            const previousState = queryClient.getQueryData(queryKey);
            
            // 乐观更新缓存数据
            queryClient.setQueryData(queryKey, (oldData: any) => {
                if (!oldData) return oldData;
                
                // 更新收藏状态和计数
                const newState = {
                    ...oldData,
                    is_collected: !currentActionState,
                    collect_count: currentActionState 
                        ? Math.max(0, oldData.collect_count - 1)
                        : oldData.collect_count + 1
                };
                
                console.log('[useCollectArticle] Optimistic update:', {
                    oldState: { is_collected: oldData.is_collected, collect_count: oldData.collect_count },
                    newState: { is_collected: newState.is_collected, collect_count: newState.collect_count }
                });
                
                return newState;
            });
            
            return { previousState };
        },
        onError: (err, variables, context) => {
            // --- 错误处理 --- 
            console.error("[useCollectArticle Mutation Error]:", err);
            toast.error('收藏操作失败');
            
            // 恢复原状态
            if (context?.previousState) {
                queryClient.setQueryData(queryKey, context.previousState);
            }
        },
        onSettled: () => {
            // 完全移除缓存无效化逻辑，让组件自己处理状态
            // 不再调用queryClient.invalidateQueries
            console.log("[useCollectArticle Settled] Skip invalidating queries to prevent refresh loops");
            
            // --- 添加: 强制刷新文章详情数据 ---
            // 使用强制刷新方式而不是invalidateQueries，避免循环刷新
            console.log("[useCollectArticle Settled] Forcing article details refetch");
            queryClient.refetchQueries({ queryKey: queryKey });
        },
    });
}; 