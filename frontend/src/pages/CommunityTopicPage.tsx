import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CommunityContentPageLayout from '../components/CommunityContentPageLayout';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTopicDetails, useTopicPosts, useToggleTopicFavorite } from '../hooks/useTopicQueries';

/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * CommunityTopicPage.tsx
 * 
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

  // Extract posts from postsData
  const posts = postsData?.posts || [];

  // --- Instantiate Mutation Hook ---
  const toggleFavoriteMutation = useToggleTopicFavorite(); 

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
      />
    </>
  );
};

export default CommunityTopicPage; 