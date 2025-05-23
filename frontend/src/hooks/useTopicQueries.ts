import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { toast } from 'react-toastify';

// --- 接口定义 ---
// 注意：Post 接口可能在多个 Hook 文件中重复，未来可以考虑提取到共享类型文件
// 帖子数据类型
interface Post {
  id: number;
  title: string;
  author: any;
  content?: string;
  summary?: string;
  excerpt?: string;
  upvotes?: number;
  comments?: number;
  created_at?: string;
  timestamp?: string;
  cover_image?: string;
  imageUrl?: string;
  slug: string;
  likes_count?: number;
  collects_count?: number;
  comments_count?: number;
  shares_count?: number;
  like_count?: number;
  collect_count?: number;
  comment_count?: number;
  share_count?: number;
}

// 主题数据类型
interface Topic {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_favorited?: boolean;
}
// --- 结束接口定义 ---


// --- Hook for fetching Topic Details ---
export const useTopicDetails = (topicSlug: string | undefined) => {
    const queryKey = ['topicDetails', topicSlug];
    const queryFn = async () => {
        if (!topicSlug) throw new Error("无效的主题标识符");
        console.log(`[useTopicDetails] Fetching details for slug: ${topicSlug}`);
        const response = await axios.get<Topic>(`${API_BASE_URL}/api/slug/${topicSlug}`);
        if (!response.data || typeof response.data !== 'object' || !response.data.id) {
           throw new Error("从后端获取的主题数据格式不正确或缺少 ID");
        }
        console.log("[useTopicDetails] Fetched details:", response.data);
        return response.data;
    };
    return useQuery<Topic, Error>(
        {
            queryKey: queryKey,
            queryFn: queryFn,
            enabled: !!topicSlug,
            staleTime: 15 * 60 * 1000, // 15 minutes
            gcTime: 30 * 60 * 1000, // 30 minutes
            retry: (failureCount, error) => {
               if ((error as any)?.response?.status === 404) {
                   return false;
               }
               return failureCount < 3;
            }
        }
    );
};

// --- Hook for fetching Posts for a Topic ---
export const useTopicPosts = (topicSlug: string | undefined) => {
    const queryKey = ['topicPosts', topicSlug];
    const queryFn = async () => {
        if (!topicSlug) return { posts: [], total: 0 };
        console.log(`[useTopicPosts] Fetching posts for slug: ${topicSlug}`);
        const fieldsToFetch = 'id,title,content,summary,category,tags,author,cover_image,slug,view_count,created_at,like_count,collect_count,share_count,comment_count';
        
        // 添加时间戳防止缓存问题
        const timestamp = new Date().getTime();
        const url = `${API_BASE_URL}/api/topics/${topicSlug}/posts?fields=${fieldsToFetch}&_=${timestamp}`;
        
        console.log(`[useTopicPosts] Request URL: ${url}`);
        
        const response = await axios.get<{ posts: Post[], total: number }>(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (response.data && Array.isArray(response.data.posts)) {
            const postsWithoutContent = response.data.posts.filter(post => !post.content);
            if (postsWithoutContent.length > 0) {
                console.warn(`[useTopicPosts] 警告: ${postsWithoutContent.length}/${response.data.posts.length} 帖子缺少content字段`);
                if (postsWithoutContent.length > 0) {
                    console.warn(`[useTopicPosts] 第一个缺少content的帖子ID: ${postsWithoutContent[0].id}, 标题: ${postsWithoutContent[0].title}`);
                    // 记录更多字段，帮助调试
                    console.warn(`[useTopicPosts] 该帖子所有字段:`, JSON.stringify(postsWithoutContent[0], null, 2));
                }
            } else {
                console.log(`[useTopicPosts] 所有帖子都包含content字段，共 ${response.data.posts.length} 篇`);
                // 记录第一个帖子的content长度
                if (response.data.posts.length > 0) {
                    const firstPost = response.data.posts[0];
                    console.log(`[useTopicPosts] 第一个帖子ID: ${firstPost.id}, 标题: ${firstPost.title}, content长度: ${firstPost.content?.length || 0}`);
                }
            }
        }
        
        console.log("[useTopicPosts] Fetched posts:", response.data.posts);
        return response.data;
    };
    return useQuery<{ posts: Post[], total: number }, Error>(
        {
            queryKey: queryKey,
            queryFn: queryFn,
            enabled: !!topicSlug,
            // --- 缓存配置 --- 
            // staleTime: 5 分钟。帖子列表可能更新较快，缓存时间设短一些。
            staleTime: 5 * 60 * 1000, 
            // gcTime: 10 分钟。帖子列表在不活跃后可以更快地被清除。
            gcTime: 10 * 60 * 1000, 
            // --- 结束缓存配置 ---
            // 减少缓存，强制刷新
            refetchOnMount: true,
            refetchOnWindowFocus: true
        }
    );
};

// --- Mutation Hook: Toggle Topic Favorite Status ---
interface ToggleTopicFavoriteVariables {
  topicId: number;
  token: string | null;
  currentFavoriteState: boolean; // Is it currently favorited?
  topicName: string; // For toast messages
}

export const useToggleTopicFavorite = () => {
    const queryClient = useQueryClient();

    // Define the mutation function
    const mutationFn = async ({ topicId, token, currentFavoriteState }: ToggleTopicFavoriteVariables) => {
        if (!token) throw new Error('用户未登录');

        const headers = { Authorization: `Bearer ${token}` };
        const endpointBase = `${API_BASE_URL}/api/users/favorites/topics`;

        if (currentFavoriteState) {
            // --- Remove Favorite --- 
            console.log(`[useToggleTopicFavorite] Attempting DELETE for topic ID: ${topicId}`);
            await axios.delete(`${endpointBase}/${topicId}`, { headers });
        } else {
            // --- Add Favorite --- 
            console.log(`[useToggleTopicFavorite] Attempting POST for topic ID: ${topicId}`);
            await axios.post(endpointBase, { topic_id: topicId }, { headers });
        }
    };

    return useMutation<void, Error, ToggleTopicFavoriteVariables>({
        mutationFn: mutationFn,
        onSuccess: (data, variables) => {
            // --- Success Handling --- 
            const action = variables.currentFavoriteState ? '取消收藏' : '收藏';
            toast.success(`已${action} "${variables.topicName}"`);
            console.log(`[useToggleTopicFavorite Success] Toggled favorite for Topic ID: ${variables.topicId}`);
            
            // --- Invalidate relevant queries --- 
            // --- Invalidate 主题详情查询 --- 
            // 需要 slug 来 invalidate，但 variables 中没有 slug
            // 方案一：如果 Topic ID 和 Slug 总是一起知道，可以在调用 mutate 时传入 slug
            // 方案二：或者假设 topicDetails 缓存的 key 只用了 topicId (不推荐)
            // 方案三：更稳妥的方式是在组件的 onSuccess 回调中 invalidate (如下面组件修改所示)
            // queryClient.invalidateQueries({ queryKey: ['topicDetails', variables.topicSlug] }); // 这里需要 slug!
            
            queryClient.invalidateQueries({ queryKey: ['userFavoritesList'] });
        },
        onError: (error, variables) => {
            // --- Error Handling --- 
            console.error("[useToggleTopicFavorite Error]:", error);
            toast.error('操作失败，请稍后重试');
            // Note: Optimistic update rollback would happen here if implemented
            // Since we keep local state for now, the component's rollback is sufficient.
        },
    });
}; 