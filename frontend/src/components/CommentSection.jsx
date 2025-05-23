import React, { useState, useEffect, useCallback, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import CommentItem from './CommentItem'; // 引入 CommentItem
import CommentForm from './CommentForm'; // 引入 CommentForm
import { FaSync } from 'react-icons/fa'; // 引入加载图标

// CommentSection 组件
const CommentSection = ({ targetType, targetId }) => {
    const [comments, setComments] = useState([]);
    const [sortBy, setSortBy] = useState('latest'); // 'latest' or 'popular'
    const [loadingComments, setLoadingComments] = useState(false);
    const [error, setError] = useState('');
    const { user, token } = useContext(AuthContext);

    // 获取评论数据的函数
    const fetchComments = useCallback(async () => {
        setLoadingComments(true);
        // setError(''); // 选择性清除旧错误
        try {
            const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
            const endpoint = targetType === 'article'
                ? `${apiBaseUrl}/articles/${targetId}/comments`
                : `${apiBaseUrl}/posts/${targetId}/comments`;
            
            const response = await axios.get(endpoint, {
                params: { sort_by: sortBy },
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setComments(response.data.comments || []); // 更新评论
        } catch (err) {
            console.error("Failed to fetch comments:", err);
            setError('无法加载评论，请稍后再试。');
            // setComments([]); // 出错时不清空评论，保留旧数据
        } finally {
            setLoadingComments(false);
        }
    }, [targetType, targetId, sortBy, token]);

    // 初始化加载和排序变化时重新加载
    useEffect(() => {
        if (targetId) {
            fetchComments();
        }
    }, [fetchComments, targetId]); // 依赖项包含 fetchComments

    // 处理评论提交
    const handleCommentSubmit = (newComment) => {
        // 将新评论添加到列表顶部 (模拟即时更新)
        setComments(prevComments => [newComment, ...prevComments]);
        // 可以选择在提交后重新获取最新列表，或者依赖乐观更新
        // fetchComments(); 
    };

    // 处理回复提交（添加到父评论的 replies 数组中）
    const handleReplySubmit = (reply, parentId) => {
        setComments(prevComments => 
            prevComments.map(comment => {
                if (comment.id === parentId) {
                    return {
                        ...comment,
                        replies: [...(comment.replies || []), reply]
                    };
                }
                return comment;
            })
        );
    };

    // 处理删除评论或回复
    const handleDeleteComment = (commentId, parentId = null) => {
        setComments(prevComments => {
            if (parentId) {
                // 删除回复
                return prevComments.map(comment => {
                    if (comment.id === parentId) {
                        return {
                            ...comment,
                            replies: (comment.replies || []).filter(reply => reply.id !== commentId)
                        };
                    }
                    return comment;
                });
            } else {
                // 删除顶级评论
                return prevComments.filter(comment => comment.id !== commentId);
            }
        });
    };

    // 处理点赞状态更新
    const handleLikeUpdate = (commentId, likeResult, parentId = null) => {
        setComments(prevComments => 
            prevComments.map(comment => {
                // 更新顶级评论
                if (!parentId && comment.id === commentId) {
                    return { 
                        ...comment, 
                        like_count: likeResult.like_count, 
                        is_liked_by_current_user: likeResult.is_liked_by_current_user 
                    };
                }
                // 更新回复
                if (parentId && comment.id === parentId) {
                    return {
                        ...comment,
                        replies: (comment.replies || []).map(reply => {
                            if (reply.id === commentId) {
                                return { 
                                    ...reply, 
                                    like_count: likeResult.like_count, 
                                    is_liked_by_current_user: likeResult.is_liked_by_current_user 
                                };
                            }
                            return reply;
                        })
                    };
                }
                return comment;
            })
        );
    };

    // 切换排序方式
    const handleSortChange = (newSortBy) => {
        if (newSortBy !== sortBy) {
            setSortBy(newSortBy);
            // fetchComments 会因为 useEffect 依赖 sortBy 而自动触发
        }
    };

    // --- 计算评论总数 (包括回复) ---
    const countTotalComments = (commentList) => {
      let count = 0;
      for (const comment of commentList) {
        count++; // 计算当前评论
        if (comment.replies && comment.replies.length > 0) {
          count += countTotalComments(comment.replies); // 递归计算回复
        }
      }
      return count;
    };
    const totalCommentCount = countTotalComments(comments);
    // --- 结束计算 ---

    return (
        <div className="mt-12">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-200">
                    评论 <span className="text-gray-400">({totalCommentCount})</span>
                </h3>
                <div className="relative flex items-center space-x-1 bg-black/10 backdrop-blur-md rounded-lg p-1">
                    <button 
                        onClick={() => handleSortChange('latest')}
                        className={`px-3 py-1 rounded-md text-sm transition-colors ${sortBy === 'latest' 
                            ? 'bg-white/20 text-white' 
                            : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
                    >
                        最新
                    </button>
                    <button 
                        onClick={() => handleSortChange('popular')}
                        className={`px-3 py-1 rounded-md text-sm transition-colors ${sortBy === 'popular' 
                            ? 'bg-white/20 text-white' 
                            : 'text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}
                    >
                        热门
                    </button>
                    {loadingComments && (
                        <div className="absolute -right-6 top-1/2 -translate-y-1/2">
                           <FaSync className="animate-spin text-gray-400" />
                        </div>
                    )}
                </div>
            </div>
            <div className="mb-8">
                {user && (
                    <CommentForm 
                        targetType={targetType} 
                        targetId={targetId} 
                        onSubmit={handleCommentSubmit} 
                    />
                )}
                {!user && (
                    <div className="text-center py-4 px-6 bg-black/10 backdrop-blur-sm rounded-lg">
                      <p className="text-gray-400">
                        请 <a href="/login" className="text-blue-400 hover:underline">登录</a> 后发表评论。
                      </p>
                    </div>
                )}
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                 <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            <div className="space-y-4 relative min-h-[100vh]">
                {loadingComments && (
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                        <FaSync className="animate-spin text-gray-400 text-3xl" /> 
                    </div>
                )}
                {comments.length > 0 ? (
                    comments.map(comment => (
                        <CommentItem 
                            key={comment.id} 
                            comment={comment} 
                            targetType={targetType}
                            targetId={targetId}
                            onReplySubmit={handleReplySubmit}
                            onDelete={handleDeleteComment}
                            onLikeUpdate={handleLikeUpdate} 
                        />
                    ))
                ) : (
                    !loadingComments && (
                      <div className="text-center py-10">
                         <p className="text-gray-500">还没有评论，快来抢占沙发吧~</p>
                      </div>
                    )
                )}
            </div>
        </div>
    );
};

export default CommentSection; 