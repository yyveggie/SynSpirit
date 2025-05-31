import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CommunityContentPageLayout from '../components/CommunityContentPageLayout';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTopicDetails, useTopicPosts, useToggleTopicFavorite } from '../hooks/useTopicQueries';
import { useLikePost, useCollectPost, useSharePost } from '../hooks/usePostQueries';
import ShareDynamicModal from '../components/ShareDynamicModal';
import { AxiosError } from 'axios';

// Define Post type locally if not available from a central types file
// This should ideally match the structure returned by useTopicPosts
interface Post {
  id: number;
  title: string;
  slug: string;
  author: any; // Consider defining a more specific Author type
  content?: string;
  summary?: string;
  excerpt?: string;
  created_at?: string;
  // Interaction states and counts - ensure these are part of the data from useTopicPosts
  is_liked?: boolean;
  is_collected?: boolean;
  likes_count?: number;
  collects_count?: number;
  comments_count?: number;
  shares_count?: number;
  // Add other fields from your actual Post structure if needed
}

/**
 * 功能注释：
 * 定义特定主题社区页面的 React 组件。
 * 负责协调数据获取、状态管理和 UI 渲染。
 * 
 * 主要功能:
 * - 从 URL 参数获取主题 slug。
 * - 使用 TanStack Query 的自定义 Hook (`useTopicDetails`) 获取并缓存特定主题的详细信息。
 * - 使用 TanStack Query 的自定义 Hook (`useTopicPosts`) 获取并缓存该主题下的帖子列表。
 * - 管理用户对该主题的收藏状态 (获取和切换)。
 * - 处理页面加载状态和错误显示。
 * - 将获取到的数据和状态传递给 `CommunityContentPageLayout` 进行布局渲染。
 * - 管理社区实时聊天面板 (`CommunityChatPanel`) 的显隐。
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */

const CommunityTopicPage: React.FC = () => {
  const { topicSlug } = useParams<{ topicSlug: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  const queryClient = useQueryClient();

  // --- Use TanStack Query Hooks ---
  const {
     data: topicDetails,
     isLoading: loadingTopic,
     isError: isTopicError,
     error: topicError
  } = useTopicDetails(topicSlug);

  const {
    data: postsData,
    isLoading: loadingPosts,
    isError: isPostsError,
    error: postsError
  } = useTopicPosts(topicSlug);

  // Extract posts from postsData and explicitly type it
  const posts: Post[] = postsData?.posts || [];

  // --- Instantiate Mutation Hook ---
  const toggleFavoriteMutation = useToggleTopicFavorite(); 
  const likePostMutation = useLikePost();
  const collectPostMutation = useCollectPost();
  const sharePostMutation = useSharePost();

  // --- State for Share Modal ---
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingPost, setSharingPost] = useState<Post | null>(null);
  const [shareComment, setShareComment] = useState('');

  // Determine overall loading and error states based on hooks
  const isLoadingPage = loadingTopic; // Primarily depends on topic details loading
  const pageError = isTopicError ? (topicError as Error)?.message || '加载主题详情时出错' 
                   : isPostsError ? (postsError as Error)?.message || '加载帖子列表时出错' 
                   : null;

  const toggleFavorite = useCallback(async () => {
    if (!topicDetails || !user || toggleFavoriteMutation.isPending) {
      console.log("[DEBUG] toggleFavorite called but prerequisite not met or mutation is pending.");
      return;
    }

    const currentTopicId = topicDetails.id;
    const currentTopicName = topicDetails.name;
    const currentlyFavorited = topicDetails.is_favorited || false;

    toggleFavoriteMutation.mutate(
      {
        topicId: currentTopicId,
        token: token,
        currentFavoriteState: currentlyFavorited,
        topicName: currentTopicName,
      },
      {
        onSuccess: () => {
          console.log(`[Toggle Topic Favorite Success] Invalidating topicDetails for slug: ${topicSlug}`);
          queryClient.invalidateQueries({ queryKey: ['topicDetails', topicSlug] });
        },
        onError: () => {
          // 错误信息由 hook 处理
        },
      }
    );
  }, [topicDetails, user, token, toggleFavoriteMutation, queryClient, topicSlug]);

  const handleCreatePost = useCallback(() => {
    if (topicDetails) {
        navigate(`/community/${topicDetails.slug}/new-post`, { 
            state: { 
                topicId: topicDetails.id, 
                topicName: topicDetails.name 
            } 
        });
    } else {
        console.error("无法创建帖子，主题详情未加载。", {topicDetails});
    }
  }, [navigate, topicDetails]);

  // --- Placeholder Handlers for Post Interactions ---
  const handlePostLikeToggle = useCallback((postId: number) => {
    console.log(`Toggling like for post ${postId}`);
    const post = posts.find(p => p.id === postId);
    if (!post || !token || !topicSlug) return;

    likePostMutation.mutate({
      postId,
      token,
      currentLikeState: post.is_liked || false,
      currentLikeActionId: null, // Assuming not strictly needed by the new API, or pass if available
      postSlug: post.slug || '', // Ensure post.slug is available
      topicSlugForList: topicSlug,
    });
  }, [posts, token, topicSlug, likePostMutation, queryClient]);

  const handlePostCollectToggle = useCallback((postId: number) => {
    console.log(`Toggling collect for post ${postId}`);
    const post = posts.find(p => p.id === postId);
    if (!post || !token || !topicSlug) return;

    collectPostMutation.mutate({
      postId,
      token,
      currentCollectState: post.is_collected || false,
      currentCollectActionId: null, // Assuming not strictly needed, or pass if available
      postSlug: post.slug || '', // Ensure post.slug is available
      topicSlugForList: topicSlug,
    });
  }, [posts, token, topicSlug, collectPostMutation, queryClient]);

  const handlePostCommentClick = useCallback((postId: number) => {
    console.log(`Navigating to comments for post ${postId}`);
    if (topicSlug) {
      const postIdentifier = posts.find(p => p.id === postId)?.slug || postId.toString();
      navigate(`/community/topic/${topicSlug}/posts/${postIdentifier}`);
    }
  }, [navigate, topicSlug, posts]);

  const handlePostShareClick = useCallback((postId: number) => {
    console.log(`Sharing post ${postId}`);
    const postToShare = posts.find(p => p.id === postId);
    if (postToShare) {
      setSharingPost(postToShare);
      setShareComment(''); // Reset comment
      setIsShareModalOpen(true);
    }
  }, [posts]);

  // --- Share Submit Handler ---
  const handleShareSubmit = async (comment: string, images?: string[]) => {
    if (!sharingPost || !token || !topicSlug) {
      // Maybe show a toast error
      console.error('Share submission failed: missing sharingPost, token, or topicSlug');
      return;
    }

    sharePostMutation.mutate({
      postId: sharingPost.id,
      token,
      content: comment,
      images,
      topicSlugForList: topicSlug,
      postSlug: sharingPost.slug || '',
    }, {
      onSuccess: () => {
        setIsShareModalOpen(false);
        setSharingPost(null);
        // Toast is handled by the hook
      },
      onError: () => {
        // Toast is handled by the hook, modal can remain open or close based on UX preference
      }
    });
  };

  return (
    <>
      <CommunityContentPageLayout
        isLoading={isLoadingPage}
        error={pageError}
        topicDetails={topicDetails ?? null}
        posts={posts}
        isLoadingPosts={loadingPosts}
        parentType='topic'
        parentSlug={topicDetails?.slug}
        showFavoriteButton={true}
        isFavorited={topicDetails?.is_favorited || false}
        isLoadingFavorite={toggleFavoriteMutation.isPending}
        onToggleFavorite={toggleFavorite}
        onCreatePost={handleCreatePost}
        showChatButton={true}
        isChatAvailable={true}
        // Pass the new handlers down
        onPostLikeToggle={handlePostLikeToggle}
        onPostCollectToggle={handlePostCollectToggle}
        onPostCommentClick={handlePostCommentClick}
        onPostShareClick={handlePostShareClick}
      />
      {/* Share Modal */}
      {isShareModalOpen && sharingPost && (
        <ShareDynamicModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setSharingPost(null);
          }}
          onSubmit={handleShareSubmit}
          comment={shareComment}
          setComment={setShareComment}
          error={sharePostMutation.error ? (sharePostMutation.error as AxiosError<{ error?: string }>)?.response?.data?.error || (sharePostMutation.error as Error)?.message : null}
          isLoading={sharePostMutation.isPending}
          dynamicToShare={sharingPost} // Pass the whole post object
          username={user?.nickname || user?.email?.split('@')[0] || '您'}
          altText={`分享来自 ${sharingPost.author?.nickname || sharingPost.author?.email?.split('@')[0] || '用户'} 的帖子: ${sharingPost.title}`}
        />
      )}
    </>
  );
};

export default CommunityTopicPage; 