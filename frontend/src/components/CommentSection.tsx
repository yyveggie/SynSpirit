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
import { FaHeart, FaRegHeart, FaSpinner, FaReply, FaTrashAlt, FaSyncAlt } from 'react-icons/fa';
import { BsArrowReturnRight, BsTrash } from 'react-icons/bs';
import { motion } from 'framer-motion';

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
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const { token: authToken, user: currentUserFromAuth } = useAuth();
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
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

  const handleDeleteCommentOrReply = (commentId: number) => {
    if (!authToken) {
      toast.error("请先登录。");
      return;
    }
    if (!window.confirm('确定要删除这条评论吗？其下的回复将保留，但此评论内容会消失。')) {
      return;
    }
    deleteCommentMutation.mutate({ commentId });
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
    if (replyToCommentId === commentId) {
      setReplyToCommentId(null);
      setReplyTargetUser('');
      setReplyContent('');
    } else {
      if (replyToCommentId !== null) {
        setReplyToCommentId(null);
        setReplyTargetUser('');
        setReplyContent('');
        setTimeout(() => {
      setReplyToCommentId(commentId);
      setReplyTargetUser(targetUsername);
      setReplyContent('');
          setTimeout(() => { replyInputRef.current?.focus(); }, 10);
        }, 10);
      } else {
        setReplyToCommentId(commentId);
        setReplyTargetUser(targetUsername);
        setReplyContent('');
        setTimeout(() => { replyInputRef.current?.focus(); }, 10);
      }
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

  // --- Restore renderComment function definition ---
  const renderComment = (comment: Comment, depth = 0) => {
    const isRootComment = depth === 0;
    const displayName = comment.is_ai_generated 
                        ? (comment.user?.nickname || 'Lynn')
                        : (comment.user?.nickname || comment.user?.email?.split('@')[0] || '匿名用户');
    const isReplying = replyToCommentId === comment.id;
    const canDelete = currentUser && comment.user && currentUser.id === comment.user.id && !comment.is_deleted && !comment.is_ai_generated;
    const isLikedByCurrentUser = comment.is_liked_by_current_user;
    const currentLikeCount = comment.likes_count;
    const isDeleted = comment.is_deleted === true;
    const shouldHideReplies = collapsedComments[comment.id] === true;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const repliesCount = hasReplies ? countTotalComments(comment.replies) : 0;

    return (
      <div key={comment.id} className={`comment-item ${depth > 0 ? 'ml-4 md:ml-6' : ''} py-3 relative`}>
         {depth > 0 && (
            <div className="absolute left-0 top-0 bottom-0 w-px bg-white/50 -ml-3 md:-ml-4"
              style={{ top: '1.5rem', bottom: '0.5rem' }}></div>
         )}
         <div className="flex items-start space-x-2 mb-1 user-info">
            {/* 修复：确保折叠/展开按钮对所有有回复的评论都显示，不仅限于嵌套回复 */}
            {hasReplies && (
                <button
                    onClick={(e) => toggleReplies(comment.id, e)}
                    className="text-gray-400 hover:text-white py-0 px-0.5 focus:outline-none font-mono text-xs flex items-center justify-center flex-shrink-0 mr-1"
                    style={{ 
                      marginLeft: depth > 0 ? '-2rem' : '0', 
                      width: '2rem', 
                      textAlign: 'center',
                      minWidth: '2rem'
                    }}
                    aria-label={shouldHideReplies ? '展开回复' : '收起回复'}>
                    {shouldHideReplies ? `[+${repliesCount}]` : '[-]'}
                </button>
            )}
            <UserAvatar userId={comment.user?.id ?? undefined} 
                        username={displayName} 
                        avatar={comment.user?.avatar} 
                        size="sm" 
                        showName={false}
            />
            <div className="flex-grow flex items-baseline justify-between ml-2">
                <span className={`font-medium text-sm ${comment.is_ai_generated ? 'text-purple-400' : (comment.user ? 'text-gray-100' : 'text-gray-400')}`}>
                  {displayName}
                </span>
            <span className="text-xs text-gray-400 pt-1 ml-auto">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: zhCN })}
                </span>
         </div>
         </div>
         <div className={`${depth > 0 ? 'pl-8' : 'pl-0'}`}> 
            <p className={`text-sm mt-1 whitespace-pre-wrap break-words ${isDeleted ? 'text-blue-400 italic' : 'text-gray-300'}`}>
              {comment.content}
            </p>
            <div className="mt-2 flex items-center space-x-4">
                {!isDeleted && (
                    <>
                        <button onClick={() => handleReplyClick(comment.id, displayName)}
                  className={`text-xs ${isReplying ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400'} flex items-center`}
                            disabled={!authToken} title={!authToken ? "请先登录" : (isReplying ? "取消回复" : "回复")}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </button>
                         <button onClick={() => authToken ? (isLikedByCurrentUser ? handleUnlike(comment.id) : handleLike(comment.id)) : toast.warn('请先登录后点赞')}
                            className={`text-xs flex items-center transition-colors duration-200 ${isLikedByCurrentUser ? 'text-pink-500 hover:text-pink-400' : 'text-gray-400 hover:text-pink-400'}`}
                            disabled={!authToken || toggleLikeMutation.isPending} title={!authToken ? "请先登录" : (isLikedByCurrentUser ? "取消点赞" : "点赞")}>
                            {isLikedByCurrentUser ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
                    ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                    )}
                            {/* 修改：为点赞数添加固定宽度布局 */}
                            <span className="tabular-nums" style={{ display: 'inline-block', minWidth: '1rem', textAlign: 'left', marginLeft: '0.125rem' }}>
                              {currentLikeCount > 0 ? currentLikeCount : ''}
                            </span>
                 </button>
                {canDelete && (
                          <button onClick={() => handleDeleteCommentOrReply(comment.id)}
                              className="text-xs text-gray-400 hover:text-red-400 flex items-center" title="删除评论">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </button>
                        )}
                    </>
                )}
              </div>
              {replyToCommentId === comment.id && (
                <div className="relative w-full mt-3">
                   <textarea ref={replyInputRef} value={replyContent} onChange={handleReplyChange}
                    placeholder={`回复 ${replyTargetUser}...`} rows={2}
                    className="w-full p-3 pr-10 pb-3 bg-gray-800/90 rounded-md text-sm text-white placeholder-gray-400 resize-none h-16 shadow-inner border-0 outline-none"
                    autoFocus />
                  <div className="absolute bottom-2 right-2 flex items-center space-x-2">
                     <button onClick={() => handleSubmitReply(comment.id)}
                       disabled={submittingReply || !replyContent.trim()} title="回复"
                       className={`text-white hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200 p-1 rounded hover:bg-gray-700/50 ${submittingReply ? 'animate-pulse' : ''}`}>
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l4-4m-4 4l4 4" /></svg>
                     </button>
                   </div>
                     </div>
                   )}
                </div>
         {hasReplies && !shouldHideReplies && (
             <div className="replies-container relative mt-2 space-y-3 ml-8">
             {comment.replies.map(reply => renderComment(reply, depth + 1))}
           </div>
         )}
      </div>
    );
  };

  // --- 主渲染 ---
  return (
    <div className="mt-10 pt-6 border-t border-gray-700/50" ref={commentsContainerRef}>
       {/* --- 修改：评论区头部，包含评论总数、排序和操作按钮 --- */}
      <div className="flex justify-between items-center mb-6">
         {/* --- 修改：将评论图标和计数添加到按钮组 --- */}
         <div className="flex items-center space-x-3">
            {/* 评论图标和计数 */}
            <div className="flex items-center text-gray-400 text-sm">
                {/* @ts-ignore */}
                <MessageSquare size={16} className="mr-1" />
                <span className="tabular-nums">({countTotalComments(comments)})</span>
            </div>
            {/* 点赞按钮 */}
            <button
              onClick={handleLikeToggle}
              className={`p-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition-colors duration-300 
                ${isLiked ? 'text-pink-400 hover:text-pink-300 active:text-pink-500' : 'text-gray-400 hover:text-gray-200 active:text-gray-300'} 
                ${!token && 'opacity-50 cursor-not-allowed'}`}
              disabled={!token}
              title={!token ? "请先登录" : (isLiked ? '取消点赞' : '点赞')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              <span className="tabular-nums">({likeCount})</span>
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
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-3.5L5 18V4z" />
              </svg>
              <span className="tabular-nums">({collectCount})</span>
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
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
              {shareCount > 0 && <span className="tabular-nums">({shareCount})</span>}
          </button>
         </div>
         {/* --- 结束新增操作按钮 --- */}

         {/* --- 修改：将排序按钮移回左侧 --- */}
         <div className="flex items-center space-x-2">
                <button
              onClick={(e) => handleSortChange(e, 'latest')}
              className={`px-4 py-1.5 rounded-full border transition-colors text-xs font-medium ${ 
                sortBy === 'latest' 
                  ? 'bg-gray-700/50 border-gray-500 text-gray-300'
                  : 'bg-transparent border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300'
              }`}
                >
                  最新
                </button>
                <button
              onClick={(e) => handleSortChange(e, 'popular')}
              className={`px-4 py-1.5 rounded-full border transition-colors text-xs font-medium ${ 
                sortBy === 'popular' 
                  ? 'bg-gray-700/50 border-gray-500 text-gray-300'
                  : 'bg-transparent border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300'
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
              className={`w-full px-4 py-3 pr-12 bg-gray-800/80 backdrop-blur-sm rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white text-sm 
                resize-none placeholder-gray-400 shadow-inner
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
                  className={`p-2 text-blue-400 hover:text-blue-300 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 ${submittingComment ? 'animate-pulse' : ''}`}
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
              className="p-1.5 text-gray-400 hover:text-blue-300 active:text-blue-500 transition-colors duration-150 rounded-full hover:bg-gray-700/30 active:bg-gray-600/30 focus:outline-none flex-shrink-0"
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
                      <FaSyncAlt className="h-4 w-4 block" />
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