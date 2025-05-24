import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';
import QuotedDynamicView, { DynamicDetails } from './QuotedDynamicView';
import { toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaRegCommentDots, FaRetweet, FaHeart, FaRegHeart, FaBookmark, FaRegBookmark, FaPaperPlane, FaSpinner, FaReply, FaTrashAlt, FaArrowRight, FaImage } from 'react-icons/fa';
import { IoMdClose } from 'react-icons/io';
import { BsArrowReturnRight, BsTrash } from 'react-icons/bs';
import UserAvatar from './UserAvatar';
import ImageViewer from './ImageViewer';
import ShareDynamicModal from './ShareDynamicModal';

const formatCommentDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const generateTargetLink = (
    type: string | undefined,
    slug: string | null | undefined,
    id: number | null | undefined
): string | null => {
    if (type === 'post') {
        return slug ? `/posts/${slug}` : null;
    }
    if (type === 'article') {
        return slug ? `/article/${slug}` : null;
    }
    if (type === 'tool') {
        return slug ? `/tool/${slug}` : null;
    }
    return null;
};

const getImageUrl = (avatarUrl: string | null | undefined): string => {
    if (!avatarUrl) {
      return `https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff&size=40`;
    }
  
    let processedUrl = avatarUrl;
    const isCosUrl = avatarUrl.includes('cos.ap-shanghai.myqcloud.com');
    const isFullUrl = avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://');
    const isStaticPath = avatarUrl.startsWith('/static') || avatarUrl.startsWith('uploads/');
    const isFilenameOnly = !avatarUrl.includes('/');
  
    if (isFullUrl) {
      if (isCosUrl) {
         processedUrl = avatarUrl;
      } else {
        processedUrl = avatarUrl;
      }
    } else if (isStaticPath) {
      const urlParts = API_BASE_URL.split('/');
      const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
      const relativePath = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
      if (avatarUrl.startsWith('/static')) {
        processedUrl = `${baseUrlWithoutPath}${relativePath}`;
      } else {
        processedUrl = `${baseUrlWithoutPath}/static/${avatarUrl}`;
      }
    } else if (isFilenameOnly) {
      const urlParts = API_BASE_URL.split('/');
      const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
      processedUrl = `${baseUrlWithoutPath}/static/uploads/${avatarUrl}`;
    } 
    else {
      processedUrl = avatarUrl;
    }
  
    return processedUrl;
  };

interface User {
  id: number;
  email: string;
  nickname?: string | null;
}

interface CommentUser { 
  id: number;
  nickname: string | null;
  email: string | null;
  avatar?: string | null;
}

interface ActionCommentData {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
  action_id: number;
  parent_id: number | null;
  user: CommentUser | null;
  replies: ActionCommentData[];
  is_deleted: boolean;
  likes_count?: number;
  is_liked?: boolean;
}

interface DynamicDetailViewProps {
  dynamic: DynamicDetails | null;
  onClose: () => void;
  onRepostSuccess?: () => void;
  onInteractionChange?: (updatedDynamic: DynamicDetails) => void;
}

interface CommentItemProps {
  comment: ActionCommentData;
  currentUser: User | null;
  depth?: number;
  isLastReply?: boolean;
  token: string | null;
  replyToCommentId: number | null;
  setReplyToCommentId: (id: number | null) => void;
  replyContent: string;
  setReplyContent: (content: string) => void;
  handleReplySubmit: (parentId: number) => Promise<void>;
  submittingReply: boolean;
  formatCommentDate: (dateString: string) => string;
  handleDeleteComment: (commentId: number) => Promise<void>;
  forceExpandCommentId: number | null;
  handleLikeComment: (commentId: number, isLiked: boolean) => Promise<void>;
}

const CommentItem: React.FC<CommentItemProps> = ({ 
  comment,
  currentUser,
  depth = 0, 
  isLastReply = false,
  token,
  replyToCommentId,
  setReplyToCommentId,
  replyContent,
  setReplyContent,
  handleReplySubmit,
  submittingReply,
  formatCommentDate,
  handleDeleteComment,
  forceExpandCommentId,
  handleLikeComment
}) => {
  const userId = comment.user?.id;
  const userNickname = comment.user?.nickname;
  const userEmail = comment.user?.email;
  const userAvatar = comment.user?.avatar;
  const displayName = userNickname || userEmail?.split('@')[0] || '匿名用户';
  const indentStyle = { paddingLeft: `${depth * 1.5}rem` };
  const [isCollapsed, setIsCollapsed] = useState(depth >= 3);
  const isReplying = replyToCommentId === comment.id;
  const canDelete = currentUser && userId && currentUser.id === userId && !comment.is_deleted;
  const hasReplies = comment.replies && comment.replies.length > 0;
  const replyBoxRef = useRef<HTMLDivElement>(null);
  
  // 本地状态管理点赞状态
  const [localIsLiked, setLocalIsLiked] = useState(comment.is_liked || false);
  const [localLikesCount, setLocalLikesCount] = useState(comment.likes_count || 0);
  const [isLiking, setIsLiking] = useState(false);
  
  // 递归计算评论数，包含所有嵌套回复
  const countTotalReplies = (replies: ActionCommentData[] = []): number => {
    let total = replies.length;
    for (const reply of replies) {
      if (reply.replies && reply.replies.length > 0) {
        total += countTotalReplies(reply.replies);
      }
    }
    return total;
  };
  
  const totalRepliesCount = useMemo(() => 
    countTotalReplies(comment.replies || []),
    [comment.replies]
  );
  
  // 处理点赞按钮点击
  const onLikeClick = async () => {
    if (!token) {
      toast.info("请先登录后再点赞");
      return;
    }
    
    if (isLiking || comment.is_deleted) return;
    
    // 乐观更新UI
    setIsLiking(true);
    setLocalIsLiked(!localIsLiked);
    setLocalLikesCount(localIsLiked ? localLikesCount - 1 : localLikesCount + 1);
    
    try {
      await handleLikeComment(comment.id, localIsLiked);
    } catch (error) {
      // 发生错误时恢复之前的状态
      setLocalIsLiked(!localIsLiked);
      setLocalLikesCount(localIsLiked ? localLikesCount : localLikesCount - 1);
      toast.error("点赞操作失败，请稍后再试");
    } finally {
      setIsLiking(false);
    }
  };

  // 点击外部关闭回复框
  useEffect(() => {
    if (!isReplying) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (replyBoxRef.current && !replyBoxRef.current.contains(event.target as Node)) {
        setReplyToCommentId(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isReplying, setReplyToCommentId]);

  useEffect(() => {
    if (forceExpandCommentId === comment.id) {
      setIsCollapsed(false);
    }
  }, [forceExpandCommentId, comment.id]);
  
  // 同步外部点赞状态变化
  useEffect(() => {
    setLocalIsLiked(comment.is_liked || false);
    setLocalLikesCount(comment.likes_count || 0);
  }, [comment.is_liked, comment.likes_count]);

  return (
    <div className="relative pt-2 comment-item text-gray-200">
      {depth > 0 && (
        <div 
          className={`absolute left-0 top-0 w-0.5 bg-gray-500/50 ${isLastReply ? 'h-4' : 'h-full'}`} 
          style={{ left: `${(depth - 1) * 1.5 + 0.75}rem` }}>
        </div>
      )}
      {depth > 0 && (
         <div 
           className="absolute left-0 top-4 w-3 h-0.5 bg-gray-500/50" 
           style={{ left: `${(depth - 1) * 1.5 + 0.75}rem` }}>
         </div>
      )}
      
      <div style={indentStyle} className="comment-content-wrapper">
        <div className="flex items-start space-x-2 mb-1">
          
          {userId && (
            <UserAvatar 
              userId={userId} 
              username={displayName} 
              avatar={userAvatar} 
              size="sm"
              className="mr-3"
              showName={false}
            />
          )}
          {!userId && (
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full mr-3 flex items-center justify-center bg-gray-500 text-white text-xs">?</div>
              <span className="font-medium text-gray-300 text-sm">{displayName}</span>
            </div>
          )}
          <span className="text-gray-400 text-xs pt-1">{formatCommentDate(comment.created_at)}</span>
        </div>
        
        <div className={`pl-8 ${comment.is_deleted ? 'text-gray-500 italic' : 'text-gray-100'}`}>
            <p className={`text-sm whitespace-pre-wrap break-words mb-1.5`}>
            {comment.content}
            </p>
            
            {!comment.is_deleted && (
                <div className="flex items-center space-x-3 text-xs mt-1 text-gray-400">
                {hasReplies && (
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="text-xs text-blue-400 hover:text-blue-300 focus:outline-none flex items-center mr-1"
                    aria-label={isCollapsed ? '展开回复' : '收起回复'}
                    title={isCollapsed ? '展开回复' : '收起回复'}
                >
                    {isCollapsed 
                      ? <span>[+{totalRepliesCount}]</span> 
                      : <span>[-]</span>}
                </button>
                )}
                
                <button onClick={() => setReplyToCommentId(isReplying ? null : comment.id)} className={`flex items-center hover:text-blue-400 p-0.5 rounded ${isReplying ? 'text-blue-400' : ''}`} title={isReplying ? "取消回复" : "回复"}>
                  <BsArrowReturnRight />
                </button>
                
                <button onClick={onLikeClick} disabled={isLiking} className={`flex items-center p-0.5 rounded ${localIsLiked ? 'text-pink-500 hover:text-pink-400' : 'hover:text-pink-400'}`}>
                  {localIsLiked ? <FaHeart /> : <FaRegHeart />}
                  {localLikesCount > 0 && <span className="ml-1 text-xs">{localLikesCount}</span>}
                </button>
                  
                {canDelete && (
                    <button onClick={() => handleDeleteComment(comment.id)} className="flex items-center hover:text-red-400 p-0.5 rounded" title="删除评论">
                        <BsTrash />
                    </button>
                )}
                </div>
            )}
            
            {isReplying && (
                <div ref={replyBoxRef} className="mt-2 relative">
                <textarea 
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`回复 ${displayName}...`}
                  rows={2}
                  className="w-full px-2 py-1.5 pb-10 text-sm border border-gray-600/50 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-gray-700/70 backdrop-blur-sm text-gray-100 placeholder-gray-400"
                  autoFocus
                />
                    <button 
                      onClick={() => handleReplySubmit(comment.id)} 
                      disabled={!replyContent.trim() || submittingReply}
                  className={`absolute bottom-2 right-2 p-1.5 rounded-md text-white ${!replyContent.trim() || submittingReply ? 'text-gray-500 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 hover:bg-white/10'}`}
                  title="发送回复"
                    >
                  {submittingReply ? <FaSpinner className="animate-spin h-4 w-4" /> : <BsArrowReturnRight className="h-5 w-5" />}
                    </button>
                </div>
            )}
        </div>
      </div>

      {!isCollapsed && comment.replies && comment.replies.length > 0 && (
        <div className="replies-container mt-2">
          {comment.replies.map((reply, index) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              depth={depth + 1}
              isLastReply={index === comment.replies.length - 1}
              token={token}
              replyToCommentId={replyToCommentId}
              setReplyToCommentId={setReplyToCommentId}
              replyContent={replyContent}
              setReplyContent={setReplyContent}
              handleReplySubmit={handleReplySubmit}
              submittingReply={submittingReply}
              formatCommentDate={formatCommentDate}
              handleDeleteComment={handleDeleteComment}
              forceExpandCommentId={forceExpandCommentId}
              handleLikeComment={handleLikeComment}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DynamicDetailView: React.FC<DynamicDetailViewProps> = ({ dynamic, onClose, onRepostSuccess, onInteractionChange }) => {
  const { user: currentUser, token } = useAuth();
  const location = useLocation();
  const [comments, setComments] = useState<ActionCommentData[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [localIsLiked, setLocalIsLiked] = useState(dynamic?.is_liked_by_current_user || false);
  const [localLikesCount, setLocalLikesCount] = useState(dynamic?.likes_count || 0);
  const [localIsCollected, setLocalIsCollected] = useState(dynamic?.is_collected_by_current_user || false);
  const [localCollectsCount, setLocalCollectsCount] = useState(dynamic?.collects_count || 0);
  const [localRepostsCount, setLocalRepostsCount] = useState(dynamic?.reposts_count || 0);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [isRepostModalOpen, setIsRepostModalOpen] = useState(false);
  const [repostComment, setRepostComment] = useState('');
  const [submittingRepost, setSubmittingRepost] = useState(false);
  const [repostError, setRepostError] = useState<string | null>(null);
  const [forceExpandCommentId, setForceExpandCommentId] = useState<number | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  
  // 图片浏览器状态
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const sharerAvatarUrl = useMemo(() => getImageUrl(dynamic?.sharer_avatar_url), [dynamic?.sharer_avatar_url]);
  const sharerName = dynamic?.sharer_username || '未知用户';
  const sharerInitial = useMemo(() => (sharerName.charAt(0).toUpperCase() || 'U'), [sharerName]);

  const countTotalComments = useCallback((commentList: ActionCommentData[]): number => {
    let count = 0;
    for (const comment of commentList) {
      if (!comment.is_deleted) {
          count += 1;
          if (comment.replies && comment.replies.length > 0) {
             count += countTotalComments(comment.replies);
          }
      }
    }
    return count;
  }, []);

  const totalCommentCount = useMemo(() => countTotalComments(comments), [comments, countTotalComments]);

  const fetchComments = useCallback(async () => {
    if (dynamic?.action_id) {
      setLoadingComments(true);
      setCommentError(null);
      console.log(`[fetchComments] Fetching comments for action_id: ${dynamic.action_id}`);
      try {
        const response = await axios.get(`${API_BASE_URL}/api/actions/${dynamic.action_id}/comments`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        console.log("[fetchComments] API Response:", response);
        if (response.data && Array.isArray(response.data.comments)) {
          setComments(response.data.comments);
        } else {
          console.warn("[fetchComments] Invalid data structure received:", response.data);
          setComments([]);
          setCommentError("评论数据格式不正确。");
        }
      } catch (err: any) {
        console.error("获取分享评论失败 (fetchComments error):", err);
        if (axios.isAxiosError(err)) {
          console.error("Axios error details:", {
            message: err.message,
            responseStatus: err.response?.status,
            responseData: err.response?.data,
            requestConfig: err.config,
          });
          setCommentError(`无法加载评论 (${err.response?.status || 'Network Error'})。`);
        } else {
          console.error("Non-Axios error:", err);
          setCommentError("无法加载评论 (未知错误)。");
        }
        setComments([]);
      } finally {
        setLoadingComments(false);
      }
    } else {
        console.warn("[fetchComments] dynamic or action_id is missing, skipping fetch.");
        setComments([]);
        setLoadingComments(false);
    }
  }, [dynamic?.action_id, token]);

  const handleReplySubmit = useCallback(async (parentId: number) => {
    if (!dynamic?.action_id || !token || !replyContent.trim()) return;

    setSubmittingReply(true);
    setCommentError(null);
    setForceExpandCommentId(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/actions/${dynamic.action_id}/comments`, {
        content: replyContent.trim(),
        parent_id: parentId
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 201 && response.data) {
        const newReply = response.data as ActionCommentData;
        const addReplyRecursively = (currentComments: ActionCommentData[], pId: number, replyToAdd: ActionCommentData): ActionCommentData[] => {
           return currentComments.map(comment => {
              if (comment.id === pId) {
                 return { ...comment, replies: [replyToAdd, ...(comment.replies || [])] };
              } else if (comment.replies && comment.replies.length > 0) {
                 return { ...comment, replies: addReplyRecursively(comment.replies, pId, replyToAdd) };
              }
              return comment;
           });
        };
        setComments(prevComments => addReplyRecursively(prevComments, parentId, newReply));
        setReplyToCommentId(null);
        setReplyContent('');
        setForceExpandCommentId(parentId);
      } else {
        throw new Error(response.data?.error || '提交回复失败');
      }
    } catch (err: any) {
      console.error("提交回复失败:", err);
      setCommentError(err.message || "发表回复时出错，请稍后再试。");
    } finally {
      setSubmittingReply(false);
    }
  }, [dynamic?.action_id, token, replyContent, setComments, setReplyToCommentId, setReplyContent, setCommentError, setSubmittingReply, setForceExpandCommentId]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!token) {
      toast.error("请先登录");
      return;
    }
    if (!window.confirm("确定要删除这条评论吗？")) {
      return;
    }
    try {
      const response = await axios.delete(`${API_BASE_URL}/api/comments/${commentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 200 && response.data) {
        const updatedDataFromBackend = response.data as Partial<ActionCommentData>;

        const updateCommentState = (
          currentComments: ActionCommentData[],
          targetId: number,
          updates: Partial<ActionCommentData>
        ): ActionCommentData[] => {
          return currentComments.map(comment => {
            if (comment.id === targetId) {
              return {
                ...comment,
                is_deleted: true,
                content: updates.content || "[该评论已删除]",
              };
            } else if (comment.replies && comment.replies.length > 0) {
              return {
                ...comment,
                replies: updateCommentState(comment.replies, targetId, updates)
              };
            }
            return comment;
          });
        };

        setComments(prevComments => updateCommentState(prevComments, commentId, updatedDataFromBackend));
        toast.success("评论已删除");

      } else {
        throw new Error(response.data?.error || '删除评论时服务器返回意外响应');
      }
    } catch (err: any) {
      console.error("删除评论失败:", err);
      const errorMsg = err.response?.data?.error || err.message || '删除评论失败，请稍后再试。';
      toast.error(errorMsg);
    }
  }, [token, setComments]);

  useEffect(() => {
    if (!isRepostModalOpen) {
      // 重置状态
      const timer = setTimeout(() => {
        setRepostComment('');
        setRepostError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRepostModalOpen]);

  useEffect(() => {
    setLocalIsLiked(dynamic?.is_liked_by_current_user || false);
    setLocalLikesCount(dynamic?.likes_count || 0);
    setLocalIsCollected(dynamic?.is_collected_by_current_user || false);
    setLocalCollectsCount(dynamic?.collects_count || 0);
    setLocalRepostsCount(dynamic?.reposts_count || 0);
  }, [dynamic]);

  useEffect(() => {
    console.log(`Action ID changed or component mounted: ${dynamic?.action_id}. Fetching comments.`);
    fetchComments();
  }, [fetchComments, dynamic?.action_id]);

  if (!dynamic) {
    return (
      <div className="bg-white p-6 rounded-lg max-w-3xl w-full mx-auto text-center shadow-lg">
        <FaSpinner className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-4" />
        <p className="text-gray-500">正在加载动态详情...</p>
      </div>
    );
  }

  const renderComments = (commentList: ActionCommentData[]) => {
    if (!commentList || commentList.length === 0) {
      return <p className="text-center text-gray-500 text-sm py-4">暂无评论。</p>;
    }
    return (
      <div className="space-y-3">
        {commentList.map((comment, index) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUser={currentUser}
            depth={0}
            isLastReply={index === commentList.length - 1}
            token={token}
            replyToCommentId={replyToCommentId}
            setReplyToCommentId={setReplyToCommentId}
            replyContent={replyContent}
            setReplyContent={setReplyContent}
            handleReplySubmit={handleReplySubmit}
            submittingReply={submittingReply}
            formatCommentDate={formatCommentDate}
            handleDeleteComment={handleDeleteComment}
            forceExpandCommentId={forceExpandCommentId}
            handleLikeComment={handleLikeComment}
          />
        ))}
      </div>
    );
  }

  const handleCommentSubmit = async () => {
    if (!dynamic?.action_id || !token || !newComment.trim()) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/actions/${dynamic.action_id}/comments`, {
        content: newComment.trim(),
        parent_id: null
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 201 && response.data) {
        setComments(prevComments => [response.data, ...prevComments]);
        setNewComment('');
      } else {
        throw new Error(response.data?.error || '提交评论失败');
      }
    } catch (err: any) {
      console.error("提交评论失败:", err);
      setCommentError(err.message || "发表评论时出错，请稍后再试。");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleInteractionClick = async (interactionType: 'like' | 'collect') => {
    if (!token || !dynamic) {
      setInteractionError("请先登录再操作");
      return;
    }
    setInteractionError(null);
    const currentIsLiked = localIsLiked;
    const currentIsCollected = localIsCollected;
    const currentLikeActionId = dynamic.like_action_id;
    const currentCollectActionId = dynamic.collect_action_id;
    const targetDynamicId = dynamic.action_id;
    const originalLiked = localIsLiked;
    const originalLikesCount = localLikesCount;
    const originalCollected = localIsCollected;
    const originalCollectsCount = localCollectsCount;
    if (interactionType === 'like') {
      setLocalIsLiked(!currentIsLiked);
      setLocalLikesCount(currentIsLiked ? localLikesCount - 1 : localLikesCount + 1);
    } else {
      setLocalIsCollected(!currentIsCollected);
      setLocalCollectsCount(currentIsCollected ? localCollectsCount - 1 : localCollectsCount + 1);
    }
    try {
      let response: any;
      if (interactionType === 'like') {
        if (currentIsLiked && currentLikeActionId) {
          response = await axios.delete(`${API_BASE_URL}/api/actions/${currentLikeActionId}`, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          const payload = { action_type: 'like', target_type: 'action', target_id: targetDynamicId };
          response = await axios.post(`${API_BASE_URL}/api/actions`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      } else {
        if (currentIsCollected && currentCollectActionId) {
          response = await axios.delete(`${API_BASE_URL}/api/actions/${currentCollectActionId}`, { headers: { Authorization: `Bearer ${token}` } });
        } else {
          const payload = { action_type: 'collect', target_type: 'action', target_id: targetDynamicId };
          response = await axios.post(`${API_BASE_URL}/api/actions`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
      }
      const updatedDynamicData = { ...dynamic } as DynamicDetails;
      if (interactionType === 'like') {
          const success = currentIsLiked ? (response.status === 200 || response.status === 204) : ((response.status === 201 || response.status === 200) && response.data?.id);
          if (success) {
              updatedDynamicData.is_liked_by_current_user = !currentIsLiked;
              updatedDynamicData.likes_count = currentIsLiked ? (originalLikesCount - 1) : (originalLikesCount + 1);
              updatedDynamicData.like_action_id = currentIsLiked ? null : response.data.id;
          } else {
              throw new Error(response.data?.error || `点赞操作API失败，状态码: ${response.status}`);
          }
      } else {
          const success = currentIsCollected ? (response.status === 200 || response.status === 204) : ((response.status === 201 || response.status === 200) && response.data?.id);
          if (success) {
              updatedDynamicData.is_collected_by_current_user = !currentIsCollected;
              updatedDynamicData.collects_count = currentIsCollected ? (originalCollectsCount - 1) : (originalCollectsCount + 1);
              updatedDynamicData.collect_action_id = currentIsCollected ? null : response.data.id;
          } else {
              throw new Error(response.data?.error || `收藏操作API失败，状态码: ${response.status}`);
          }
      }
      onInteractionChange?.(updatedDynamicData);
      console.log(`${interactionType}操作成功，并通知父组件:`, updatedDynamicData);
    } catch (err: any) {
      console.error(`${interactionType}操作失败:`, err);
      setInteractionError(`操作失败: ${err.message || err.response?.data?.error || '请稍后重试'}`);
      if (interactionType === 'like') {
        setLocalIsLiked(originalLiked);
        setLocalLikesCount(originalLikesCount);
      } else {
        setLocalIsCollected(originalCollected);
        setLocalCollectsCount(originalCollectsCount);
      }
    }
  };

  const handleRepostClick = () => {
    if (!token) {
      toast.info("请先登录再进行转发。");
      return;
    }
    setIsRepostModalOpen(true);
  };

  const handleRepostSubmit = async (comment: string, images: string[] = []) => {
    if (!token || !dynamic?.action_id) {
      setRepostError("无法转发，缺少必要信息。");
      return;
    }
    setSubmittingRepost(true);
    setRepostError(null);
    try {
      const targetActionId = dynamic.action_id;
      const response = await axios.post(
        `${API_BASE_URL}/api/actions`, 
        {
          action_type: 'share',
          target_type: 'action',
          target_id: targetActionId,
          content: comment,
          images: images.length > 0 ? images : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsRepostModalOpen(false);
      setRepostComment('');
      setLocalRepostsCount(localRepostsCount + 1);
      onRepostSuccess?.();
      toast.success("分享成功！");
    } catch (err: any) {
      console.error("转发失败:", err);
      setRepostError(`转发失败: ${err.response?.data?.error || '请稍后重试'}`);
      return Promise.reject(err);
    } finally {
      setSubmittingRepost(false);
    }
  };

  // 处理评论点赞
  const handleLikeComment = async (commentId: number, isLiked: boolean) => {
    if (!token) {
      toast.info("请先登录");
      return;
    }

    try {
      if (isLiked) {
        // 取消点赞
        await axios.delete(`${API_BASE_URL}/api/comments/${commentId}/like?target_type=action`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        // 点赞
        await axios.post(`${API_BASE_URL}/api/comments/${commentId}/like?target_type=action`, {}, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }

      // 更新评论的点赞状态
      const updateCommentLikeStatus = (commentsList: ActionCommentData[]): ActionCommentData[] => {
        return commentsList.map(comment => {
          if (comment.id === commentId) {
            return {
              ...comment,
              is_liked: !isLiked,
              likes_count: isLiked ? (comment.likes_count || 1) - 1 : (comment.likes_count || 0) + 1
            };
          } 
          
          if (comment.replies && comment.replies.length > 0) {
            return {
              ...comment,
              replies: updateCommentLikeStatus(comment.replies)
            };
          }
          
          return comment;
        });
      };
      
      setComments(prev => updateCommentLikeStatus(prev));
      
    } catch (err: any) {
      console.error("评论点赞操作失败:", err);
      throw err;
    }
  };

  return (
    <div className="w-[1200px] max-w-[1200px] h-[90vh] flex flex-col md:flex-row gap-4 overflow-hidden">
      <div className="w-full md:w-7/12 flex flex-col h-full bg-gray-900/30 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg">
        <div className="flex items-center p-4 border-b border-white/5 flex-shrink-0 bg-black/15 backdrop-blur-lg">
           {dynamic.sharer_id ? (
             <Link 
               to={`/profile/${dynamic.sharer_id}`} 
               target="_blank" 
               rel="noopener noreferrer"
               className="flex items-center group"
             >
               <div className="relative w-10 h-10 mr-3 flex-shrink-0">
                 <img 
                   src={sharerAvatarUrl} 
                   alt={`${sharerName} avatar`}
                   className="w-10 h-10 rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
                   onError={(e) => {
                     const imgElement = e.target as HTMLImageElement;
                     imgElement.style.display = 'none';
                     const fallbackElement = imgElement.nextElementSibling as HTMLElement;
                     if (fallbackElement) fallbackElement.style.display = 'flex';
                   }}
                 />
                 <div 
                   className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-lg font-bold absolute top-0 left-0 text-gray-600"
                   style={{ display: 'none' }} 
                 >{sharerInitial}</div>
               </div>
               <div>
                 <span className="font-semibold text-gray-100 block leading-tight group-hover:text-blue-400 transition-colors">{sharerName}</span>
                 <span className="text-xs text-gray-400">发布于 {formatCommentDate(dynamic.shared_at)}</span>
               </div>
             </Link>
           ) : (
             <div className="flex items-center">
                <div className="relative w-10 h-10 mr-3 flex-shrink-0">
                 <img 
                   src={sharerAvatarUrl} 
                   alt={`${sharerName} avatar`}
                   className="w-10 h-10 rounded-full object-cover"
                   onError={(e) => {
                     const imgElement = e.target as HTMLImageElement;
                     imgElement.style.display = 'none';
                     const fallbackElement = imgElement.nextElementSibling as HTMLElement;
                     if (fallbackElement) fallbackElement.style.display = 'flex';
                   }}
                 />
                 <div 
                   className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-lg font-bold absolute top-0 left-0 text-gray-600"
                   style={{ display: 'none' }} 
                 >{sharerInitial}</div>
               </div>
               <div>
                 <span className="font-semibold text-gray-100 block leading-tight">{sharerName}</span>
                 <span className="text-xs text-gray-400">发布于 {formatCommentDate(dynamic.shared_at)}</span>
               </div>
             </div>
           )}
          <button 
            onClick={onClose}
            className="ml-auto text-gray-300 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"
            aria-label="关闭"
          ><IoMdClose size={22} /></button>
        </div>
          
        <div className="flex-grow overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          <div className="mb-4">
            {dynamic.share_comment && (
              <div className="text-white mb-3 break-words leading-relaxed markdown-content prose prose-invert prose-sm max-w-none [&>p]:text-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{dynamic.share_comment}</ReactMarkdown>
              </div>
            )}
            
            {dynamic.images && dynamic.images.length > 0 && (
              <div className="mt-2 mb-3 relative">
                {/* 图片浏览器区域，固定高度，限制最大高度 */}
                <div className={`image-gallery relative overflow-hidden rounded-lg ${dynamic.images?.length === 1 ? 'max-h-[350px]' : ''}`}>
                  {dynamic.images?.length === 1 ? (
                    // 单张图片显示逻辑
                    <div className="relative w-full h-full">
                      <img 
                        src={dynamic.images?.[0]} 
                        alt="分享图片" 
                        className="w-full h-full object-contain bg-black/20 cursor-pointer hover:opacity-95 transition-opacity rounded-lg"
                        onClick={() => {
                          setCurrentImageIndex(0);
                          setIsImageViewerOpen(true);
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/image-error.png';
                        }}
                      />
                      <div className="absolute bottom-0 right-0 p-1.5 bg-black/50 text-white text-xs rounded-tl-md backdrop-blur-sm">
                        点击查看大图
                      </div>
                    </div>
                  ) : (
                    // 多张图片九宫格显示
                    <div 
                      className={`grid gap-1 ${
                        dynamic.images?.length === 2 ? 'grid-cols-2' : 
                        dynamic.images?.length === 3 ? 'grid-cols-3' :
                        dynamic.images?.length === 4 ? 'grid-cols-2 grid-rows-2' :
                        dynamic.images?.length <= 6 ? 'grid-cols-3 grid-rows-2' :
                        'grid-cols-3 grid-rows-3'
                      }`}
                    >
                      {dynamic.images?.slice(0, 9).map((imageUrl, index) => (
                        <div 
                          key={index} 
                          className={`relative overflow-hidden rounded-md bg-black/10 ${
                            dynamic.images && dynamic.images.length <= 4 ? 'h-28' : 'h-24'
                          } ${
                            (dynamic.images && dynamic.images.length === 3 && index === 0) ? 'col-span-full row-span-1' : ''
                          }`}
                        >
                          <img 
                            src={imageUrl} 
                            alt={`分享图片 ${index + 1}`} 
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => {
                              setCurrentImageIndex(index);
                              setIsImageViewerOpen(true);
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/image-error.png';
                            }}
                          />
                          {index === 8 && dynamic.images && dynamic.images.length > 9 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white cursor-pointer"
                                 onClick={() => {
                                   setCurrentImageIndex(8);
                                   setIsImageViewerOpen(true);
                                 }}>
                              +{(dynamic.images?.length || 0) - 9}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {dynamic.original_action ? (
              <div className="mt-2 mb-3 px-4 text-white">
              <QuotedDynamicView dynamic={dynamic.original_action} />
              </div>
            ) : (
              (() => { 
                const targetLink = generateTargetLink(dynamic.target_type, dynamic.target_slug, dynamic.target_id);
                if (targetLink) {
                  return (
                    <div className="mt-2 p-3 bg-black/15 backdrop-blur-md rounded-lg border border-white/5">
                      <p className="text-xs text-gray-400 mb-1">分享的{dynamic.target_type === 'post' ? '帖子' : dynamic.target_type === 'article' ? '文章' : '工具'}:</p>
                      <Link to={targetLink} className="font-semibold text-blue-400 hover:underline" onClick={onClose}>{dynamic.target_title || '查看原文'}</Link>
                    </div>
                  );
                } else if (dynamic.target_type === 'deleted') {
                  return <div className="mt-2 p-3 bg-black/15 backdrop-blur-md rounded-lg border border-white/5 text-gray-500 italic">内容已被删除</div>;
                }
                return null;
              })()
            )}
          </div>
        </div>

        <div className="border-0 p-4 flex-shrink-0 bg-black/15 backdrop-blur-lg">
          <div className="flex justify-between items-center border-t border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-4">
              <button
                className="flex items-center gap-1 text-gray-300 hover:text-blue-400 transition"
                onClick={() => {
                  // Implement scroll to comments logic
                  const commentsSection = document.getElementById('comments-section');
                  if (commentsSection) {
                    commentsSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                <FaRegCommentDots className="text-lg" />
                <span className="text-sm">{totalCommentCount}</span>
              </button>
              
              <button
                className="flex items-center gap-1 text-gray-300 hover:text-green-400 transition"
                onClick={handleRepostClick}
              >
                <FaRetweet className="text-lg" />
                <span className="text-sm">{localRepostsCount}</span>
              </button>
              
              <button
                className={`flex items-center gap-1 transition ${localIsLiked ? 'text-pink-500' : 'text-gray-300 hover:text-pink-500'}`}
                onClick={() => handleInteractionClick('like')}
                disabled={!token}
              >
                {localIsLiked ? <FaHeart className="text-lg" /> : <FaRegHeart className="text-lg" />}
                <span className="text-sm">{localLikesCount}</span>
              </button>
              
              <button
                className={`flex items-center gap-1 transition ${localIsCollected ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}
                onClick={() => handleInteractionClick('collect')}
                disabled={!token}
              >
                {localIsCollected ? <FaBookmark className="text-lg" /> : <FaRegBookmark className="text-lg" />}
                <span className="text-sm">{localCollectsCount}</span>
              </button>
            </div>
          </div>
          {interactionError && <p className="text-red-400 text-xs text-center mt-2">{interactionError}</p>}
        </div>
      </div>

      <div className="w-full md:w-5/12 flex flex-col h-full bg-gray-900/30 backdrop-blur-xl rounded-2xl overflow-hidden shadow-lg">
        <div className="p-4 flex-shrink-0 bg-black/15 backdrop-blur-lg">
          <h3 className="text-lg font-semibold text-gray-100">评论 {totalCommentCount > 0 ? `(${totalCommentCount})` : ''}</h3>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent border-b-0">
           {loadingComments ? (
             <div className="text-center py-4"><FaSpinner className="animate-spin h-5 w-5 text-gray-400 mx-auto" /></div>
           ) : commentError ? (
             <p className="text-red-400 text-center">{commentError}</p>
           ) : comments.length === 0 ? (
             <p className="text-gray-400 text-center italic py-4">还没有评论，快来抢沙发吧！</p>
           ) : (
             renderComments(comments)
           )}
         </div>

        <div className="border-0 p-4 flex-shrink-0 bg-black/15 backdrop-blur-lg">
          {token ? (
            <div className="relative">
               <textarea
                ref={commentInputRef}
                className="w-full px-3 py-2 pb-14 bg-black/5 backdrop-blur-xl rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-100 text-sm h-20 resize-y border-none placeholder-gray-400 focus:ring-opacity-75"
                placeholder="分享你的看法..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleCommentSubmit(); }}
               />
               <div className="absolute bottom-4 right-3 flex items-center space-x-2">
               <button
                 onClick={handleCommentSubmit}
                 disabled={!newComment.trim() || submittingComment}
                   className="p-1.5 text-blue-400 hover:text-blue-300 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-7 h-7 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-black/15 focus:ring-blue-500 hover:bg-white/10"
                 title="提交评论 (Cmd/Ctrl+Enter)"
               >
                 {submittingComment ? <FaSpinner className="animate-spin h-4 w-4" /> : <BsArrowReturnRight className="h-5 w-5" />}
               </button>
               </div>
             </div>
          ) : (
             <div className="text-center text-sm text-gray-300">请 <Link to={`/login?redirect=${location.pathname}${location.search}`} className="text-blue-400 hover:underline">登录</Link> 后参与评论</div>
          )}
        </div>
      </div>

      <Modal isOpen={isRepostModalOpen} onClose={() => setIsRepostModalOpen(false)}>
        <ShareDynamicModal
          isOpen={isRepostModalOpen}
          onClose={() => setIsRepostModalOpen(false)}
          onSubmit={handleRepostSubmit}
          comment={repostComment}
          setComment={setRepostComment}
          error={repostError}
          isLoading={submittingRepost}
          dynamicToShare={dynamic}
          username={currentUser?.nickname || currentUser?.email?.split('@')[0] || '您'}
          altText={`转发 ${dynamic?.sharer_username || '用户'} 的动态`}
        />
      </Modal>

      {/* 图片浏览器 */}
      {dynamic.images && dynamic.images.length > 0 && (
        <ImageViewer
          images={dynamic.images}
          initialIndex={currentImageIndex}
          isOpen={isImageViewerOpen}
          onClose={() => setIsImageViewerOpen(false)}
        />
      )}
    </div>
  );
};

export default DynamicDetailView; 