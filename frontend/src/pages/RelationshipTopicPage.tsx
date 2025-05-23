import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CommunityContentPageLayout from '../components/CommunityContentPageLayout';
import { toast } from 'react-toastify';
import CommunityChatPanel from '../components/CommunityChatPanel';
import { useSidebar } from '../contexts/SidebarContext';
// --- TanStack Query Import ---
import { useQuery, useQueryClient } from '@tanstack/react-query';
// --- Import Custom Hooks ---
import { useRelationshipTopicDetails, useRelationshipTopicPosts, useToggleRelationshipTopicFavorite } from '../hooks/useRelationshipTopicQueries';

const RelationshipTopicPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { isSidebarOpen } = useSidebar();
  const queryClient = useQueryClient();

  // --- Use TanStack Query Hooks --- 
  const {
    data: relationshipTopicDetails,
    isLoading: loadingTopic,
    isError: isTopicError,
    error: topicError
  } = useRelationshipTopicDetails(slug);

  const {
    data: postsData,
    isLoading: loadingPosts,
    isError: isPostsError,
    error: postsError
  } = useRelationshipTopicPosts(relationshipTopicDetails?.id);

  // --- Instantiate Mutation Hook --- 
  const toggleFavoriteMutation = useToggleRelationshipTopicFavorite(); 

  // Extract posts from postsData
  const posts = postsData?.posts || [];

  // Determine overall loading and error states
  const isLoadingPage = loadingTopic;
  const pageError = isTopicError ? (topicError as Error)?.message || '加载关系主题详情时出错'
                   : isPostsError ? (postsError as Error)?.message || '加载帖子列表时出错'
                   : null;

  // --- Update toggleFavorite function --- 
  const toggleFavorite = useCallback(async () => {
    if (!relationshipTopicDetails || !user || toggleFavoriteMutation.isPending || !token) { 
      console.log("[DEBUG RelFav] toggleFavorite prerequisite not met or mutation is pending.");
      return;
    }

    const currentRelTopicId = relationshipTopicDetails.id;
    const currentRelTopicName = relationshipTopicDetails.name;
    // 直接从 relationshipTopicDetails 读取当前状态
    const currentlyFavorited = relationshipTopicDetails.is_favorited || false;

    // --- Call the mutation --- 
    toggleFavoriteMutation.mutate(
      {
        relTopicId: currentRelTopicId,
        token: token,
        currentFavoriteState: currentlyFavorited,
        relTopicName: currentRelTopicName,
      },
      {
        onSuccess: () => {
          // --- 成功后 invalidate 关系主题详情查询 --- 
          console.log(`[Toggle RelTopic Favorite Success] Invalidating relationshipTopicDetails for slug: ${slug}`);
          queryClient.invalidateQueries({ queryKey: ['relationshipTopicDetails', slug] });
        },
        onError: () => {
          // 错误信息由 hook 处理
          // 不再需要本地回滚
        },
      }
    );
  }, [relationshipTopicDetails, user, token, toggleFavoriteMutation, queryClient, slug]); // Add dependencies

  // --- 创建帖子回调 (基本不变, 确认依赖) ---
  const handleCreatePost = useCallback(() => {
    if (relationshipTopicDetails) {
      navigate(`/community/${relationshipTopicDetails.slug}/new-post`, {
            state: {
                relationshipTopicId: relationshipTopicDetails.id,
                relationshipTopicName: relationshipTopicDetails.name,
                parentType: 'relationship' // Ensure correct parentType is passed
            }
      });
    } else {
        console.error("无法创建帖子，关系主题详情未加载。");
    }
  }, [navigate, relationshipTopicDetails]);

  // --- 渲染逻辑 ---
  return (
    <>
      <CommunityContentPageLayout
        isLoading={isLoadingPage}
        error={pageError}
        topicDetails={relationshipTopicDetails ? {
            id: relationshipTopicDetails.id,
            name: relationshipTopicDetails.name,
            slug: relationshipTopicDetails.slug,
            description: relationshipTopicDetails.description,
            // is_favorited 不直接属于 CommonTopicInfo，但在下面单独传递
        } : null}
        posts={posts}
        isLoadingPosts={loadingPosts}
        parentType='relationship'
        parentSlug={relationshipTopicDetails?.slug}
        showFavoriteButton={true}
        // 直接从 relationshipTopicDetails 读取收藏状态
        isFavorited={relationshipTopicDetails?.is_favorited || false} 
        isLoadingFavorite={toggleFavoriteMutation.isPending}
        onToggleFavorite={toggleFavorite}
        onCreatePost={handleCreatePost}
        showChatButton={true}
        isChatAvailable={true}
        />
    </>
  );
};

export default RelationshipTopicPage; 