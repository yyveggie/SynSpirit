import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../config';

// --- 类型定义 ---
interface PostAuthor {
  id: number;
  nickname: string | null;
  email: string;
  avatar?: string | null;
}

// 帖子详情基本类型 (与 PostDetailPage 等保持一致)
interface PostDetails {
  id: number;
  title: string;
  content: string;
  author: PostAuthor | null;
  created_at: string;
  tags?: string[];
  view_count: number;
  slug: string;
  cover_image?: string;
  is_liked?: boolean;         // 当前用户是否点赞
  is_collected?: boolean;     // 当前用户是否收藏
  like_action_id?: number | null;
  collect_action_id?: number | null;
  likes_count?: number;       // 总点赞数 (注意后端返回的是 target_likes_count)
  collects_count?: number;    // 总收藏数 (注意后端返回的是 target_collects_count)
  share_count?: number;
  // 确保包含所有 Post 模型中可能返回的字段
  updated_at?: string;
  category_id?: number | null;
  category_name?: string | null;
  topic_id?: number | null;
  topic_name?: string | null;
  status?: string;
  priority?: number;
  published_at?: string | null;
  summary?: string | null;
  // 可能还有其他字段，根据您的 Post 模型添加
}

// 后端 /api/actions 接口成功响应的类型
interface ActionResponse {
  action_id: number | null; // 点赞/收藏成功时是新 action_id, 取消时可能为null或被删除的id (以前端逻辑为准)
  target_likes_count?: number;
  target_collects_count?: number;
  is_liked?: boolean;         // 操作后，当前用户对目标的点赞状态
  is_collected?: boolean;     // 操作后，当前用户对目标的收藏状态
  message?: string;           // 例如取消操作的成功消息
  // 如果是分享，可能还有 action_to_timeline_dict 返回的其他字段
  // 这里我们主要关注点赞/收藏相关的字段
    
    // 添加帖子专用API返回的字段
    id?: number;                // UserAction.to_dict() 返回的 id 字段
    target_type?: string;       // UserAction.to_dict() 返回的 target_type 字段
    target_id?: number;         // UserAction.to_dict() 返回的 target_id 字段
    user?: any;                 // UserAction.to_dict() 返回的 user 字段
}

// --- 点赞/取消点赞 Mutation ---
interface LikePostVariables {
    postId: number;
    token: string | null;
    currentLikeState: boolean; // 操作前的点赞状态
    currentLikeActionId: number | null;
    postSlug: string; // 用于 queryKey (通常是帖子详情的slug)
    topicSlugForList?: string; // 新增：用于失效帖子列表缓存
}

const likePostAPI = async ({ postId, token, currentLikeState, currentLikeActionId }: LikePostVariables): Promise<ActionResponse> => {
    if (!token) throw new Error('需要认证');

    // 修改：不再使用 /api/actions，而是使用帖子专用API
    const method = currentLikeState ? 'DELETE' : 'POST';
    const url = `${API_BASE_URL}/api/posts/${postId}/like`;
    
    console.log(`[API][usePostQueries] Attempting ${method} like for post ID: ${postId} using dedicated post API`);
    
    const response = await axios({
        method,
        url,
            headers: { Authorization: `Bearer ${token}` },
        });
    
    console.log(`[API][usePostQueries] ${method} like response status: ${response.status}, data:`, response.data);
    
    if ((method === 'DELETE' && response.status !== 200 && response.status !== 204) || 
        (method === 'POST' && response.status !== 201 && response.status !== 200)) {
        const errorMsg = (response.data as any)?.error || `${currentLikeState ? '取消点赞' : '点赞'}失败`;
            throw new Error(errorMsg);
        }
    
        return response.data;
};

export const useLikePost = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ActionResponse, // 修改成功响应类型
        AxiosError<{ error?: string }>, // 错误类型保持不变
        LikePostVariables, // variables 类型保持不变
        { previousPostData?: PostDetails } | undefined // context 类型可以保持或调整
    >({
        mutationFn: likePostAPI,
        onMutate: async (variables) => {
            const { postSlug, currentLikeState } = variables;
            const queryKey = ['postDetails', postSlug];

            await queryClient.cancelQueries({ queryKey });
            const previousPostData = queryClient.getQueryData<PostDetails>(queryKey);

            if (previousPostData) {
                // 乐观更新仍然可以做，但会很快被 onSuccess 中的数据覆盖
                queryClient.setQueryData<PostDetails>(queryKey, {
                    ...previousPostData,
                    is_liked: !currentLikeState, // 乐观切换状态
                    likes_count: currentLikeState
                        ? Math.max(0, (previousPostData.likes_count || 0) - 1)
                        : (previousPostData.likes_count || 0) + 1, // 乐观增减计数
                    // like_action_id 的乐观更新比较复杂，暂时依赖 onSuccess
                });
            }
            console.log("[onMutate Like][usePostQueries] Optimistically updated cache for key:", queryKey);
            return { previousPostData };
        },
        // --- 修改 onSuccess --- 
        onSuccess: (data, variables) => {
            const { postSlug, postId, topicSlugForList } = variables; // 解构 topicSlugForList
            const queryKeyDetails = ['postDetails', postSlug];
            console.log('[onSuccess Like][usePostQueries] Received data from backend:', data);

            queryClient.setQueryData<PostDetails>(queryKeyDetails, (oldData) => {
                if (oldData) {
                    console.log('[onSuccess Like][usePostQueries] Updating cache for key:', queryKeyDetails);
                    
                    // 使用后端返回的点赞状态和计数
                    const isLiked = data.is_liked === undefined 
                        ? (data.message ? false : true)  // 兼容老的API响应
                        : data.is_liked;                 // 使用新API明确返回的状态
                    
                    // 获取新的action_id
                    const likeActionId = isLiked && !data.message ? (data.id || null) : null;
                    
                    // 使用后端返回的计数，如果有的话
                    const newLikesCount = data.target_likes_count !== undefined 
                        ? data.target_likes_count 
                        : (isLiked 
                            ? (oldData.likes_count || 0) + 1
                            : Math.max(0, (oldData.likes_count || 0) - 1));
                    
                    const updatedPost = {
                        ...oldData,
                        likes_count: newLikesCount,
                        is_liked: isLiked,
                        like_action_id: likeActionId,
                    };
                    console.log('[onSuccess Like][usePostQueries] New data to set in cache:', updatedPost);
                    return updatedPost;
                }
                console.log('[onSuccess Like][usePostQueries] No oldData found in cache for key:', queryKeyDetails, 'Will not update cache directly here.');
                return oldData;
            });

            // 使帖子列表缓存失效 (如果提供了 topicSlugForList)
            if (topicSlugForList) {
                const queryKeyList = ['topicPosts', topicSlugForList];
                queryClient.invalidateQueries({ queryKey: queryKeyList });
                console.log('[onSuccess Like][usePostQueries] Invalidated topicPosts query for key:', queryKeyList);
            }

            // 修改toast消息以匹配新的响应格式
            toast.success(data.message || '操作成功！');
        },
        onError: (error, variables, context) => {
            const { postSlug } = variables;
            const queryKey = ['postDetails', postSlug];
            if (context?.previousPostData) {
                queryClient.setQueryData(queryKey, context.previousPostData);
                console.log("[onError Like][usePostQueries] Rolled back optimistic update for key:", queryKey);
            }
            const backendError = error.response?.data?.error;
            toast.error(`点赞操作失败: ${backendError || error.message || '未知错误'}`);
            // 考虑是否还需要在这里 invalidateQueries，因为 setQueryData 已经回滚了
            // 如果后端返回的错误不代表需要回滚乐观更新，则可能需要 invalidate
        },
        onSettled: (data, error, variables) => {
            const { postSlug, topicSlugForList } = variables; // 解构 topicSlugForList
            const queryKeyDetails = ['postDetails', postSlug];
            // onSettled 中仍然可以执行 invalidateQueries 以确保最终一致性
            // 特别是如果 onSuccess 中 setQueryData 的数据可能不完整
            // console.log("[onSettled Like][usePostQueries] Would have invalidated query for final consistency (now commented out):", queryKeyDetails);
            // queryClient.invalidateQueries({ queryKey: queryKeyDetails });
            
            // 确保在 onSettled 中也尝试失效列表缓存，以覆盖所有情况 (例如 onSuccess 未执行或乐观更新失败)
            if (topicSlugForList) {
                const queryKeyList = ['topicPosts', topicSlugForList];
                queryClient.invalidateQueries({ queryKey: queryKeyList });
                console.log('[onSettled Like][usePostQueries] Invalidated topicPosts query in onSettled for key:', queryKeyList);
            }
        },
    });
};


// --- 收藏/取消收藏 Mutation ---
interface CollectPostVariables {
    postId: number;
    token: string | null;
    currentCollectState: boolean; // 操作前的收藏状态
    currentCollectActionId: number | null;
    postSlug: string; // 用于 queryKey (通常是帖子详情的slug)
    topicSlugForList?: string; // 新增：用于失效帖子列表缓存
}

const collectPostAPI = async ({ postId, token, currentCollectState, currentCollectActionId }: CollectPostVariables): Promise<ActionResponse> => {
    if (!token) throw new Error('需要认证');

    // 修改：不再使用 /api/actions，而是使用帖子专用API
    const method = currentCollectState ? 'DELETE' : 'POST';
    const url = `${API_BASE_URL}/api/posts/${postId}/collect`;
    
    console.log(`[API][usePostQueries] Attempting ${method} collect for post ID: ${postId} using dedicated post API`);
    
    const response = await axios({
        method,
        url,
            headers: { Authorization: `Bearer ${token}` },
        });
    
    console.log(`[API][usePostQueries] ${method} collect response status: ${response.status}, data:`, response.data);
    
    if ((method === 'DELETE' && response.status !== 200 && response.status !== 204) || 
        (method === 'POST' && response.status !== 201 && response.status !== 200)) {
        const errorMsg = (response.data as any)?.error || `${currentCollectState ? '取消收藏' : '收藏'}失败`;
            throw new Error(errorMsg);
        }
    
        return response.data;
};

export const useCollectPost = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ActionResponse, // 修改成功响应类型
        AxiosError<{ error?: string }>, // 错误类型
        CollectPostVariables, // variables 类型
        { previousPostData?: PostDetails } | undefined // context 类型
    >({
        mutationFn: collectPostAPI,
        onMutate: async (variables) => {
            const { postSlug, currentCollectState } = variables;
            const queryKey = ['postDetails', postSlug];
            await queryClient.cancelQueries({ queryKey });
            const previousPostData = queryClient.getQueryData<PostDetails>(queryKey);
            if (previousPostData) {
                queryClient.setQueryData<PostDetails>(queryKey, {
                    ...previousPostData,
                    is_collected: !currentCollectState,
                    collects_count: currentCollectState
                        ? Math.max(0, (previousPostData.collects_count || 0) - 1)
                        : (previousPostData.collects_count || 0) + 1,
                });
            }
            console.log("[onMutate Collect][usePostQueries] Optimistically updated cache for key:", queryKey);
            return { previousPostData };
        },
        // --- 修改 onSuccess --- 
        onSuccess: (data, variables) => {
            const { postSlug, postId, topicSlugForList } = variables; // 解构 topicSlugForList
            const queryKeyDetails = ['postDetails', postSlug];
            console.log('[onSuccess Collect][usePostQueries] Received data from backend:', data);

            queryClient.setQueryData<PostDetails>(queryKeyDetails, (oldData) => {
                if (oldData) {
                    console.log('[onSuccess Collect][usePostQueries] Updating cache for key:', queryKeyDetails);
                    
                    // 使用后端返回的收藏状态和计数
                    const isCollected = data.is_collected === undefined 
                        ? (data.message ? false : true)  // 兼容老的API响应
                        : data.is_collected;             // 使用新API明确返回的状态
                    
                    // 获取新的action_id
                    const collectActionId = isCollected && !data.message ? (data.id || null) : null;
                    
                    // 使用后端返回的计数，如果有的话
                    const newCollectsCount = data.target_collects_count !== undefined 
                        ? data.target_collects_count 
                        : (isCollected 
                            ? (oldData.collects_count || 0) + 1 
                            : Math.max(0, (oldData.collects_count || 0) - 1));
                    
                    const updatedPost = {
                        ...oldData,
                        collects_count: newCollectsCount,
                        is_collected: isCollected,
                        collect_action_id: collectActionId,
                    };
                    console.log('[onSuccess Collect][usePostQueries] New data to set in cache:', updatedPost);
                    return updatedPost;
                }
                console.log('[onSuccess Collect][usePostQueries] No oldData found in cache for key:', queryKeyDetails, 'Will not update cache directly here.');
                return oldData;
            });

            // 使帖子列表缓存失效 (如果提供了 topicSlugForList)
            if (topicSlugForList) {
                const queryKeyList = ['topicPosts', topicSlugForList];
                queryClient.invalidateQueries({ queryKey: queryKeyList });
                console.log('[onSuccess Collect][usePostQueries] Invalidated topicPosts query for key:', queryKeyList);
            }

            toast.success(data.message || '操作成功！');
        },
        onError: (error, variables, context) => {
            const { postSlug } = variables;
            const queryKey = ['postDetails', postSlug];
            if (context?.previousPostData) {
                queryClient.setQueryData(queryKey, context.previousPostData);
                console.log("[onError Collect][usePostQueries] Rolled back optimistic update for key:", queryKey);
            }
            const backendError = error.response?.data?.error;
            toast.error(`收藏操作失败: ${backendError || error.message || '未知错误'}`);
        },
        onSettled: (data, error, variables) => {
            const { postSlug, topicSlugForList } = variables; // 解构 topicSlugForList
            const queryKeyDetails = ['postDetails', postSlug];
            // console.log("[onSettled Collect][usePostQueries] Would have invalidated query for final consistency (now commented out):", queryKeyDetails);
            // queryClient.invalidateQueries({ queryKey: queryKeyDetails });

            // 确保在 onSettled 中也尝试失效列表缓存
            if (topicSlugForList) {
                const queryKeyList = ['topicPosts', topicSlugForList];
                queryClient.invalidateQueries({ queryKey: queryKeyList });
                console.log('[onSettled Collect][usePostQueries] Invalidated topicPosts query in onSettled for key:', queryKeyList);
            }
        },
    });
};

// --- Share Post Mutation ---
interface SharePostVariables {
    postId: number;
    token: string | null;
    content?: string; // Optional share content/comment
    images?: string[]; // Optional images for the share
    topicSlugForList?: string; // For invalidating the post list cache
    postSlug?: string; // For invalidating post details cache, if needed
}

const sharePostAPI = async ({ postId, token, content, images }: SharePostVariables): Promise<ActionResponse> => {
    if (!token) throw new Error('需要认证');

    const payload = {
        action_type: 'share',
        target_type: 'post',
        target_id: postId,
        content: content || '',
        images: images || [],
    };

    const url = `${API_BASE_URL}/api/actions`;
    console.log(`[API][usePostQueries] Attempting to share post ID: ${postId} with payload:`, payload);

    const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
    });

    console.log(`[API][usePostQueries] Share post response status: ${response.status}, data:`, response.data);

    // Assuming 200 or 201 for successful share action
    if (response.status !== 200 && response.status !== 201) {
        const errorMsg = (response.data as any)?.error || '分享失败';
        throw new Error(errorMsg);
    }

    return response.data;
};

export const useSharePost = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ActionResponse, 
        AxiosError<{ error?: string }>, 
        SharePostVariables,
        unknown // No specific context needed for optimistic updates here for now
    >({
        mutationFn: sharePostAPI,
        onSuccess: (data, variables) => {
            toast.success(data.message || '分享成功！');
            const { topicSlugForList, postSlug } = variables;

            if (topicSlugForList) {
                const queryKeyList = ['topicPosts', topicSlugForList];
                queryClient.invalidateQueries({ queryKey: queryKeyList });
                console.log('[onSuccess Share][usePostQueries] Invalidated topicPosts query for key:', queryKeyList);
            }
            // Optionally invalidate post details if share count is shown there
            if (postSlug) {
                 const queryKeyDetails = ['postDetails', postSlug];
                 queryClient.invalidateQueries({ queryKey: queryKeyDetails });
                 console.log('[onSuccess Share][usePostQueries] Invalidated postDetails query for key:', queryKeyDetails);
            }
        },
        onError: (error) => {
            const backendError = error.response?.data?.error;
            toast.error(`分享失败: ${backendError || error.message || '未知错误'}`);
        },
    });
};
