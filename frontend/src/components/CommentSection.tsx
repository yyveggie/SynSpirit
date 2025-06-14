/**
 * CommentSection.tsx
 * 
 * 此组件负责渲染和管理特定目标（文章或帖子）的评论区。
 * 
 * 主要功能:
 * - 使用 TanStack Query (`useQuery`) 获取并缓存评论列表，管理加载和错误状态。
 * - 根据 Query Key (`['comments', targetType, targetId, sortBy]`) 区分不同排序的缓存。
 * - 使用 `placeholderData` 优化排序切换时的 UI 体验，避免闪烁。
 * - 使用 TanStack Query (`useMutation`) 处理评论的创建、回复、删除和点赞操作，并自动或手动更新缓存。
 * - 显示评论列表 (包括嵌套的回复)，并支持折叠/展开。
 * - 提供顶层评论的输入框。
 * - 支持对现有评论进行回复。
 * - 根据用户登录状态控制评论、回复和删除权限。
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { MessageSquare } from 'lucide-react';
import UserAvatar from './UserAvatar';
// --- TanStack Query Import ---
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
// --- End TanStack Query Import ---
import { API_BASE_URL } from '../config';
import { FaSpinner, FaReply, FaSyncAlt } from 'react-icons/fa';
import { BsArrowReturnRight } from 'react-icons/bs';
import { motion } from 'framer-motion';
import { Heart, Pin, Share, TrashTwo, EditOne } from "@mynaui/icons-react";

// --- 接口定义 ---
interface UserInfo {
  id: number;
  nickname?: string | null;
  email?: string;
  avatar?: string | null; // 确保包含头像
}

interface Comment {
  id: number;
  content: string;
  created_at: string;
  post_id?: number; // 根据 targetType 确定
  article_id?: number; // 根据 targetType 确定
  user_id: number | null;
  parent_id: number | null;
  user: UserInfo | null;
  replies: Comment[];
  likes_count: number;
  is_liked_by_current_user: boolean;
  is_deleted?: boolean; // 新增：软删除标记
  _isOptimistic?: boolean; // 新增：标记乐观更新的临时对象
  is_ai_generated: boolean;
  is_edited?: boolean; // 新增：编辑标记
}

// 定义乐观更新上下文类型
interface ReplyMutationContext {
  previousComments: Comment[];
}

interface CommentSectionProps {
  targetType: 'post' | 'article'; // 评论目标类型
  targetId: number;               // 评论目标ID
  apiBaseUrl: string;             // API基础URL
  token: string | null;           // 用户认证令牌
  currentUser: UserInfo | null;   // 当前登录用户信息
  // --- 新增：点赞、收藏、分享相关 Props ---
  isLiked: boolean;               // 目标是否已点赞
  isCollected: boolean;           // 目标是否已收藏
  likeCount: number;              // 点赞数
  collectCount: number;           // 收藏数
  shareCount: number;             // 分享数
  handleLikeToggle: () => void;   // 处理点赞切换
  handleCollectToggle: () => void; // 处理收藏切换
  handleShareClick: () => void;   // 处理分享点击
  isSubmittingAction: boolean;    // 操作（点赞/收藏/分享）是否正在提交
  // --- 结束新增 ---
}

// --- API Fetching Function (移除客户端排序) ---
const fetchCommentsAPI = async (targetType: string, targetId: number, sortBy: string, token: string | null) => {
  // --- 修改：根据 targetType 动态构建 API URL --- 
  let apiUrlBase = '';
  if (targetType === 'article') {
    // 文章评论使用新的 /tree 端点获取完整树
    apiUrlBase = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/tree`; 
    // console.log(`[CommentSection DEBUG] Base URL for article comments: ${apiUrlBase}`);
  } else if (targetType === 'post') {
    // 帖子评论使用其标准端点获取完整树
    apiUrlBase = `${API_BASE_URL}/api/posts/${targetId}/comments`; // 这个端点应该返回完整树
    // console.log(`[CommentSection DEBUG] Base URL for post comments: ${apiUrlBase}`);
  } else {
    // console.error(`[CommentSection ERROR] Unknown targetType: ${targetType}`);
    return []; 
  }
  // --- 结束修改 ---

  // 将 sortBy 参数添加到 URL
  const apiUrlWithSort = `${apiUrlBase}?sort_by=${sortBy}`;
  // console.log(`[CommentSection DEBUG] Fetching comments from: ${apiUrlWithSort}`);
  
  // --- 修改：根据 targetType 判断期望的响应结构 ---
  let fetchedComments: Comment[] = [];
  if (targetType === 'post') {
    // 帖子评论 API 可能返回 { comments: [] }
    const response = await axios.get<{ comments: Comment[] }>(apiUrlWithSort, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    fetchedComments = response.data?.comments || [];
    // console.log(`[CommentSection DEBUG] Post comments raw response data:`, response.data);
  } else if (targetType === 'article') {
    // 文章评论 API 直接返回 []
    const response = await axios.get<Comment[]>(apiUrlWithSort, { 
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    fetchedComments = response.data || [];
  } else {
    // 未知类型，返回空数组，错误已在上面记录
    return [];
  }
  // --- 结束修改 ---
  
  // console.log(`[CommentSection DEBUG] Data received in fetchCommentsAPI before return (targetType: ${targetType}, sortBy: ${sortBy}):`, fetchedComments); 
  return fetchedComments; 
};

// --- Helper function for initializing collapse state ---
const initializeCollapseStateRecursively = (
  comments: Comment[],
  depth: number,
  state: { [key: number]: boolean }
) => {
  comments.forEach(comment => {
      if (comment.replies && comment.replies.length > 0) {
          // 修复：默认展开所有评论，无论深度
          state[comment.id] = false;  // 默认展开
          // 递归处理子回复
          initializeCollapseStateRecursively(comment.replies, depth + 1, state);
      }
  });
};

const CommentSection: React.FC<CommentSectionProps> = ({
  targetType,
  targetId,
  apiBaseUrl,
  token,
  currentUser,
  // --- 新增：解构新的 Props ---
  isLiked,
  isCollected,
  likeCount,
  collectCount,
  shareCount,
  handleLikeToggle,
  handleCollectToggle,
  handleShareClick,
  isSubmittingAction,
  // --- 结束新增 ---
}) => {
  // --- State Management ---
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replyTargetUser, setReplyTargetUser] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
  // 修改：使用useRef存储展开状态，防止刷新时重置
  const collapsedCommentsRef = useRef<{ [key: number]: boolean }>({});
  const [collapsedComments, setCollapsedComments] = useState<{ [key: number]: boolean }>({});
  // 修改：将selectedCommentId重命名为pendingDeleteCommentId以更好地表达其用途
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<number | null>(null);
  // 恢复isCommentFocused状态
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  // 添加编辑状态
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { token: authToken, user: currentUserFromAuth } = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  // 去除showReplyBox状态，而是用CSS来控制动画
  const replyContainerRef = useRef<HTMLDivElement>(null);
  // 用于跟踪点击事件来源的ref
  const replyButtonClickedRef = useRef(false);
  const queryClient = useQueryClient();
  const [refreshAnimationKey, setRefreshAnimationKey] = useState(0);
  
  // --- 移到组件内部: 使用useCallback包装初始化函数 ---
  const initializeCollapseStateRecursively = useCallback((
    comments: Comment[],
    depth: number,
    state: { [key: number]: boolean }
  ) => {
    comments.forEach(comment => {
      if (comment.replies && comment.replies.length > 0) {
        // 修改：不自动折叠任何评论，保持所有评论默认展开
        state[comment.id] = false;
        initializeCollapseStateRecursively(comment.replies, depth + 1, state);
      }
    });
  }, []);
  
  // --- TanStack Query for fetching comments ---
  const commentsQueryKey = ['comments', targetType, targetId, sortBy, currentUser?.id || 'anonymous'];

  const { 
    data: comments = [],
    isLoading: loadingComments,
    isError: isCommentError,
    error: commentError,
    refetch: refetchComments
  } = useQuery<Comment[], Error>({
    queryKey: commentsQueryKey,
    queryFn: () => fetchCommentsAPI(targetType, targetId, sortBy, authToken),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData) => previousData ?? [],
    enabled: !!targetId && !!targetType,
  });

  // --- 修改日志：包含 isLoading 和 isError ---
  useEffect(() => {
    console.log(
        // `[CommentSection DEBUG] State from useQuery (targetType: ${targetType}, targetId: ${targetId}, sortBy: ${sortBy}):`, 
        { isLoading: loadingComments, isError: isCommentError, commentsData: comments } // 同时打印状态和数据
    );
    if (isCommentError) {
        // console.error("[CommentSection DEBUG] useQuery reported an error:", commentError); // 如果出错，打印错误对象
    }
  }, [comments, loadingComments, isCommentError, commentError, targetType, targetId, sortBy]); 
  // --- 结束修改 ---

  // --- 修改：点赞、回复等操作后保留评论的展开状态 ---
  useEffect(() => {
    if (comments && comments.length > 0) {
      // 创建新状态对象，但保留已有的展开/折叠状态
      const updatedState = { ...collapsedCommentsRef.current };
      
      // 仅为新的评论ID初始化状态
      comments.forEach(comment => {
        if (comment.replies && comment.replies.length > 0) {
          // 如果评论ID不在当前状态中，则初始化为展开状态
          if (updatedState[comment.id] === undefined) {
            updatedState[comment.id] = false; // 默认展开
          }
          
          // 递归处理回复
          const processReplies = (replies: Comment[]) => {
            replies.forEach(reply => {
              if (reply.replies && reply.replies.length > 0) {
                if (updatedState[reply.id] === undefined) {
                  updatedState[reply.id] = false; // 默认展开
                }
                processReplies(reply.replies);
              }
            });
          };
          
          processReplies(comment.replies);
        }
      });
      
      // 更新状态引用和React状态
      collapsedCommentsRef.current = updatedState;
      setCollapsedComments(updatedState);
    }
  }, [comments]);

  // --- Helper Functions (Unchanged unless they used old state) ---
  const countTotalComments = useCallback((commentList: Comment[]): number => {
    let count = 0;
    for (const comment of commentList) {
      count++;
      if (comment.replies && comment.replies.length > 0) {
        count += countTotalComments(comment.replies);
      }
    }
    return count;
  }, []);

  // --- Mutations (Example: Submit Comment) ---
  const submitCommentMutation = useMutation<
    Comment,
    Error,
    { content: string; mentionLynn?: boolean }
  >({
    mutationFn: async ({ content, mentionLynn }) => {
      // --- 修改：确保使用 original-comments 路径创建文章评论 ---
      let postUrl = '';
      if (targetType === 'article') {
        postUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments`;
      } else if (targetType === 'post') {
        postUrl = `${API_BASE_URL}/api/posts/${targetId}/comments`; // 假设帖子评论创建路径不同
      } else {
        throw new Error(`[Submit Comment] Unknown targetType: ${targetType}`);
      }

      // 构建请求体
      const requestBody: { content: string; mention_lynn?: boolean } = {
        content: content.trim(),
      };

      if (mentionLynn) {
        requestBody.mention_lynn = true;
      }

      const response = await axios.post<Comment>(
        postUrl,
        requestBody,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      return response.data;
    },
    onSuccess: (newCommentData) => {
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
      setNewComment('');
      toast.success('评论发表成功！');
    },
    onError: (err) => {
      console.error("提交评论失败:", err);
      const errorMsg = err.message || '评论提交失败';
      toast.error(errorMsg);
    },
    onSettled: () => {
      setSubmittingComment(false);
    }
  });

  const handleSubmitComment = () => {
    if (!authToken || !newComment.trim()) {
      toast.warn("评论内容不能为空且需要登录。");
      return;
    }
    setSubmittingComment(true);

    // 新增：检测 @lynn 提及
    const mentionLynn = newComment.toLowerCase().includes('@lynn');

    submitCommentMutation.mutate({ content: newComment, mentionLynn });
  };
  
  // --- Submit Reply Mutation (Similar structure) ---
  const submitReplyMutation = useMutation<
    Comment,
    Error,
    { parentId: number, content: string, mentionLynn?: boolean },
    ReplyMutationContext
  >({
    mutationFn: async ({ parentId, content, mentionLynn }) => {
      // --- 修改：确保使用 original-comments 路径创建文章回复 ---
      let replyUrl = '';
      if (targetType === 'article') {
        replyUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/${parentId}/replies`;
      } else if (targetType === 'post') {
        replyUrl = `${API_BASE_URL}/api/posts/${targetId}/comments/${parentId}/replies`; // 假设帖子回复路径不同
      } else {
        throw new Error(`[Submit Reply] Unknown targetType: ${targetType}`);
      }
      
      // 增加日志记录请求URL和参数
      // console.log(`[CommentSection DEBUG] 提交回复请求: ${replyUrl}`, {
      //   parentId, 
      //   content,
      //   targetType,
      //   targetId
      // });
      
      // 构建请求体
      const requestBody: { content: string; mention_lynn?: boolean } = {
        content: content.trim(),
      };

      if (mentionLynn) {
        requestBody.mention_lynn = true;
      }
      
      const response = await axios.post<Comment>(
        replyUrl,
        requestBody,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      
      // 增加日志记录响应结果
      // console.log(`[CommentSection DEBUG] 提交回复响应:`, response.data);
      
      return response.data;
    },
    // --- 新增：添加乐观更新逻辑 ---
    onMutate: async ({ parentId, content }) => {
      // 取消正在进行的查询以避免它们覆盖我们的乐观更新
      await queryClient.cancelQueries({ queryKey: commentsQueryKey });
      
      // 保存当前状态，以便在出错时恢复
      const previousComments = queryClient.getQueryData<Comment[]>(commentsQueryKey) || [];
      
      // 创建一个临时的乐观回复对象
      const optimisticReply: Comment = {
        id: Date.now(), // 临时ID，最终会被后端返回的实际ID替换
        content: content,
        created_at: new Date().toISOString(),
        user_id: currentUser?.id || null,
        parent_id: parentId,
        user: currentUser, // 当前用户信息
        replies: [],
        likes_count: 0,
        is_liked_by_current_user: false,
        _isOptimistic: true, // 标记为乐观更新的临时对象
        is_ai_generated: false,
      };
      
      // 更新缓存数据，添加新回复到父评论
      queryClient.setQueryData<Comment[]>(commentsQueryKey, (oldComments = []) => {
        // 深拷贝旧评论列表
        const newComments = JSON.parse(JSON.stringify(oldComments));
        
        // 定义一个递归函数来找到父评论并添加回复
        const addReplyToParent = (comments: Comment[]): Comment[] => {
          return comments.map(comment => {
            if (comment.id === parentId) {
              // 找到父评论，添加回复
              return {
                ...comment,
                replies: [...(comment.replies || []), optimisticReply]
              };
            }
            
            // 如果有嵌套回复，也在其中查找
            if (comment.replies && comment.replies.length > 0) {
              return {
                ...comment,
                replies: addReplyToParent(comment.replies)
              };
            }
            
            return comment;
          });
        };
        
        return addReplyToParent(newComments);
      });
      
      // console.log("[CommentSection] 已添加乐观回复");
      
      // 返回上下文对象，用于出错时恢复
      return { previousComments };
    },
    // --- 结束新增 ---
    onSuccess: (newReplyData, variables) => {
      // --- 修改：更精确的缓存更新 ---
      // console.log("[CommentSection] 回复成功，更新缓存:", newReplyData);
      
      // 更新缓存，替换乐观回复为实际回复
      queryClient.setQueryData<Comment[]>(commentsQueryKey, (oldComments = []) => {
        if (!oldComments.length) {
          // 如果没有缓存的评论，重新获取
          queryClient.invalidateQueries({ queryKey: commentsQueryKey });
          return oldComments;
        }
        
        // 深拷贝旧评论列表
        const newComments = JSON.parse(JSON.stringify(oldComments));
        
        // 更新临时回复为实际回复
        const updateOptimisticReply = (comments: Comment[]): Comment[] => {
          return comments.map(comment => {
            if (comment.id === variables.parentId) {
              return {
                ...comment,
                replies: comment.replies.map(reply => 
                  // 如果是之前创建的乐观回复，替换为真实数据
                  (reply._isOptimistic) ? newReplyData : reply
                )
              };
            }
            
            if (comment.replies && comment.replies.length > 0) {
              return {
                ...comment,
                replies: updateOptimisticReply(comment.replies)
              };
            }
            
            return comment;
          });
        };
        
        return updateOptimisticReply(newComments);
      });
      // --- 结束修改 ---
      
      setReplyContent('');
      setReplyToCommentId(null);
      toast.success('回复成功！');
    },
    onError: (err, variables, context) => {
      console.error("提交回复失败:", err);
      toast.error(err.message || '回复提交失败');
      
      // --- 新增：错误恢复 ---
      // 恢复到之前的状态
      if (context?.previousComments) {
        queryClient.setQueryData(commentsQueryKey, context.previousComments);
      }
      // --- 结束新增 ---
    },
    onSettled: () => {
      setSubmittingReply(false);
    }
  });

  const handleSubmitReply = (parentId: number) => {
    if (!authToken || !replyContent.trim()) {
      toast.warn("回复内容不能为空且需要登录。");
      return;
    }
    setSubmittingReply(true);

    // 新增：检测 @lynn 提及
    const mentionLynnForReply = replyContent.toLowerCase().includes('@lynn');

    submitReplyMutation.mutate({ parentId, content: replyContent, mentionLynn: mentionLynnForReply });
  };

  // --- Delete Comment Mutation ---
  const deleteCommentMutation = useMutation<
    void,
    Error,
    { commentId: number }
  >({
    mutationFn: async ({ commentId }) => {
      // --- 修改：确保使用 original-comments 路径删除文章评论 ---
      let deleteUrl = '';
      if (targetType === 'article') {
        // 根据 original_comments.py 中的路由定义，删除需要 article_id
        deleteUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/${commentId}`;
      } else if (targetType === 'post') {
        deleteUrl = `${API_BASE_URL}/api/posts/${targetId}/comments/${commentId}`; // 假设帖子删除路径不同
      } else {
         throw new Error(`[Delete Comment] Unknown targetType: ${targetType}`);
      }
      await axios.delete(deleteUrl, { headers: { Authorization: `Bearer ${authToken}` } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
      toast.success('评论已删除');
    },
    onError: (err) => {
      console.error("删除评论失败:", err);
      toast.error(err.message || '删除评论失败');
    },
  });

  // --- 新增：恢复评论 Mutation ---
  const restoreCommentMutation = useMutation<
    void,
    Error,
    { commentId: number }
  >({
    mutationFn: async ({ commentId }) => {
      // 根据 targetType 使用不同的恢复路径
      let restoreUrl = '';
      if (targetType === 'article') {
        restoreUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/${commentId}/restore`;
      } else if (targetType === 'post') {
        restoreUrl = `${API_BASE_URL}/api/posts/${targetId}/comments/${commentId}/restore`;
      } else {
        throw new Error(`[Restore Comment] Unknown targetType: ${targetType}`);
      }
      
      console.log(`[Debug] 发送恢复评论请求: ${restoreUrl}`);
      
      try {
        // 发送 POST 请求恢复评论
        const response = await axios.post(restoreUrl, {}, { headers: { Authorization: `Bearer ${authToken}` } });
        console.log(`[Debug] 恢复评论成功, 状态码: ${response.status}`);
        return response.data;
      } catch (error) {
        console.error(`[Debug] 恢复评论请求失败:`, error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] });
      toast.success('评论已恢复');
    },
    onError: (err) => {
      console.error("恢复评论失败:", err);
      toast.error(err.message || '恢复评论失败');
    },
  });

  const handleDeleteCommentOrReply = (commentId: number) => {
    if (!authToken) {
      toast.error("请先登录。");
      return;
    }
    
    // 直接调用删除评论的 mutation
    deleteCommentMutation.mutate({ commentId });
  };

  // --- 新增：处理恢复评论的函数 ---
  const handleRestoreComment = (commentId: number) => {
    if (!authToken) {
      toast.error("请先登录。");
      return;
    }
    restoreCommentMutation.mutate({ commentId });
  };

  // --- Like/Unlike Mutations (Can be combined or separate) ---
  const toggleLikeMutation = useMutation<
    { likes_count: number; is_liked_by_current_user: boolean },
    Error,
    { commentId: number; isLiked: boolean }
  >({
    mutationFn: async ({ commentId, isLiked }) => {
      let url;
      // 根据评论目标类型 (targetType prop) 构造不同的点赞 URL
      if (targetType === 'post') {
        // 帖子评论使用 /api/posts/post_comments/.../like
        url = `${API_BASE_URL}/api/posts/post_comments/${commentId}/like`;
      } else if (targetType === 'article') {
        // 文章评论使用 /api/original-comments/comments/.../like
        // original_comments.py 中的相应路由默认 target_type 为 'article'
        url = `${API_BASE_URL}/api/original-comments/comments/${commentId}/like`;
      } else {
        console.error(`[CommentSection ERROR] Unsupported targetType for like: ${targetType}`);
        // 保留一个回退，尽管理想情况下应该为所有支持的类型明确处理或报错
        url = `${API_BASE_URL}/api/comments/${commentId}/like?target_type=${targetType}`;
      }
      
      // console.log(`[CommentSection DEBUG] Toggle like URL: ${url}`);

      let response;
      if (isLiked) {
        response = await axios.delete(url, { headers: { Authorization: `Bearer ${authToken}` } });
      } else {
        response = await axios.post(url, {}, { headers: { Authorization: `Bearer ${authToken}` } });
      }
      // --- 状态码检查保持不变 ---
      if (!(response.status === 200 || response.status === 201 || response.status === 204)) {
         throw new Error(response.data?.message || 'Like/Unlike API Error');
      }
      
      // 处理响应数据中的字段名可能不一致的问题
      const responseData = response.data || {};
      // 修改：优先读取 likes_count，兼容旧的 like_count
      const result = {
        likes_count: responseData.likes_count !== undefined ? responseData.likes_count : (responseData.like_count || 0),
        is_liked_by_current_user: responseData.is_liked_by_current_user !== undefined 
          ? responseData.is_liked_by_current_user 
          : responseData.is_liked 
      };
      
      return result;
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(commentsQueryKey, (oldData: Comment[] | undefined = []) => {
        const updateRecursively = (list: Comment[]): Comment[] => list.map(c => {
          if (c.id === variables.commentId) {
            return { 
              ...c, 
              // 修改：更新缓存中的 likes_count
              likes_count: data.likes_count, 
              is_liked_by_current_user: data.is_liked_by_current_user 
            };
          }
          if (c.replies && c.replies.length > 0) {
            return { ...c, replies: updateRecursively(c.replies) };
          }
          return c;
        });
        return updateRecursively(oldData);
      });
    },
    onError: (err, variables) => {
      console.error("Like/Unlike失败:", err);
      toast.error(`操作失败: ${err.message}`);
    }
  });

  const handleLike = (commentId: number) => {
    if (!authToken) { toast.warn("请先登录"); return; }
    toggleLikeMutation.mutate({ commentId, isLiked: false });
  };

  const handleUnlike = (commentId: number) => {
    if (!authToken) { toast.warn("请先登录"); return; }
    toggleLikeMutation.mutate({ commentId, isLiked: true });
  };

  // --- Other functions (handleReplyClick, handleCancelReply, toggleReplies, handleSortChange, etc.) remain largely the same ---
  const handleReplyClick = (commentId: number, targetUsername: string) => {
    // 标记该点击来自回复按钮，防止handleClickOutside立即触发
    replyButtonClickedRef.current = true;
    
    if (replyToCommentId === commentId) {
      // 如果点击的是当前已打开的回复框，关闭它
      setReplyToCommentId(null);
      setReplyTargetUser('');
      setReplyContent('');
    } else {
      // 切换到新的回复框
      setReplyToCommentId(commentId);
      setReplyTargetUser(targetUsername);
      setReplyContent('');
      
      // 使用requestAnimationFrame确保DOM更新后再聚焦
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (replyInputRef.current) {
            replyInputRef.current.focus();
          }
        }, 100);
      });
    }
  };
  
  const handleCancelReply = () => {
    setReplyToCommentId(null);
    setReplyTargetUser('');
    setReplyContent('');
  };
  
  // --- 修改：切换评论折叠状态的函数，确保也更新ref ---
  const toggleReplies = (commentId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    const newState = {
      ...collapsedComments,
      [commentId]: !collapsedComments[commentId]
    };
    
    // 同时更新引用和状态
    collapsedCommentsRef.current = newState;
    setCollapsedComments(newState);
  };

  const handleSortChange = (e: React.MouseEvent, newSortBy: 'latest' | 'popular') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (sortBy !== newSortBy) {
      const scrollPos = commentsContainerRef.current?.scrollTop || 0;
      
      setSortBy(prevSortBy => {
        console.log(`切换排序：${prevSortBy} -> ${newSortBy}`);
        return newSortBy;
      });
      
      // 手动触发数据重新获取
      refetchComments();

      requestAnimationFrame(() => {
        if (commentsContainerRef.current) {
          commentsContainerRef.current.scrollTop = scrollPos;
        }
      });
    }
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value);
  };

  const handleReplyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyContent(e.target.value);
  };

  const handleCommentFocus = () => setIsCommentFocused(true);
  const handleCommentBlur = () => {
    if (!newComment.trim()) {
      setIsCommentFocused(false);
        }
  };

  // Restore commentsContainerRef definition
  const commentsContainerRef = useRef<HTMLDivElement>(null);

  // --- 新增：刷新按钮点击处理函数 ---
  const handleRefreshComments = useCallback(() => {
    if (!loadingComments) { // Only trigger animation if not already loading
        setRefreshAnimationKey(prevKey => prevKey + 1);
    }
    if (refetchComments) { // Check if refetchComments is defined
        refetchComments();
        toast.info("正在刷新评论...");
    } else {
        console.error("refetchComments function is not available.");
        toast.error("刷新功能暂时无法使用。");
    }
  }, [loadingComments, refetchComments]);
  // --- 结束新增 ---

  // 添加自定义CSS样式到组件中
  useEffect(() => {
    // 创建style元素
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes slideDown {
        from {
          opacity: 0;
          transform: scaleY(0.9);
          max-height: 0;
        }
        to {
          opacity: 1;
          transform: scaleY(1);
          max-height: 200px;
        }
      }
      
      @keyframes slideUp {
        from {
          opacity: 1;
          transform: scaleY(1);
          max-height: 200px;
        }
        to {
          opacity: 0;
          transform: scaleY(0.9);
          max-height: 0;
        }
      }
      
      .animate-slideDown {
        animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      
      .comment-section-unmount {
        animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    `;
    
    // 添加到document
    document.head.appendChild(style);
    
    // 清理函数
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // 优化：简化点击外部关闭的逻辑
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // 如果点击不是来自回复按钮，且点击在回复框外部，则关闭回复框
      if (
        !replyButtonClickedRef.current && 
        replyContainerRef.current && 
        !replyContainerRef.current.contains(event.target as Node) && 
        replyToCommentId !== null
      ) {
        handleCancelReply();
      }
      // 重置点击状态
      replyButtonClickedRef.current = false;
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [replyToCommentId]);

  // 在页面任何地方点击时取消选中
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      // 如果点击的不是评论区域内部，取消待删除状态
      if (pendingDeleteCommentId !== null) {
        setPendingDeleteCommentId(null);
      }
    };
    
    // 添加到document而不是window，以便捕获所有点击
    document.addEventListener('click', handleGlobalClick);
    
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [pendingDeleteCommentId]);

  // --- 添加评论编辑的mutation ---
  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: number; content: string }) => {
      // 构造API URL
      let editUrl = '';
      if (targetType === 'article') {
        editUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/${commentId}`;
      } else if (targetType === 'post') {
        editUrl = `${API_BASE_URL}/api/posts/${targetId}/comments/${commentId}`;
      } else {
        throw new Error(`不支持的目标类型: ${targetType}`);
      }
      
      const response = await axios.put<Comment>(
        editUrl,
        { content: content.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    },
    onSuccess: (updatedComment) => {
      // 更新评论列表中的评论
      queryClient.setQueryData(commentsQueryKey, (oldData: Comment[] | undefined = []) => {
        const updateRecursively = (list: Comment[]): Comment[] => list.map(c => {
          if (c.id === updatedComment.id) {
            return { ...c, ...updatedComment };
          }
          if (c.replies && c.replies.length > 0) {
            return { ...c, replies: updateRecursively(c.replies) };
          }
          return c;
        });
        return updateRecursively(oldData);
      });
      
      setEditingCommentId(null);
      setEditContent('');
      setSubmittingEdit(false);
      toast.success('评论更新成功');
    },
    onError: (error) => {
      console.error('编辑评论失败:', error);
      toast.error('编辑评论失败，请重试');
      setSubmittingEdit(false);
    },
  });

  // --- 添加处理编辑评论的函数 ---
  const handleEditClick = (commentId: number, content: string) => {
    if (!authToken) {
      toast.warn("请先登录");
      return;
    }
    
    setEditingCommentId(commentId);
    setEditContent(content);
    
    // 使用requestAnimationFrame确保DOM更新后再聚焦
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
        }
      }, 100);
    });
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const handleSubmitEdit = (commentId: number) => {
    if (!editContent.trim()) {
      toast.warn("评论内容不能为空");
      return;
    }
    
    setSubmittingEdit(true);
    editCommentMutation.mutate({
      commentId,
      content: editContent
    });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
  };

  // --- Restore renderComment function definition ---
  const renderComment = (comment: Comment, depth = 0) => {
    const isRootComment = depth === 0;
    const displayName = comment.is_ai_generated 
                        ? (comment.user?.nickname || 'Lynn')
                        : (comment.user?.nickname || comment.user?.email?.split('@')[0] || '匿名用户');
    const isReplying = replyToCommentId === comment.id;
    const isEditing = editingCommentId === comment.id;
    const canDelete = currentUser && comment.user && currentUser.id === comment.user.id && !comment.is_deleted && !comment.is_ai_generated;
    // 判断当前用户是否可以编辑评论
    const canEdit = canDelete && !isEditing && !comment.is_deleted;
    // --- 新增：判断当前用户是否可以恢复评论 ---
    const canRestore = currentUser && comment.user && currentUser.id === comment.user.id && comment.is_deleted === true && !comment.is_ai_generated;
    const isLikedByCurrentUser = comment.is_liked_by_current_user;
    const currentLikeCount = comment.likes_count;
    const isDeleted = comment.is_deleted === true;
    const shouldHideReplies = collapsedComments[comment.id] === true;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const repliesCount = hasReplies ? countTotalComments(comment.replies) : 0;
    const isEdited = comment.is_edited === true;

    return (
      <div key={comment.id} 
           className={`comment-item ${depth > 0 ? 'ml-5 md:ml-6' : ''} py-3 relative`}>
         {/* 单条连接线 - 圆角实现曲线效果 */}
         {depth > 0 && (
            <div style={{
              position: 'absolute',
              left: '-18px',
              top: '-40px', // 适当的距离，不要太高
              width: '17px', // 稍微缩短一点，避免和头像重叠
              height: '55px',
              border: 'none',
              borderLeft: '1px solid rgba(0, 0, 0, 0.3)',
              borderBottom: '1px solid rgba(0, 0, 0, 0.3)',
              borderBottomLeftRadius: '15px', // 更大的圆角实现平滑曲线
            }}></div>
         )}
         
         <div className="flex items-start mb-1 user-info">
            <div className="flex-shrink-0" style={{minWidth: '24px'}}>
              <UserAvatar userId={comment.user?.id ?? undefined} 
                          username={displayName} 
                          avatar={comment.user?.avatar} 
                          size="sm" 
                          showName={false}
                          className=""
              />
            </div>
            <div className="flex-grow ml-3">
              <div className="flex items-baseline justify-between">
                <span className={`font-medium text-sm ${comment.is_ai_generated ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {displayName}
                </span>
                <span className="text-xs text-gray-500 pt-1 ml-auto">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: zhCN })}
                  {isEdited && <span className="ml-1 italic">(已编辑)</span>}
                </span>
              </div>
              
              {/* 使用一个固定布局的容器包裹评论内容，防止删除线导致位移 */}
              <div className="relative" style={{ minHeight: `${comment.content.length > 100 ? 'auto' : '1.5rem'}` }}>
                {isEditing ? (
                  <div className="mt-1">
                    <textarea
                      ref={editInputRef}
                      value={editContent}
                      onChange={handleEditChange}
                      rows={3}
                      className="w-full p-3 pr-10 pb-3 bg-gray-100 rounded-md text-sm text-gray-800 placeholder-gray-500 resize-none shadow-inner border-0 outline-none focus:ring-1 focus:ring-blue-500/50"
                      autoFocus
                    />
                    <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                      <button 
                        onClick={() => handleCancelEdit()}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded-md"
                        title="取消编辑"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => handleSubmitEdit(comment.id)}
                        disabled={submittingEdit || !editContent.trim()}
                        title="保存编辑"
                        className={`text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-200 p-1 rounded hover:bg-gray-200/50 ${submittingEdit ? 'animate-pulse' : ''}`}
                      >
                        {submittingEdit ? (
                          <FaSpinner className="animate-spin h-4 w-4" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 评论内容区，修改点击行为 */
                  <p 
                    style={{color: 'black'}} 
                    className="text-sm mt-1 whitespace-pre-wrap break-words inline-block"
                  >
                {comment.is_ai_generated ? (
                  <span className="text-purple-600 dark:text-purple-400">{comment.content}</span>
                ) : isDeleted ? (
                    // 已删除评论的显示，红色文字
                    <div className="flex items-center">
                      <span className="text-red-400">[该评论已删除]</span>
                      {/* 恢复按钮直接跟在后面 */}
                      {canRestore && (
                        <button 
                          onClick={() => handleRestoreComment(comment.id)}
                          className="flex items-center text-xs text-green-500 hover:text-green-600 transition-colors duration-200 ml-2"
                          disabled={restoreCommentMutation.isPending}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                          恢复
                        </button>
                      )}
                    </div>
                ) : (
                  <span style={{color: 'black'}}>{comment.content}</span>
                )}
              </p>
                )}
              </div>
              
              {/* 按钮组容器，完全删除左边距，确保与评论内容对齐 */}
              <div className="mt-0.5 flex items-center pl-0">
                {isDeleted ? (
                  // 已删除评论的操作栏 - 只保留折叠按钮，恢复按钮已移至上方内容区
                  <div className="flex items-center w-full pl-0 py-1">
                    {hasReplies && (
                      <button
                        onClick={(e) => toggleReplies(comment.id, e)}
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-0 px-0 focus:outline-none font-mono text-xs flex items-center ml-auto"
                        aria-label={shouldHideReplies ? '展开回复' : '收起回复'}>
                        {shouldHideReplies ? `[+${repliesCount}]` : '[-]'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center w-full pl-0">
                    {/* 所有按钮统一放在这里，折叠按钮放在最左侧，与评论内容首字符对齐 */}
                    {hasReplies && (
                      <button
                        onClick={(e) => toggleReplies(comment.id, e)}
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-0 px-0 focus:outline-none font-mono text-xs flex items-center justify-start mr-4 flex-shrink-0"
                        style={{marginLeft: 0, paddingLeft: 0}}
                        aria-label={shouldHideReplies ? '展开回复' : '收起回复'}>
                        {shouldHideReplies ? `[+${repliesCount}]` : '[-]'}
                      </button>
                    )}
                    
                    {/* 回复按钮 */}
                    <button onClick={() => handleReplyClick(comment.id, displayName)}
                      className={`text-xs ${isReplying ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'} flex items-center mr-4 flex-shrink-0`}
                      disabled={!authToken} title={!authToken ? "请先登录" : (isReplying ? "取消回复" : "回复")}>
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      </div>
                    </button>
                    
                    {/* 点赞按钮 - 完全统一结构，使用相对定位容器和绝对定位计数 */}
                    <button 
                      onClick={() => authToken ? (isLikedByCurrentUser ? handleUnlike(comment.id) : handleLike(comment.id)) : toast.warn('请先登录后点赞')}
                      className={`text-xs ${isLikedByCurrentUser ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-gray-700'} flex items-center mr-4 flex-shrink-0 relative`}
                      disabled={!authToken || toggleLikeMutation.isPending} 
                      title={!authToken ? "请先登录" : (isLikedByCurrentUser ? "取消点赞" : "点赞")}
                    >
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <Heart 
                          className="w-full h-full" 
                          stroke="currentColor" 
                          fill={isLikedByCurrentUser ? "#ef4444" : "none"} 
                          style={{color: isLikedByCurrentUser ? "#ef4444" : undefined}}
                        />
                        </div>
                      {currentLikeCount > 0 && (
                        <span className="absolute -right-3 -top-1 text-[10px] font-medium bg-gray-100 rounded-full px-1 min-w-[14px] text-center">
                          {currentLikeCount}
                        </span>
                      )}
                      </button>

                    {/* 添加编辑按钮 */}
                    {canEdit && (
                      <button 
                        onClick={() => handleEditClick(comment.id, comment.content)}
                        className="text-xs text-gray-500 hover:text-blue-600 flex items-center mr-4 flex-shrink-0"
                        title="编辑评论"
                      >
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          <EditOne 
                            className="w-full h-full" 
                            stroke="currentColor"
                          />
                    </div>
                      </button>
                    )}
                    
                    {/* 添加删除按钮 */}
                    {canDelete && (
                      <button 
                        onClick={() => handleDeleteCommentOrReply(comment.id)}
                        className="text-xs text-gray-500 hover:text-red-600 flex items-center mr-4 flex-shrink-0"
                        title="删除评论"
                      >
                        <div className="w-3.5 h-3.5 flex items-center justify-center">
                          <TrashTwo 
                            className="w-full h-full" 
                            stroke="currentColor"
                          />
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {/* 回复输入框 */}
              {replyToCommentId === comment.id && (
                <div 
                  ref={replyContainerRef}
                  className="relative w-full mt-3 animate-slideDown"
                  style={{
                    animation: 'slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    transformOrigin: 'top',
                  }}>
                  <textarea 
                    ref={replyInputRef} 
                    value={replyContent} 
                    onChange={handleReplyChange}
                    placeholder={`回复 ${replyTargetUser}...`} 
                    rows={2}
                    className="w-full p-3 pr-10 pb-3 bg-gray-100 rounded-md text-sm text-gray-800 placeholder-gray-500 resize-none h-16 shadow-inner border-0 outline-none focus:ring-1 focus:ring-blue-500/50"
                    autoFocus />
                  <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                    <button onClick={() => handleSubmitReply(comment.id)}
                      disabled={submittingReply || !replyContent.trim()} title="回复"
                      className={`text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-200 p-1 rounded hover:bg-gray-200/50 ${submittingReply ? 'animate-pulse' : ''}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l4-4m-4 4l4 4" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
         </div>
         
         {/* 回复容器 - 更好地隔离布局变化 */}
         {hasReplies && (
           <div className="relative mt-2 ml-6 transition-all duration-300 ease-in-out" 
               style={{ 
                 overflow: shouldHideReplies ? 'hidden' : 'visible',
                 maxHeight: shouldHideReplies ? '0' : '9999px',
                 opacity: shouldHideReplies ? 0 : 1,
                 marginTop: shouldHideReplies ? '0' : '0.5rem',
                 contain: 'paint layout style',
               }}>
             {/* 父评论的共享垂直线 */}
             {!shouldHideReplies && comment.replies.length > 0 && (
               <div className="comment-parent-line" style={{
                 height: '100%',
                 minHeight: '40px',
                 pointerEvents: 'none'
               }}></div>
             )}
             
             {!shouldHideReplies && (
               <div className="grid grid-cols-1 gap-y-2">
                 {comment.replies.map(reply => renderComment(reply, depth + 1))}
               </div>
             )}
           </div>
         )}
      </div>
    );
  };

  // --- 主渲染 ---
  return (
    <div className="mt-10 pt-6 border-t border-gray-300/50" ref={commentsContainerRef}>
       {/* --- 修改：评论区头部，包含评论总数、排序和操作按钮 --- */}
      <div className="flex justify-between items-center mb-6">
         {/* --- 修改：将评论图标和计数添加到按钮组 --- */}
         <div className="flex items-center space-x-3">
            {/* 点赞按钮 */}
            <button
              onClick={handleLikeToggle}
              className={`p-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition-colors duration-300
                ${isLiked ? 'text-red-500 hover:text-red-600 active:text-red-700' : 'text-gray-400 hover:text-gray-700 active:text-gray-900'}
                ${!token && 'opacity-50 cursor-not-allowed'}`}
              disabled={!token}
              title={!token ? "请先登录" : (isLiked ? '取消点赞' : '点赞')}
            >
              <Heart className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} stroke={isLiked ? 'currentColor' : 'currentColor'} />
              <span className="tabular-nums min-w-[24px] inline-block text-center">({likeCount})</span>
            </button>
            {/* 收藏按钮 */}
            <button
              onClick={handleCollectToggle}
              className={`p-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition-colors duration-300
                ${isCollected ? 'text-yellow-400 hover:text-yellow-300 active:text-yellow-500' : 'text-gray-400 hover:text-gray-200 active:text-gray-300'}
                ${!token && 'opacity-50 cursor-not-allowed'}`}
              disabled={!token}
              title={!token ? "请先登录" : (isCollected ? '取消收藏' : '收藏')}
            >
              <Pin className="h-4 w-4" fill={isCollected ? 'currentColor' : 'none'} stroke={isCollected ? 'currentColor' : 'currentColor'}/>
              <span className="tabular-nums min-w-[24px] inline-block text-center">({collectCount})</span>
            </button>
            {/* 分享按钮 */}
          <button
              onClick={handleShareClick}
              className={`p-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition-colors duration-300
                text-gray-400 hover:text-gray-200 active:text-gray-300
                ${!token && 'opacity-50 cursor-not-allowed'}`}
              disabled={!token}
              title={!token ? "请先登录" : "分享"}
            >
              <Share className="h-4 w-4" />
              <span className="tabular-nums min-w-[24px] inline-block text-center">({shareCount})</span>
          </button>
          {/* 评论图标和计数 */}
          <div className="flex items-center text-sm font-medium text-gray-600">
              {/* @ts-ignore */}
              <MessageSquare size={16} className="mr-1" />
              <span className="tabular-nums min-w-[24px] inline-block text-center">({countTotalComments(comments)})</span>
          </div>
         </div>
         {/* --- 结束新增操作按钮 --- */}

         {/* --- 修改：将排序按钮移回左侧 --- */}
         <div className="flex items-center space-x-2">
                <button
              onClick={(e) => handleSortChange(e, 'latest')}
              className={`px-4 py-1.5 rounded-full transition-colors text-xs font-medium ${ 
                sortBy === 'latest' 
                  ? 'bg-gray-200/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100'
                  : 'bg-transparent text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
                >
                  最新
                </button>
                <button
              onClick={(e) => handleSortChange(e, 'popular')}
              className={`px-4 py-1.5 rounded-full transition-colors text-xs font-medium ${ 
                sortBy === 'popular' 
                  ? 'bg-gray-200/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100'
                  : 'bg-transparent text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
                >
                  热门
                </button>
              </div>
         {/* --- 结束排序按钮修改 --- */}
      </div>
      {/* --- 结束修改 --- */}

      {/* 评论输入框 */}
      {token && currentUser && (
        <div className="mb-8 flex items-center space-x-2">
          <div className="relative flex-grow">
            <textarea 
              ref={commentInputRef}
              value={newComment} 
              onChange={handleCommentChange}
              onFocus={handleCommentFocus}
              onBlur={handleCommentBlur}
              className={`w-full px-4 py-3 pr-12 bg-gray-100/80 backdrop-blur-sm rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-black text-sm 
                resize-none placeholder-gray-500 shadow-inner
                transition-all duration-300 ease-in-out
                ${isCommentFocused || newComment.trim() ? 'h-24' : 'h-12'}`}
              rows={isCommentFocused || newComment.trim() ? 3 : 1}
              placeholder={isCommentFocused ? "" : "发表评论..."}
              disabled={submittingComment}
              onKeyDown={(e) => { 
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    handleSubmitComment();
                }
              }}
            />
            <div className={`absolute bottom-3 right-3 flex items-center space-x-2
                transition-opacity duration-300 ease-in-out
                ${isCommentFocused || newComment.trim() ? 'opacity-100' : 'opacity-0'}`}>
              <button
                onClick={handleSubmitComment}
                disabled={submittingComment || !newComment.trim() || submitCommentMutation.isPending}
                  className={`p-2 text-blue-600 hover:text-blue-500 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-blue-500 ${submittingComment ? 'animate-pulse' : ''}`}
                  title="提交评论 (Cmd/Ctrl+Enter)"
              >
                   {submitCommentMutation.isPending ? (
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                         <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l4-4m-4 4l4 4" />
                 </svg>
                )}
              </button>
            </div>
          </div>

          {/* 外部刷新按钮 (始终可见) */}
          <button
              onClick={handleRefreshComments}
              disabled={loadingComments}
              className="p-1.5 text-gray-600 hover:text-blue-600 active:text-blue-700 transition-colors duration-150 rounded-full hover:bg-gray-200/50 active:bg-gray-300/50 focus:outline-none flex-shrink-0"
              title="刷新评论"
          >
              {loadingComments ? (
                  <FaSpinner className="animate-spin h-4 w-4" />
              ) : (
                  <motion.div
                      key={`outer-input-refresh-${refreshAnimationKey}`}
                      initial={{ rotate: 0 }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.4, ease: "linear" }}
                      style={{ display: 'flex' }}
                  >
                      <FaSyncAlt className="h-4 w-4 block" strokeWidth={0.5} />
                  </motion.div>
              )}
          </button>
        </div>
      )}

      {/* Comment List */}
      {loadingComments && comments.length === 0 ? (
         <div className="text-center text-gray-500 py-8">加载评论中...</div>
      ) : isCommentError ? (
         <div className="text-center text-red-400 py-8">{commentError?.message || '加载评论失败'}</div>
      ) : comments.length > 0 ? (
        <div className="space-y-4 pb-8">
          {comments.map((comment) => {
            return renderComment(comment);
          })}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8">
          <p>暂无评论，来发表第一条评论吧</p>
        </div>
      )}
    </div>
  );
};

export default CommentSection; 