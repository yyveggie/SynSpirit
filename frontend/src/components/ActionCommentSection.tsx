import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import axios from 'axios';
import { API_BASE_URL, DEFAULT_AVATAR } from '../config';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { FaSpinner } from 'react-icons/fa';
import { BsArrowReturnRight } from 'react-icons/bs';
import UserAvatar from './UserAvatar';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQueryClient, useQuery, QueryKey } from '@tanstack/react-query';
import { Refresh, TrashTwo, Heart, EditOne } from '@mynaui/icons-react';

// --- 复用 DynamicDetailView 中的类型定义 (或单独定义) ---
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
    user_id: number | null;
    action_id: number;
    parent_id: number | null;
    user: CommentUser | null;
    replies: ActionCommentData[];
    is_deleted: boolean;
    likes_count?: number;
    is_liked?: boolean;
    is_ai_generated: boolean;
    is_edited?: boolean;
}

// --- 新增：定义 API 响应的顶层结构 ---
interface ActionCommentsApiResponse {
    comments: ActionCommentData[];
    // 如果 API 还返回其他如分页等信息，可以在此添加
}

// --- 修改 CommentItem Props (移除与 ArticleCard 相关的 props) ---
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
    scrollToCommentId?: number | null;
    onScrolledToComment?: () => void;
    editingCommentId: number | null;
    setEditingCommentId: (id: number | null) => void;
    editContent: string;
    setEditContent: (content: string) => void;
    handleEditSubmit: (commentId: number) => Promise<void>;
    submittingEdit: boolean;
}

// --- 复制 CommentItem 组件 (基本不变) ---
const CommentItem: React.FC<CommentItemProps> = memo(({ 
    comment, currentUser, depth = 0, isLastReply = false, token, replyToCommentId, 
    setReplyToCommentId, replyContent, setReplyContent, handleReplySubmit, 
    submittingReply, formatCommentDate, handleDeleteComment, forceExpandCommentId, handleLikeComment,
    scrollToCommentId, onScrolledToComment, editingCommentId, setEditingCommentId, editContent, setEditContent,
    handleEditSubmit, submittingEdit
}) => {
    // AI 评论的特殊处理
    const isAIReply = comment.is_ai_generated;
    const displayName = isAIReply 
                        ? (comment.user?.nickname || 'Lynn')
                        : (comment.user?.nickname || comment.user?.email?.split('@')[0] || '匿名用户');
    const userAvatar = isAIReply 
                        ? DEFAULT_AVATAR // 使用配置的AI头像
                        : comment.user?.avatar;
    const userIdForAvatar = isAIReply ? undefined : comment.user?.id; // AI 没有真实用户ID，或用特定值

    const indentStyle = { paddingLeft: `${depth * 1.5}rem` };
    const [isCollapsed, setIsCollapsed] = useState(depth >= 3); 
    const isReplying = replyToCommentId === comment.id;
    const isEditing = editingCommentId === comment.id;
    // 修改：AI评论不能被删除，也不能被编辑
    const canDelete = currentUser && comment.user && currentUser.id === comment.user.id && !comment.is_deleted && !isAIReply;
    const canEdit = canDelete && !isEditing && !comment.is_deleted;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const replyBoxRef = useRef<HTMLDivElement>(null);
    const editBoxRef = useRef<HTMLDivElement>(null);
    const commentItemRef = useRef<HTMLDivElement>(null);
    
    const [localIsLiked, setLocalIsLiked] = useState(comment.is_liked || false);
    const [localLikesCount, setLocalLikesCount] = useState(comment.likes_count || 0);
    const [isLiking, setIsLiking] = useState(false);
    const [isStyleReady, setIsStyleReady] = useState(false);
    
    const countTotalReplies = (replies: ActionCommentData[] = []): number => {
        let total = replies.length;
        for (const reply of replies) {
        if (reply.replies && reply.replies.length > 0) {
            total += countTotalReplies(reply.replies);
        }
        }
        return total;
    };
    const totalRepliesCount = useMemo(() => countTotalReplies(comment.replies || []), [comment.replies]);
    
    const onLikeClick = async () => {
        if (!token || isLiking || comment.is_deleted) return;
        setIsLiking(true);
        const originalLiked = localIsLiked;
        const originalCount = localLikesCount;
        setLocalIsLiked(!localIsLiked);
        setLocalLikesCount(localIsLiked ? localLikesCount - 1 : localLikesCount + 1);
        try {
            await handleLikeComment(comment.id, originalLiked);
        } catch (error) {
            setLocalIsLiked(originalLiked);
            setLocalLikesCount(originalCount);
            toast.error("点赞失败");
        } finally {
            setIsLiking(false);
        }
    };

    // 处理点击编辑按钮
    const onEditClick = () => {
        if (!canEdit) return;
        setEditingCommentId(comment.id);
        setEditContent(comment.content);
    };

    useEffect(() => {
        if (!isReplying) return;
        const handleClickOutside = (event: MouseEvent) => {
        if (replyBoxRef.current && !replyBoxRef.current.contains(event.target as Node)) {
            setReplyToCommentId(null);
            setReplyContent(''); // 清除回复内容
        }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isReplying, setReplyToCommentId, setReplyContent]); // 添加 setReplyContent 到依赖数组

    // 添加对编辑框的点击外部处理
    useEffect(() => {
        if (!isEditing) return;
        const handleClickOutside = (event: MouseEvent) => {
        if (editBoxRef.current && !editBoxRef.current.contains(event.target as Node)) {
            setEditingCommentId(null);
            setEditContent(''); // 清除编辑内容
        }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isEditing, setEditingCommentId, setEditContent]);

    useEffect(() => {
        if (forceExpandCommentId === comment.id) {
            setIsCollapsed(false);
        }
    }, [forceExpandCommentId, comment.id]);
    
    useEffect(() => {
        setLocalIsLiked(comment.is_liked || false);
        setLocalLikesCount(comment.likes_count || 0);
    }, [comment.is_liked, comment.likes_count]);

    useEffect(() => {
        setIsStyleReady(true);
    }, []);

    useEffect(() => {
        // 当回复框打开时，滚动到回复框使其可见
        if (isReplying && replyBoxRef.current) {
            replyBoxRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isReplying]);

    // 当编辑框打开时，滚动到编辑框使其可见
    useEffect(() => {
        if (isEditing && editBoxRef.current) {
            editBoxRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isEditing]);

    useEffect(() => {
        // 如果当前评论是指定要滚动到的评论
        if (comment.id === scrollToCommentId && commentItemRef.current) {
            commentItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            onScrolledToComment?.(); // 通知父组件已滚动，可以重置 scrollToCommentId
        }
    }, [comment.id, scrollToCommentId, onScrolledToComment, commentItemRef]);

    // --- JSX (基本复用，移除连接线逻辑，简化样式) ---
    return (
        <div 
            ref={commentItemRef}
            className="comment-item text-gray-200" 
            style={{ opacity: isStyleReady ? 1 : 0, transition: 'opacity 0.15s ease-in-out' }}
        >
            {/* 移除连接线 div */} 
            <div style={indentStyle} className="comment-content-wrapper">
                <div className="flex items-center mb-1">
                    <UserAvatar userId={userIdForAvatar} username={displayName} avatar={userAvatar} size="sm" showName={false} className="mr-3"/>
                    <span className={`text-sm font-medium ${isAIReply ? 'text-purple-700' : (comment.user ? 'text-gray-900' : 'text-gray-500')}`}>
                        {displayName}
                    </span>
                    <span className="text-gray-500 text-xs pt-0.5 ml-auto">
                        {formatCommentDate(comment.created_at)}
                        {comment.is_edited && <span className="ml-1 italic">(已编辑)</span>}
                    </span>
                </div>
                <div className={`pl-8 ${hasReplies && isCollapsed ? 'pb-0' : (depth > 0 ? 'pb-1' : 'pb-1') }`}>
                    {isEditing ? (
                        <div ref={editBoxRef} className="mt-1">
                            <textarea 
                                value={editContent} 
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={3}
                                className="w-full px-2 py-1.5 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-gray-100 text-gray-900 placeholder-gray-500"
                                autoFocus
                            />
                            <div className="flex justify-end mt-1 space-x-2">
                                <button 
                                    onClick={() => setEditingCommentId(null)} 
                                    className="text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-200"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={() => handleEditSubmit(comment.id)}
                                    disabled={!editContent.trim() || submittingEdit}
                                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:text-gray-500"
                                >
                                    {submittingEdit ? <FaSpinner className="animate-spin h-3 w-3 inline mr-1" /> : null}
                                    保存
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className={`text-sm whitespace-pre-wrap break-words mb-1.5 ${comment.is_deleted ? 'text-gray-500 italic' : (isAIReply ? 'text-purple-800' : 'text-gray-900')}`}>{comment.content}</p>
                    )}
                    {!comment.is_deleted && !isEditing && (
                        <div className="flex items-center gap-3 mt-1">
                            {/* 折叠按钮 */}
                            {hasReplies && (
                                <button 
                                    onClick={() => setIsCollapsed(!isCollapsed)} 
                                    className="text-xs text-blue-600 hover:text-blue-800 focus:outline-none min-w-[36px]"
                                >
                                    {isCollapsed ? `[+${totalRepliesCount}]` : '[-]'}
                                </button>
                            )}
                            
                            {/* 回复按钮 - 更小尺寸 */}
                            <button 
                                onClick={() => {
                                    if (isReplying) {
                                        setReplyToCommentId(null);
                                        setReplyContent('');
                                    } else {
                                        setReplyToCommentId(comment.id);
                                    }
                                }} 
                                className="flex items-center justify-center text-gray-500 hover:text-blue-600 p-0.5 rounded w-4 h-4"
                            >
                                <BsArrowReturnRight className="w-3 h-3" />
                            </button>
                            
                            {/* 点赞按钮和计数组合为一个单元 */}
                            <div className="flex items-center">
                                <button 
                                    onClick={onLikeClick} 
                                    disabled={isLiking} 
                                    className="flex items-center justify-center text-gray-400 hover:text-red-400 p-0.5 rounded w-5 h-5"
                                >
                                    <div className="w-3.5 h-3.5 flex items-center justify-center">
                                        <Heart 
                                            className="w-full h-full" 
                                            stroke="currentColor" 
                                            fill={localIsLiked ? "#ef4444" : "none"} 
                                            style={{color: localIsLiked ? "#ef4444" : undefined}}
                                        />
                                    </div>
                                </button>
                                {localLikesCount > 0 && (
                                    <span className="text-xs tabular-nums ml-1">{localLikesCount}</span>
                                )}
                            </div>
                            
                            {/* 添加编辑按钮 */}
                            {canEdit && (
                                <button 
                                    onClick={onEditClick} 
                                    className="flex items-center justify-center text-gray-400 hover:text-blue-500 p-0.5 rounded w-5 h-5"
                                >
                                    <div className="w-3.5 h-3.5 flex items-center justify-center">
                                        <EditOne className="w-full h-full" stroke="currentColor" />
                                    </div>
                                </button>
                            )}
                            
                            {/* 删除按钮 */}
                            {canDelete && (
                                <button 
                                    onClick={() => handleDeleteComment(comment.id)} 
                                    className="flex items-center justify-center text-gray-400 hover:text-red-400 p-0.5 rounded w-5 h-5"
                                >
                                    <div className="w-3.5 h-3.5 flex items-center justify-center">
                                        <TrashTwo className="w-full h-full" stroke="currentColor" fill="none" />
                                    </div>
                            </button>
                            )}
                        </div>
                    )}
                    {/* 使用 framer-motion 包裹回复框 */}
                    <motion.div
                        className="relative overflow-hidden mt-2" // mt-2 原来在内部 div 上，移到 motion.div
                        initial={false}
                        animate={{
                            height: isReplying ? 'auto' : 0,
                            opacity: isReplying ? 1 : 0,
                            // marginTop: isReplying ? '0.5rem' : 0, // 保持 Tailwind 的 mt-2
                        }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                        <div ref={replyBoxRef}> {/* ref 用于点击外部检测 */}
                            <textarea 
                                value={isReplying ? replyContent : ''} // 仅当回复此项时显示和使用 replyContent
                                onChange={(e) => {
                                    if (isReplying) setReplyContent(e.target.value);
                                }} 
                                placeholder={`回复 ${displayName}...`} 
                                rows={2} 
                                className="w-full px-2 py-1.5 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-gray-100 text-gray-900 placeholder-gray-500"
                                autoFocus={isReplying} // 仅在回复时自动聚焦
                                tabIndex={isReplying ? 0 : -1} // 控制可访问性
                            />
                            <button 
                                onClick={async () => { 
                                    // 确保 replyContent 来自当前激活的回复操作
                                    if (isReplying) await handleReplySubmit(comment.id); 
                                }} 
                                disabled={!replyContent.trim() || submittingReply} 
                                className={`absolute bottom-2 right-2 p-1 rounded-md ${!replyContent.trim() || submittingReply ? 'text-gray-500 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
                                tabIndex={isReplying ? 0 : -1} // 控制可访问性
                            >
                                {submittingReply ? <FaSpinner className="animate-spin h-4 w-4" /> : <BsArrowReturnRight className="h-4 w-4" />}
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
            {!isCollapsed && comment.replies && comment.replies.length > 0 && (
                <div className="replies-container mt-1">
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
                            scrollToCommentId={scrollToCommentId}
                            onScrolledToComment={onScrolledToComment}
                            editingCommentId={editingCommentId}
                            setEditingCommentId={setEditingCommentId}
                            editContent={editContent}
                            setEditContent={setEditContent}
                            handleEditSubmit={handleEditSubmit}
                            submittingEdit={submittingEdit}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

// --- 定义 ActionCommentSection Props --- 
interface ActionCommentSectionProps {
    actionId: number;
    wrapperClassName?: string;
    wrapperStyle?: React.CSSProperties;
}

// --- 主组件 ActionCommentSection --- 
const ActionCommentSection: React.FC<ActionCommentSectionProps> = memo(({ actionId, wrapperClassName, wrapperStyle }) => {
    const { user: currentUser, token } = useAuth();
    const queryClient = useQueryClient();
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null);
    const [replyContent, setReplyContent] = useState('');
    const [submittingReply, setSubmittingReply] = useState(false);
    const [forceExpandCommentId, setForceExpandCommentId] = useState<number | null>(null);
    const commentInputRef = useRef<HTMLTextAreaElement>(null);
    const [isCommentBoxFocused, setIsCommentBoxFocused] = useState(false);
    const [refreshAnimationKey, setRefreshAnimationKey] = useState(0);
    const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
    const [scrollToCommentId, setScrollToCommentId] = useState<number | null>(null);
    
    // 添加编辑状态
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    const [editContent, setEditContent] = useState('');
    const [submittingEdit, setSubmittingEdit] = useState(false);

    const formatCommentDate = (dateString: string) => { return new Date(dateString).toLocaleString('zh-CN'); };

    const handleCommentInputFocus = () => {
        setIsCommentBoxFocused(true);
    };

    const handleCommentInputBlur = () => {
        setIsCommentBoxFocused(false);
    };
    
    const handleNewCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNewComment(e.target.value);
    };

    // --- Modify useQuery for comments ---
    const commentsQueryKey = useMemo(() => ['actionComments', actionId, sortBy], [actionId, sortBy]);

    const {
        data: apiResponse,
        isLoading: loadingComments,
        isError: isCommentErrorBoolean,
        error: commentErrorObject,
        refetch: refetchComments
    } = useQuery<ActionCommentsApiResponse, Error, ActionCommentsApiResponse, QueryKey>({
        queryKey: commentsQueryKey,
        queryFn: async () => {
            const response = await axios.get<ActionCommentsApiResponse>(`${API_BASE_URL}/api/actions/${actionId}/comments?sort_by=${sortBy}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            return response.data;
        },
        enabled: !!actionId,
        placeholderData: (previousData) => previousData
    });

    const comments = apiResponse?.comments || [];
    const commentError = isCommentErrorBoolean ? commentErrorObject?.message || '加载评论失败' : null;

    const handleRefreshComments = () => {
        refetchComments();
        setRefreshAnimationKey(prev => prev + 1);
        toast.info("正在刷新评论...");
    };

    // --- Add handler for sort change ---
    const handleSortChange = (newSortBy: 'latest' | 'popular') => {
        setSortBy(newSortBy);
        toast.info(newSortBy === 'latest' ? "按最新排序" : "按热门排序");
    };

    // --- Mutations (Example: Submit Comment) ---
    const submitCommentMutation = useMutation<
        ActionCommentData,
        Error,
        { content: string; mentionLynn?: boolean }
    >({
        mutationFn: async ({ content, mentionLynn }) => {
            const postUrl = `${API_BASE_URL}/api/actions/${actionId}/comments`;
            
            const requestBody: { content: string; mention_lynn?: boolean } = {
                content: content.trim(),
            };
            if (mentionLynn) {
                requestBody.mention_lynn = true;
            }

            const response = await axios.post<ActionCommentData>(
                postUrl,
                requestBody,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['actionComments', actionId] });
            setNewComment('');
            toast.success('评论发表成功！');
        },
        onError: (err) => {
            console.error("提交动态评论失败:", err);
            toast.error(err.message || '评论提交失败');
        },
        onSettled: () => {
            setSubmittingComment(false);
        }
    });

    const handleSubmitComment = () => {
        if (!token || !newComment.trim()) {
            toast.warn("评论内容不能为空且需要登录。");
            return;
        }
        setSubmittingComment(true);

        const mentionLynn = newComment.toLowerCase().includes('@lynn');

        submitCommentMutation.mutate({ content: newComment, mentionLynn });
    };
    
    // --- Submit Reply Mutation (Similar structure) ---
    const submitReplyMutation = useMutation<
        ActionCommentData,
        Error,
        { parentId: number, content: string, mentionLynn?: boolean }
    >({
        mutationFn: async ({ parentId, content, mentionLynn }) => {
            const replyUrl = `${API_BASE_URL}/api/actions/${actionId}/comments`;
            
            const requestBody: { content: string; parent_id: number; mention_lynn?: boolean } = {
                content: content.trim(),
                parent_id: parentId,
            };
            if (mentionLynn) {
                requestBody.mention_lynn = true;
            }

            const response = await axios.post<ActionCommentData>(
                replyUrl,
                requestBody,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        },
        onSuccess: (newReplyData) => {
            queryClient.invalidateQueries({ queryKey: ['actionComments', actionId] });
            setReplyContent('');
            setReplyToCommentId(null);
            toast.success('回复成功！');
            if (newReplyData && newReplyData.id) {
                setScrollToCommentId(newReplyData.id);
                if (newReplyData.parent_id) {
                    setForceExpandCommentId(newReplyData.parent_id);
                }
            }
        },
        onError: (err) => {
            console.error("提交动态回复失败:", err);
            toast.error(err.message || '回复提交失败');
        },
        onSettled: () => {
            setSubmittingReply(false);
        }
    });

    const handleSubmitReply = async (parentId: number) => {
        if (!token || !replyContent.trim()) {
            toast.warn("回复内容不能为空且需要登录。");
            return;
        }
        setSubmittingReply(true);

        const mentionLynnForReply = replyContent.toLowerCase().includes('@lynn');

        await submitReplyMutation.mutate({ parentId, content: replyContent, mentionLynn: mentionLynnForReply });
    };

    const handleDeleteComment = useCallback(async (commentId: number) => {
        if (!token || !window.confirm("删除评论?")) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/comments/${commentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            queryClient.invalidateQueries({ queryKey: ['actionComments', actionId] });
            toast.success("已删除");
        } catch (err) { toast.error('删除失败'); }
    }, [token, actionId, queryClient]);

    const handleLikeComment = useCallback(async (commentId: number, isLiked: boolean) => {
        if (!token) return;
        const url = `${API_BASE_URL}/api/comments/${commentId}/like?target_type=action`;
        try {
            if (isLiked) { await axios.delete(url, { headers: { 'Authorization': `Bearer ${token}` } }); }
            else { await axios.post(url, {}, { headers: { 'Authorization': `Bearer ${token}` } }); }
            queryClient.invalidateQueries({ queryKey: ['actionComments', actionId] });
        } catch (err) { 
            toast.error('点赞操作失败');
            throw err;
        }
    }, [token, actionId, queryClient]);

    const handleSetReplyTo = useCallback((id: number | null) => {
        setReplyToCommentId(id);
        if (id !== null) {
            setForceExpandCommentId(id); // 当开始回复时，强制展开该评论
        } else {
            // Optional: If you want to reset forceExpand when reply box is closed, 
            // but usually we want it to stay expanded once interacted with.
            // setForceExpandCommentId(null); 
        }
    }, [setReplyToCommentId, setForceExpandCommentId]);

    // --- 添加编辑评论的mutation ---
    const editCommentMutation = useMutation<
        ActionCommentData,
        Error,
        { commentId: number, content: string }
    >({
        mutationFn: async ({ commentId, content }) => {
            const editUrl = `${API_BASE_URL}/api/comments/${commentId}`;
            
            const response = await axios.put<ActionCommentData>(
                editUrl,
                { content: content.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['actionComments', actionId] });
            setEditingCommentId(null);
            setEditContent('');
            toast.success('评论已更新');
        },
        onError: (err) => {
            console.error("更新评论失败:", err);
            toast.error(err.message || '更新评论失败');
        },
        onSettled: () => {
            setSubmittingEdit(false);
        }
    });

    // 处理提交编辑的函数
    const handleSubmitEdit = async (commentId: number) => {
        if (!token || !editContent.trim()) {
            toast.warn("编辑内容不能为空且需要登录。");
            return;
        }
        setSubmittingEdit(true);
        await editCommentMutation.mutate({ commentId, content: editContent });
    };

    const commentSectionClass = `border-0 bg-white ${isCommentBoxFocused ? 'focus-within:border-blue-400' : ''} transition-all`;

    return (
        <div 
            className={`action-comment-section ${wrapperClassName || ''}`} 
            style={wrapperStyle}
        >
            {/* 评论输入区域 和 右侧按钮组 - 使用 Flex 布局 */}
            {currentUser && token && (
                <div className="mb-6 flex items-center space-x-2"> 
                    {/* 输入框容器 (占据大部分空间) */}
                    <div className="relative flex-grow"> 
                        <textarea 
                            ref={commentInputRef} 
                            value={newComment}
                            onChange={handleNewCommentChange}
                            onFocus={handleCommentInputFocus}
                            onBlur={handleCommentInputBlur}
                            className={`w-full px-3 py-2 pb-10 bg-gray-100 rounded-lg 
                                focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 text-sm 
                                transition-all duration-300 ease-in-out 
                                overflow-y-auto resize-none 
                                ${isCommentBoxFocused || newComment.trim() ? 'h-20' : 'h-12'}`}
                            placeholder="添加评论..."
                            rows={isCommentBoxFocused || newComment.trim() ? 3 : 1}
                            disabled={submitCommentMutation.isPending}
                            onKeyDown={(e) => { 
                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && newComment.trim()) {
                                    handleSubmitComment();
                                }
                            }}
                        />
                        {/* 发送按钮 (保持在输入框内部右下角) */}
                        {(isCommentBoxFocused || newComment.trim()) && (
                            <button 
                                onClick={handleSubmitComment} 
                                disabled={submitCommentMutation.isPending || !newComment.trim()}
                                className="absolute bottom-2 right-2 z-20 p-1.5 text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors duration-150 rounded-md hover:bg-gray-200 active:bg-gray-300 focus:outline-none"
                                title="发送 (Cmd/Ctrl+Enter)"
                            >
                                {submitCommentMutation.isPending ? (
                                    <FaSpinner className="animate-spin h-4 w-4" />
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l4-4m-4 4l4 4" /></svg>
                                )}
                            </button>
                        )}
                    </div>

                    {/* 右侧按钮组：最新、热门、刷新 (Flex 容器) */}
                    <div className="flex space-x-1 flex-shrink-0">
                        <button
                            onClick={() => handleSortChange('latest')}
                            className={`p-1.5 px-2 rounded-full text-xs transition-colors duration-150 ${
                                sortBy === 'latest' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            title="按最新排序"
                        >
                            最新
                        </button>
                        <button
                            onClick={() => handleSortChange('popular')}
                            className={`p-1.5 px-2 rounded-full text-xs transition-colors duration-150 ${
                                sortBy === 'popular' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                            title="按热门排序"
                        >
                            热门
                        </button>
                        
                        <button
                            onClick={handleRefreshComments}
                            disabled={loadingComments}
                            className="p-1.5 text-gray-700 hover:text-blue-600 active:text-blue-700 transition-colors duration-150 rounded-full hover:bg-gray-200 active:bg-gray-300 focus:outline-none"
                            title="刷新评论"
                        >
                            {loadingComments ? (
                                <FaSpinner className="animate-spin h-4 w-4" />
                            ) : (
                                <motion.div
                                    key={`action-comment-refresh-${refreshAnimationKey}`}
                                    initial={{ rotate: 0 }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.4, ease: "linear" }}
                                    style={{ display: 'flex' }}
                                >
                                    <Refresh className="h-4 w-4 block" />
                                </motion.div>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* 评论列表区域 */}
            <div className="relative">
                {/* 评论列表 */} 
                {loadingComments && !comments.length && (
                    <div className="flex justify-center items-center py-8">
                        <FaSpinner className="animate-spin h-6 w-6 text-blue-400" />
                        <p className="ml-2 text-gray-300">正在加载评论...</p>
                    </div>
                )}
                {isCommentErrorBoolean && (
                    <div className="text-center py-4 text-red-400">
                        <p>{commentError || "加载评论出错，请稍后重试或刷新页面。"}</p>
                    </div>
                )}
                {/* 修改：移除"暂无评论"的特定文本提示，直接依赖下方 comments.length > 0 的判断来显示空白或列表 */}
                {!loadingComments && !isCommentErrorBoolean && comments.length === 0 && (
                    <div className="py-6"></div> // 留白，不再显示文字
                )}
                {comments.length > 0 && (
                    <div className="comments-list space-y-2 md:space-y-3 pt-3">
                        {comments.map((comment, index) => (
                            <CommentItem 
                                key={comment.id} 
                                comment={comment} 
                                currentUser={currentUser} 
                                token={token} 
                                replyToCommentId={replyToCommentId} 
                                setReplyToCommentId={handleSetReplyTo}
                                replyContent={replyContent} 
                                setReplyContent={setReplyContent} 
                                handleReplySubmit={handleSubmitReply} 
                                submittingReply={submittingReply} 
                                formatCommentDate={formatCommentDate} 
                                handleDeleteComment={handleDeleteComment} 
                                forceExpandCommentId={forceExpandCommentId} 
                                handleLikeComment={handleLikeComment}
                                scrollToCommentId={scrollToCommentId}
                                onScrolledToComment={() => setScrollToCommentId(null)}
                                isLastReply={index === comments.length - 1}
                                editingCommentId={editingCommentId}
                                setEditingCommentId={setEditingCommentId}
                                editContent={editContent}
                                setEditContent={setEditContent}
                                handleEditSubmit={handleSubmitEdit}
                                submittingEdit={submittingEdit}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default ActionCommentSection; 