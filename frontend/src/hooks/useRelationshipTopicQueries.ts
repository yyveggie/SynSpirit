import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { toast } from 'react-toastify';

// --- 接口定义 ---
// 注意：Post 和 Topic 接口可能在多个 Hook 文件中重复，未来可以考虑提取到共享类型文件
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
  // 添加互动数据字段
  likes_count?: number;
  collects_count?: number;
  comments_count?: number;
  shares_count?: number;
  // 后端API也可能使用不同的命名格式，添加兼容字段
  like_count?: number;
  collect_count?: number;
  comment_count?: number;
  share_count?: number;
}

// 主题数据类型 (用于 RelationshipTopic 的 participant_topics)
interface Topic {
  id: number;
  name: string;
  slug: string;
}

// 关系主题数据类型
interface RelationshipTopic {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    relation_type: string | null;
    participant_topics?: Topic[];
    is_favorited?: boolean;
}
// --- 结束接口定义 ---


// --- Hook for fetching Relationship Topic Details ---
export const useRelationshipTopicDetails = (slug: string | undefined) => {
    const queryKey = ['relationshipTopicDetails', slug];
    const queryFn = async () => {
        if (!slug) throw new Error("无效的关系主题标识符");
        console.log(`[useRelationshipTopicDetails] Fetching details for slug: ${slug}`);
        const response = await axios.get<RelationshipTopic>(`${API_BASE_URL}/api/relationship-topics/slug/${slug}`);
        if (!response.data || typeof response.data !== 'object' || !response.data.id) {
           throw new Error("从后端获取的关系主题数据格式不正确或缺少 ID");
        }
        console.log("[useRelationshipTopicDetails] Fetched details:", response.data);
        return response.data;
    };
    return useQuery<RelationshipTopic, Error>({
        queryKey: queryKey,
        queryFn: queryFn,
        enabled: !!slug,
        // --- 缓存配置 ---
        // staleTime: 15 分钟。关系主题详情通常不频繁变动。
        staleTime: 15 * 60 * 1000,
        // gcTime: 30 分钟。
        gcTime: 30 * 60 * 1000,
        // --- 结束缓存配置 ---
        retry: (failureCount, error) => {
           if ((error as any)?.response?.status === 404) {
               return false;
           }
           return failureCount < 3;
        }
    });
};

// --- Hook for fetching Posts for a Relationship Topic ---
export const useRelationshipTopicPosts = (relationshipTopicId: number | undefined) => {
    const queryKey = ['relationshipTopicPosts', relationshipTopicId];
    const queryFn = async () => {
        if (!relationshipTopicId) return { posts: [], total: 0 };
        console.log(`[useRelationshipTopicPosts] Fetching posts for relationship topic ID: ${relationshipTopicId}`);
        // 添加字段参数，确保包含content字段
        const fieldsToFetch = 'id,title,content,summary,category,tags,author,cover_image,slug,view_count,created_at,like_count,collect_count,share_count,comment_count';
        
        // 添加时间戳防止缓存问题
        const timestamp = new Date().getTime();
        const url = `${API_BASE_URL}/api/relationship-topics/${relationshipTopicId}/posts?fields=${fieldsToFetch}&_=${timestamp}`;
        
        console.log(`[useRelationshipTopicPosts] Request URL: ${url}`);
        
        const response = await axios.get<{ posts: Post[], total: number }>(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        // 添加调试日志，检查返回的帖子数据是否包含content字段
        if (response.data && Array.isArray(response.data.posts)) {
            const postsWithoutContent = response.data.posts.filter(post => !post.content);
            if (postsWithoutContent.length > 0) {
                console.warn(`[useRelationshipTopicPosts] 警告: ${postsWithoutContent.length}/${response.data.posts.length} 帖子缺少content字段`);
                // 记录第一个没有content的帖子ID，帮助调试
                if (postsWithoutContent.length > 0) {
                    console.warn(`[useRelationshipTopicPosts] 第一个缺少content的帖子ID: ${postsWithoutContent[0].id}, 标题: ${postsWithoutContent[0].title}`);
                    // 记录更多字段，帮助调试
                    console.warn(`[useRelationshipTopicPosts] 该帖子所有字段:`, JSON.stringify(postsWithoutContent[0], null, 2));
                }
            } else {
                console.log(`[useRelationshipTopicPosts] 所有帖子都包含content字段，共 ${response.data.posts.length} 篇`);
                // 记录第一个帖子的content长度
                if (response.data.posts.length > 0) {
                    const firstPost = response.data.posts[0];
                    console.log(`[useRelationshipTopicPosts] 第一个帖子ID: ${firstPost.id}, 标题: ${firstPost.title}, content长度: ${firstPost.content?.length || 0}`);
                }
            }
        }
        
        console.log("[useRelationshipTopicPosts] Fetched posts:", response.data.posts);
        return response.data;
    };
    return useQuery<{ posts: Post[], total: number }, Error>(
        {
        queryKey: queryKey,
        queryFn: queryFn,
        enabled: !!relationshipTopicId,
            staleTime: 5 * 60 * 1000, // 5分钟内不重新获取
            gcTime: 10 * 60 * 1000, // 10分钟后清除缓存
            // 减少缓存，强制刷新
            refetchOnMount: true,
            refetchOnWindowFocus: true
        }
    );
};

// --- Mutation Hook: Toggle Relationship Topic Favorite Status ---
interface ToggleRelationshipTopicFavoriteVariables {
  relTopicId: number;
  token: string | null;
  currentFavoriteState: boolean;
  relTopicName: string; // For toast messages
}

export const useToggleRelationshipTopicFavorite = () => {
    const queryClient = useQueryClient();

    const mutationFn = async ({ relTopicId, token, currentFavoriteState }: ToggleRelationshipTopicFavoriteVariables) => {
        if (!token) throw new Error('用户未登录');

        const headers = { Authorization: `Bearer ${token}` };
        const endpointBase = `${API_BASE_URL}/api/users/favorites/relationship-topics`;

        if (currentFavoriteState) {
            // --- Remove Favorite --- 
            console.log(`[useToggleRelTopicFav] Attempting DELETE for relTopic ID: ${relTopicId}`);
            await axios.delete(`${endpointBase}/${relTopicId}`, { headers });
        } else {
            // --- Add Favorite --- 
            console.log(`[useToggleRelTopicFav] Attempting POST for relTopic ID: ${relTopicId}`);
            await axios.post(endpointBase, { relationship_topic_id: relTopicId }, { headers });
        }
    };

    return useMutation<void, Error, ToggleRelationshipTopicFavoriteVariables>({
        mutationFn: mutationFn,
        onSuccess: (data, variables) => {
            const action = variables.currentFavoriteState ? '取消收藏' : '收藏';
            toast.success(`已${action} "${variables.relTopicName}"`);
            console.log(`[useToggleRelTopicFav Success] Toggled favorite for RelTopic ID: ${variables.relTopicId}`);
            
            // --- Invalidate relevant queries --- 
            // --- Invalidate 关系主题详情查询 --- 
            // 同样缺少 slug
            // queryClient.invalidateQueries({ queryKey: ['relationshipTopicDetails', variables.relTopicSlug] }); // 这里需要 slug!

            queryClient.invalidateQueries({ queryKey: ['userFavoritesList'] });
        },
        onError: (error, variables) => {
            console.error("[useToggleRelTopicFav Error]:", error);
            toast.error('操作失败，请稍后重试');
        },
    });
}; 