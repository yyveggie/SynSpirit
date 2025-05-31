/**
 * SimpleCommentSection.tsx
 * 
 * 高性能轻量级评论组件，支持文章/帖子评论显示和交互
 * 
 * 主要功能:
 * - 获取并显示特定文章的评论列表（支持嵌套回复）
 * - 支持下拉加载更多评论（虚拟化滚动优化）
 * - 支持添加新评论
 * - 完全透明背景，与内容卡片集成
 * - 支持评论点赞功能
 * - 自动处理动态栏位移交互
 * - 性能优化：仅在可见时渲染，避免不必要的计算
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import UserAvatar from './UserAvatar';
import { useQueryClient, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { Link } from 'react-router-dom';
import { MdSend, MdClose } from 'react-icons/md';
import TextWithLinks from './TextWithLinks';
import LoadingSpinner from './LoadingSpinner';

// --- 接口定义 ---
interface UserInfo {
  id: number;
  nickname?: string | null;
  email?: string;
  avatar?: string | null;
}

interface Comment {
  id: number;
  content: string;
  created_at: string;
  post_id?: number;
  article_id?: number;
  user_id: number | null;
  parent_id: number | null;
  user: UserInfo | null;
  likes_count: number;
  is_liked_by_current_user: boolean;
  is_deleted?: boolean;
  is_edited?: boolean;
  replies?: Comment[];
  is_ai_generated?: boolean;
}

interface CommentsResponse {
  comments: Comment[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
}

interface SimpleCommentSectionProps {
  targetId: number;
  targetType: 'article' | 'post';
  slug?: string;
  token: string | null;
  currentUser: UserInfo | null;
  onClose: () => void;
  isVisible: boolean; // 添加可见性属性
}

// --- API 获取评论函数（支持分页）---
const fetchCommentsAPI = async ({ 
  targetId,
  targetType,
  token, 
  cursor = "", 
  limit = 10 
}: { 
  targetId: number;
  targetType: 'article' | 'post';
  token: string | null; 
  cursor?: string; 
  limit?: number;
}): Promise<CommentsResponse> => {
  let apiUrl = '';
  if (targetType === 'article') {
    apiUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments/tree`;
  } else if (targetType === 'post') {
    apiUrl = `${API_BASE_URL}/api/posts/${targetId}/comments`;
  } else {
    console.error(`[SimpleCommentSection] 不支持的目标类型: ${targetType}`);
    return Promise.reject(new Error(`不支持的目标类型: ${targetType}`));
  }
  
  try {
    const response = await axios.get<any>(apiUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    
    let comments;
    let total = 0;
    let has_more = false;
    let next_cursor = undefined;
    
    // 处理不同API的响应格式
    if (targetType === 'article') {
      comments = response.data || [];
      total = comments.length;
    } else if (targetType === 'post') {
      comments = response.data.comments || [];
      total = comments.length;
    }
    
    return {
      comments,
      total,
      has_more,
      next_cursor
    };
  } catch (error) {
    console.error(`[SimpleCommentSection] 获取${targetType}(ID:${targetId})的评论失败:`, error);
    throw error;
  }
};

// 使用 memo 优化单条评论组件，避免不必要的重渲染
const CommentItem = memo(({ 
  comment, 
  level, 
  handleLikeComment, 
  isLoggedIn,
}: { 
  comment: Comment; 
  level: number; 
  handleLikeComment: (id: number, isLiked: boolean) => void;
  isLoggedIn: boolean;
}) => {
  const isDeleted = comment.is_deleted;
  const isAI = comment.user?.id === -1;
  const isEdited = comment.is_edited;
  
  // 计算左边距
  const getMarginLeft = (level: number) => {
    return level === 0 ? '' : `ml-${Math.min(level * 3, 9)}`;
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: zhCN
    });
  };
  
  const hasReplies = comment.replies && comment.replies.length > 0;
  
  // 时间样式 - 使用内联样式确保足够小
  const timeStyle = {
    fontSize: '0.6rem',
    color: '#4b5563',
    opacity: 0.8,
    marginLeft: '0.5rem'
  };
  
  return (
    <div className={`${level > 0 ? 'pt-1 pb-1' : 'py-2'} ${getMarginLeft(level)}`}>
      <div className="flex items-start">
        {!isDeleted ? (
          <Link to={`/profile/${comment.user?.id || 0}`} className="flex-shrink-0 mr-3">
            <UserAvatar 
              userId={comment.user?.id}
              username={comment.user?.nickname || '匿名用户'}
              avatar={comment.user?.avatar}
              size="sm" 
              className={level > 0 ? "w-5 h-5" : "w-6 h-6"}
              showName={false}
            />
          </Link>
        ) : (
          <div className={`flex-shrink-0 mr-3 ${level > 0 ? "w-5 h-5" : "w-6 h-6"} bg-gray-200 rounded-full flex items-center justify-center`}>
            <span className="text-gray-500 text-xs">?</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          {!isDeleted ? (
            <>
              <div className="flex items-center mb-0.5">
                <Link 
                  to={`/profile/${comment.user?.id || 0}`}
                  className={`font-medium ${isAI ? 'text-purple-700 hover:text-purple-900' : 'text-blue-700 hover:text-blue-900'} text-xs`}
                >
                  {comment.user?.nickname || '匿名用户'}
                </Link>
                <span style={timeStyle}>
                  {formatDate(comment.created_at)}
                </span>
                {isEdited && (
                  <span className="ml-1 text-xs text-gray-500 italic">(已编辑)</span>
                )}
              </div>
              <div className="text-xs text-gray-900 break-words">
                <TextWithLinks text={comment.content} />
              </div>
              <div className="mt-1 text-xs text-gray-500 flex items-center">
                <button 
                  onClick={() => handleLikeComment(comment.id, comment.is_liked_by_current_user)}
                  disabled={!isLoggedIn}
                  className={`flex items-center space-x-1 ${
                    comment.is_liked_by_current_user 
                      ? 'text-red-500' 
                      : 'text-gray-500 hover:text-red-400'
                  } transition-colors`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`${level > 0 ? 'h-3 w-3' : 'h-3 w-3'} mr-1`} fill={comment.is_liked_by_current_user ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                  <span>{comment.likes_count}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center mb-0.5">
                <span className="text-xs text-gray-500">已删除评论</span>
                <span style={timeStyle}>
                  {formatDate(comment.created_at)}
                </span>
              </div>
              <div className="text-xs text-gray-500 italic">
                [该评论已删除]
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* 递归渲染子评论 */}
      {hasReplies && (
        <div className="mt-1 pl-2 border-l border-gray-700/10">
          {comment.replies?.map(reply => (
            <CommentItem
              key={reply.id}
              comment={reply}
              level={level + 1}
              handleLikeComment={handleLikeComment}
              isLoggedIn={isLoggedIn}
            />
          ))}
        </div>
      )}
    </div>
  );
});

CommentItem.displayName = 'CommentItem';

// 评论区输入框组件
const CommentInput = memo(({ 
  isLoggedIn, 
  commentText, 
  setCommentText, 
  handleSubmitComment, 
  isLoading 
}: {
  isLoggedIn: boolean;
  commentText: string;
  setCommentText: (text: string) => void;
  handleSubmitComment: (e: React.FormEvent) => void;
  isLoading: boolean;
}) => {
  return (
    <div className="px-4 py-2" style={{ background: 'transparent' }}>
      {isLoggedIn ? (
        <form onSubmit={handleSubmitComment} className="relative">
          <textarea
            className="w-full p-2 bg-black/5 text-white rounded-lg placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 pr-10 resize-none backdrop-blur-sm"
            placeholder="写下你的评论..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !commentText.trim()}
            className="absolute bottom-2 right-2 text-gray-300 hover:text-blue-400 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-transparent"
            title="发送评论"
          >
            <MdSend size={20} />
          </button>
          {isLoading && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
            </div>
          )}
        </form>
      ) : (
        <div className="text-center p-2 bg-black/5 rounded-lg text-gray-300 backdrop-blur-sm">
          请 <Link to="/login" className="text-blue-400 hover:underline">登录</Link> 后发表评论
        </div>
      )}
    </div>
  );
});

CommentInput.displayName = 'CommentInput';

const SimpleCommentSection: React.FC<SimpleCommentSectionProps> = ({
  targetId,
  targetType,
  slug,
  token,
  currentUser,
  onClose,
  isVisible
}) => {
  const [commentText, setCommentText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const { token: authToken, user: authUser } = useAuth();
  const isLoggedIn = !!authToken;
  const commentListRef = useRef<HTMLDivElement>(null);
  const commentSectionRef = useRef<HTMLDivElement>(null);
  
  // 动态栏右移逻辑
  useEffect(() => {
    if (isVisible) {
      // 1. 通知系统评论区已打开
      window.dispatchEvent(new CustomEvent('comment-opened', {
        detail: { cardId: document.getElementById(commentSectionRef.current?.closest('[id]')?.id || '')?.id }
      }));
      
      // 2. 增加打开评论计数
      const currentCount = parseInt(document.body.dataset.openCommentsCount || '0', 10);
      document.body.dataset.openCommentsCount = (currentCount + 1).toString();
      
      // 3. 添加 .comments-open 类到 body，触发动态栏右移
      document.body.classList.add('comments-open');
    }
    
    return () => {
      if (isVisible) {
        // 1. 减少打开评论计数
        const currentCount = parseInt(document.body.dataset.openCommentsCount || '0', 10);
        const newCount = Math.max(0, currentCount - 1);
        document.body.dataset.openCommentsCount = newCount.toString();
        
        // 2. 如果没有打开的评论区，移除 .comments-open 类
        if (newCount === 0) {
          document.body.classList.remove('comments-open');
          
          // 通知系统所有评论已关闭
          window.dispatchEvent(new CustomEvent('all-comments-closed'));
          
          // 强制重置所有相关状态
          setTimeout(() => {
            // 再次确认移除 comments-open 类
            document.body.classList.remove('comments-open');
            
            // 重置全局状态
            delete document.body.dataset.lastCommentOpenTime;
            delete document.body.dataset.lastOpenCommentId;
            
            // 获取动态栏元素并重置其样式
            const dynamicFeed = document.getElementById('dynamic-feed');
            const dynamicFeedContainer = document.querySelector('.dynamic-feed-container');
            
            if (dynamicFeed) {
              dynamicFeed.classList.remove('force-reset');
              dynamicFeed.classList.remove('reset-transform');
              
              if (dynamicFeedContainer) {
                (dynamicFeedContainer as HTMLElement).classList.remove('reset-transform');
              }
            }
          }, 150); // 添加延迟确保DOM更新
        }
      }
    };
  }, [isVisible]);
  
  // 处理点击外部关闭逻辑
  useEffect(() => {
    if (!isVisible) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (commentSectionRef.current && !commentSectionRef.current.contains(event.target as Node)) {
        // 确保点击事件不是来自评论按钮
        const targetElement = event.target as HTMLElement;
        const isCommentButton = targetElement.closest('button')?.title?.includes('评论');
        
        if (!isCommentButton) {
          onClose();
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isVisible, onClose]);
  
  // 生成唯一查询键
  const commentsQueryKey = useMemo(() => 
    ['comments', targetType, targetId, 'infinite'],
    [targetType, targetId]
  );

  // 使用无限查询获取评论数据 - 只在可见时启用
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingComments,
    isError,
    error
  } = useInfiniteQuery<CommentsResponse, Error>({
    queryKey: commentsQueryKey,
    queryFn: ({ pageParam = "" }) => fetchCommentsAPI({ 
      targetId,
      targetType,
      token: authToken,
      cursor: pageParam as string,
      limit: 10
    }),
    getNextPageParam: (lastPage: CommentsResponse) => 
      lastPage.has_more ? lastPage.next_cursor : undefined,
    initialPageParam: "",
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    gcTime: 10 * 60 * 1000, // 10分钟后垃圾回收
    enabled: !!targetId && isVisible, // 只在组件可见且有targetId时启用查询
    refetchOnWindowFocus: false, // 禁止窗口聚焦时重新获取
    refetchOnMount: false, // 仅在第一次装载时获取一次
  });

  // 所有评论扁平化处理
  const comments = useMemo(() => {
    if (!data) return [];
    return data.pages.flatMap(page => page.comments);
  }, [data]);

  // 处理评论滚动和加载更多
  const handleScroll = useCallback(() => {
    if (!commentListRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = commentListRef.current;
    
    // 当滚动到距离底部100px时加载更多
    if (scrollHeight - scrollTop - clientHeight < 150 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // 添加手动加载更多的函数
  const loadMoreComments = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  
  // 监听滚动事件
  useEffect(() => {
    if (!isVisible) return;
    
    const commentList = commentListRef.current;
    if (commentList) {
      // 添加初始检查，处理容器高度不足以触发滚动的情况
      setTimeout(() => {
        const { scrollHeight, clientHeight } = commentList;
        if (scrollHeight <= clientHeight && hasNextPage) {
          fetchNextPage();
        }
      }, 300);
      
      // 增强滚动处理，允许滚动事件在到达底部时冒泡
      const handleEnhancedScroll = (event: WheelEvent) => {
        if (!commentList) return;
        
        const { scrollTop, scrollHeight, clientHeight } = commentList;
        const isAtBottom = scrollHeight - scrollTop - clientHeight <= 1;
        const isScrollingDown = event.deltaY > 0;
        
        // 当滚动到接近底部时加载更多
        if (scrollHeight - scrollTop - clientHeight < 150 && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
        
        // 如果已经滚动到底部且用户尝试继续向下滚动，则停止传播该事件
        // 这样浏览器默认行为会继续滚动外部容器
        if (isAtBottom && isScrollingDown) {
          // 不阻止事件传播，允许页面继续滚动
          return;
        } else {
          // 在其他情况下阻止事件传播，保持评论框内滚动
          event.stopPropagation();
        }
      };
      
      // 使用wheel事件代替scroll事件，以便更好地控制滚动行为
      commentList.addEventListener('wheel', handleEnhancedScroll, { passive: false });
      
      return () => {
        commentList.removeEventListener('wheel', handleEnhancedScroll);
      };
    }
  }, [handleScroll, hasNextPage, fetchNextPage, isVisible, isFetchingNextPage]);
  
  // 递归更新评论树中的评论状态
  const updateCommentInTree = useCallback((
    commentsToUpdate: Comment[], 
    targetId: number, 
    isCurrentlyLiked: boolean
  ): Comment[] => {
    return commentsToUpdate.map(comment => {
      if (comment.id === targetId) {
        return {
          ...comment,
          likes_count: isCurrentlyLiked ? comment.likes_count - 1 : comment.likes_count + 1,
          is_liked_by_current_user: !isCurrentlyLiked,
        };
      }
      if (comment.replies && comment.replies.length > 0) {
        const updatedReplies = updateCommentInTree(comment.replies, targetId, isCurrentlyLiked);
        if (updatedReplies !== comment.replies) {
          return {
            ...comment,
            replies: updatedReplies,
          };
        }
      }
      return comment;
    });
  }, []);

  // 提交评论的 Mutation
  const submitCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!authToken) throw new Error('需要登录才能评论');
      
      let postApiUrl = '';
      if (targetType === 'article') {
        postApiUrl = `${API_BASE_URL}/api/original-comments/articles/${targetId}/comments`;
      } else if (targetType === 'post') {
        postApiUrl = `${API_BASE_URL}/api/posts/${targetId}/comments`;
      } else {
        throw new Error(`不支持的目标类型: ${targetType}`);
      }

      const response = await axios.post<Comment>(
        postApiUrl,
        { content: content.trim() },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: commentsQueryKey});
      setCommentText('');
      toast.success('评论发表成功！');
    },
    onError: (err: Error) => {
      console.error("提交评论失败:", err);
      toast.error(err.message || '评论提交失败');
    },
    onSettled: () => {
      setIsLoading(false);
    }
  });

  // 点赞评论的 Mutation
  const likeCommentMutation = useMutation({
    mutationFn: async ({ commentId, isCurrentlyLiked }: { commentId: number, isCurrentlyLiked: boolean }) => {
      if (!authToken) throw new Error('需要登录才能点赞');
      
      let likeApiUrl = '';
      const method = isCurrentlyLiked ? 'delete' : 'post';
      
      if (targetType === 'article') {
        likeApiUrl = `${API_BASE_URL}/api/original-comments/comments/${commentId}/like`;
      } else if (targetType === 'post') {
        likeApiUrl = `${API_BASE_URL}/api/posts/post_comments/${commentId}/like`;
      } else {
        throw new Error(`不支持的目标类型: ${targetType}`);
      }
      
      await axios({
        method,
        url: likeApiUrl,
        headers: { Authorization: `Bearer ${authToken}` }
      });
      return { commentId, isCurrentlyLiked };
    },
    onMutate: async ({ commentId, isCurrentlyLiked }) => {
      // 乐观更新：立即更新UI，不等待API响应
      await queryClient.cancelQueries({queryKey: commentsQueryKey});
      
      const previousData = queryClient.getQueryData(commentsQueryKey);
      
      // 更新评论点赞状态
      queryClient.setQueryData(commentsQueryKey, (oldData: any) => {
        if (!oldData) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            comments: updateCommentInTree(page.comments, commentId, isCurrentlyLiked)
          }))
        };
      });
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      // 发生错误时回滚到之前的状态
      if (context?.previousData) {
        queryClient.setQueryData(commentsQueryKey, context.previousData);
      }
      console.error(`评论点赞操作失败 (${targetType}):`, err);
      toast.error('操作失败，请稍后重试');
    }
  });

  // 处理评论点赞
  const handleLikeComment = useCallback((commentId: number, isCurrentlyLiked: boolean) => {
    if (!authToken) {
      toast.warn("请先登录再操作");
      return;
    }
    likeCommentMutation.mutate({ commentId, isCurrentlyLiked });
  }, [authToken, likeCommentMutation]);

  // 提交评论
  const handleSubmitComment = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentText.trim()) {
      toast.warning('评论内容不能为空');
      return;
    }
    
    if (!isLoggedIn) {
      toast.warning('请先登录后再发表评论');
      return;
    }
    
    setIsLoading(true);
    submitCommentMutation.mutate(commentText);
  }, [commentText, isLoggedIn, submitCommentMutation]);

  // 渲染评论列表
  const renderComments = useCallback(() => {
    if (loadingComments && comments.length === 0) {
      return (
        <div className="flex justify-center items-center py-8">
          <LoadingSpinner />
        </div>
      );
    }
    
    if (comments.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          暂无评论，来发表第一条评论吧！
        </div>
      );
    }
    
    // 只渲染顶级评论，子评论通过递归处理
    const topLevelComments = comments.filter(comment => !comment.parent_id);
    
    return (
      <>
        {topLevelComments.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            level={0} 
            handleLikeComment={handleLikeComment}
            isLoggedIn={isLoggedIn}
          />
        ))}
        {hasNextPage && (
          <div className="py-3 text-center">
            <button 
              onClick={loadMoreComments}
              className="text-sm text-blue-400 hover:text-blue-300"
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? (
                <span className="flex items-center justify-center">
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">加载中...</span>
                </span>
              ) : '加载更多评论'}
            </button>
          </div>
        )}
      </>
    );
  }, [comments, loadingComments, hasNextPage, isFetchingNextPage, handleLikeComment, isLoggedIn, loadMoreComments]);

  // 如果组件不可见，不渲染任何内容
  if (!isVisible) return null;

  return (
    <div 
      className="h-full w-full flex flex-col overflow-hidden"
      ref={commentSectionRef}
      style={{background: 'transparent'}}
    >
      {/* 评论列表 - 确保可滚动 */}
      <div 
        ref={commentListRef}
        className="overflow-y-auto flex-1 custom-scrollbar"
        style={{
          padding: '0.75rem',
          height: 'calc(100% - 80px)', // 调整高度以适应删除顶部关闭按钮后的布局
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.1) transparent'
        }}
      >
        {renderComments()}
      </div>

      {/* 评论表单 */}
      <CommentInput
        isLoggedIn={isLoggedIn}
        commentText={commentText}
        setCommentText={setCommentText}
        handleSubmitComment={handleSubmitComment}
        isLoading={isLoading || submitCommentMutation.isPending}
      />
    </div>
  );
};

export default SimpleCommentSection; 