/**
 * @file DynamicCard.tsx
 * @description 一个通用的、可复用的动态卡片组件，用于展示不同类型的用户动态。
 *              支持两种主要样式变体（variant）: 
 *              1. 'default': 标准卡片样式，用于主内容区域，包含完整的操作按钮。
 *              2. 'sidebar': 紧凑型卡片样式，用于侧边栏，通常只显示摘要信息，并可点击展开详情。
 * 
 *              核心功能：
 *              - 根据传入的 dynamic 数据对象的结构（是否为转发、是否有目标内容等）展示不同的内容。
 *              - 处理和显示用户头像、用户名、时间戳。
 *              - 显示动态的主要内容（分享评论、笔记标题/内容）。
 *              - 对于转发类型的动态，显示原始动态的摘要。
 *              - 提供对图片 Markdown 语法的处理（sidebar 模式下替换为 [图片] 占位符）。
 *              - 提供编辑、删除、转发、收藏等操作按钮（仅限 default 模式）。
 *              - 内置错误处理和状态管理（如删除确认模态框）。
 *              - 可通过 onActionComplete 回调通知父组件操作完成（如删除后刷新列表）。
 *              - 支持通过 onClick（由父组件处理）实现点击交互（如 sidebar 模式下点击打开模态框）。
 * 
 * @props {DynamicData} dynamic - 动态数据对象，包含展示所需的所有信息。
 * @props {'default' | 'sidebar'} [variant='default'] - 卡片的样式变体。
 * @props {() => void} [onActionComplete] - 当卡片内的操作（如删除）成功完成时调用的回调函数。
 * @props {(dynamicId: number) => void} [onClick] - 外部点击处理程序。
 * @props {boolean} [forceExpandContent] - 强制内容展开的标志。
 * @props {boolean} [showCommentsInline] - 是否显示内联评论的标志。
 */
import React, { useState, ReactNode, useEffect, memo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaRegComment, FaRetweet, FaHeart, FaRegHeart, FaBookmark, FaRegBookmark, FaTrash } from 'react-icons/fa';
import { IoShareSocialOutline } from 'react-icons/io5';
import ShareDynamicModal from './ShareDynamicModal';
import { API_BASE_URL } from '../config';
import QuotedDynamicView, { DynamicDetails } from './QuotedDynamicView';
import Modal from './Modal';
import UserAvatarWithImage from './UserAvatarWithImage';
import TextWithLinks from './TextWithLinks';
import { useTimeline } from '../contexts/TimelineContext';
import ActionCommentSection from './ActionCommentSection';
import LazyImage from './LazyImage';

// --- Helper functions defined locally (Consider moving to a shared utils file later) --- 
const getImageUrl = (imagePath: string | null): string | undefined => {
  // console.log('DynamicCard 处理前的头像URL:', imagePath);
  
  if (!imagePath) {
    // console.log('DynamicCard 未提供头像URL，返回undefined');
    return undefined;
  }
  
  let processedUrl = imagePath; // 默认直接使用传入路径
  
  // --- 移除 COS 代理逻辑，直接使用 COS URL --- 
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    // No special handling needed for COS or other external URLs now, 
    // assuming CORS is correctly configured on the server (COS).
    processedUrl = imagePath;
  }
  // --- 结束移除代理逻辑 ---
  // --- 处理本地/相对路径 (保持不变) ---
  else if (imagePath.startsWith('/static') || imagePath.startsWith('uploads/')) {
      const urlParts = API_BASE_URL.split('/');
      const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
      const relativePath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
      if (imagePath.startsWith('/static')) {
        processedUrl = `${baseUrlWithoutPath}${relativePath}`;
      } else {
        processedUrl = `${baseUrlWithoutPath}/static/${imagePath}`;
      }
  }
  else if (!imagePath.includes('/')) {
     const urlParts = API_BASE_URL.split('/');
     const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
     processedUrl = `${baseUrlWithoutPath}/static/uploads/${imagePath}`;
  }
  // --- 结束本地路径处理 ---
  
  // console.log('DynamicCard 最终处理后的URL:', processedUrl);
  return processedUrl;
};

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString);
    // Using a common format found in other components
    return date.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return dateString; // Fallback
  }
};
// --- End Helper functions --- 

// --- Placeholder Interfaces (Replace with actual imports/definitions) --- 
interface Author {
    id: number;
    nickname?: string | null;
    avatar?: string | null;
    email?: string; // Added email for fallback display name
}

interface ArticleStub {
    id: number;
    title: string;
    slug: string;
    category?: string | null;
}

interface PostStub {
    id: number;
    title: string;
    slug: string;
    topic?: { name: string; slug: string } | null; // Added topic for posts
}

interface ToolStub {
    id: number;
    name: string;
    slug: string;
    category?: { name: string } | null; // Added category for tools
}

interface Dynamic {
  id: number;
  content?: string;
  author?: Author | null;
  target_type: 'article' | 'post' | 'tool' | 'action' | 'user' | 'user_status' | 'deleted' | string; // Added 'user_status' and 'deleted'
  target_id: number | null; // Allow null if target is deleted or not applicable
  like_count?: number;
  collect_count?: number;
  comment_count?: number;
  repost_count?: number;
  current_user_like_action_id?: number | null;
  current_user_collect_action_id?: number | null;
  target_article?: ArticleStub | null;
  target_post?: PostStub | null;
  target_tool?: ToolStub | null;
  original_action?: DynamicDetails | null; // Changed to DynamicDetails
  created_at: string;
  images?: string[];
  target_title?: string | null; // Allow null
  target_slug?: string | null;  // Allow null
  is_repost?: boolean; // Added for clarity
  sharer_id?: number | null;
  sharer_username?: string;
  sharer_avatar_url?: string | null;
  shared_at?: string;
  action_id?: number; // Ensure action_id is part of the core Dynamic type if it's primary
}

interface User {
  id: number;
  // other user fields
}

// --- 接口定义调整：让 DynamicCard 能接收 HomePage 传来的结构 --- 
// （或者在 HomePage 中转换数据结构，但修改 Card 更直接）
interface DynamicCardProps {
  dynamic: any; 
  onActionComplete?: () => void; 
  variant?: 'main' | 'sidebar' | 'timeline'; 
  onClick?: (dynamicId: number) => void;
  forceExpandContent?: boolean; 
  onImageClick?: (images: string[], index: number) => void;
  isSelected?: boolean;
  className?: string;
}
// --- 结束接口调整 ---

// 使用 React.memo 包装 DynamicCard
const DynamicCard = memo(({ 
  dynamic, 
  onActionComplete, 
  variant = 'main', 
  onClick, 
  forceExpandContent = false, 
  onImageClick,
  isSelected,
  className
}: DynamicCardProps) => {
  // CONSOLE.LOG REMOVED HERE

  const { token, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareComment, setShareComment] = useState('');
  
  // 更新初始状态设置，确保初始值正确
  const [isLiked, setIsLiked] = useState(
    dynamic.is_liked_by_current_user !== undefined 
      ? dynamic.is_liked_by_current_user 
      : dynamic.current_user_like_action_id !== null && dynamic.current_user_like_action_id !== undefined
  );
  
  const [likeCount, setLikeCount] = useState(
    dynamic.likes_count !== undefined ? dynamic.likes_count : (dynamic.like_count || 0)
  );
  
  const [likeActionId, setLikeActionId] = useState<number | null>(
    dynamic.current_user_like_action_id ?? null
  );
  
  const [isCollected, setIsCollected] = useState(
    dynamic.is_collected_by_current_user !== undefined 
      ? dynamic.is_collected_by_current_user 
      : dynamic.current_user_collect_action_id !== null && dynamic.current_user_collect_action_id !== undefined
  );
  
  const [collectCount, setCollectCount] = useState(
    dynamic.collects_count !== undefined ? dynamic.collects_count : (dynamic.collect_count || 0)
  );
  
  const [collectActionId, setCollectActionId] = useState<number | null>(
    dynamic.current_user_collect_action_id ?? null
  );
  
  const authorId = dynamic.sharer_id || dynamic.author?.id;
  const authorName = dynamic.sharer_username || dynamic.author?.nickname || dynamic.author?.email?.split('@')[0] || '匿名用户';
  const authorAvatar = dynamic.sharer_avatar_url || dynamic.author?.avatar;
  const createdAt = dynamic.shared_at || dynamic.created_at;
  const dynamicContentFromData = dynamic.content || dynamic.share_comment;
  const currentActionId = dynamic.action_id || dynamic.id; 

  // ---> 修改：全局的原始内容删除检查 <---
  let isContentEffectivelyDeleted = dynamic.target_type === 'deleted';
  let deletedMessage = "原始内容已被删除。"; // 通用回退消息

  if (isContentEffectivelyDeleted) {
    // 优先使用后端提供的 target_title，如果存在
    if (dynamic.target_title && dynamic.target_title.trim() !== '') {
      deletedMessage = dynamic.target_title;
    } else {
      // 如果 target_title 为空，可以根据 target_type（如果之前不是 'deleted'）提供更具体的回退，
      // 但由于现在 target_type 直接是 'deleted'，我们可能没有原始类型信息了，
      // 所以通用消息或者基于 dynamic.target_title (如截图所示的 "[帖子已删除]") 更好。
      // 实际上，API 返回的 target_title 已经是 "[帖子已删除]" 或 "[文章已删除]"，所以上面的 if 分支会处理。
      // 为保险起见，保留一个非常通用的回退。
      // deletedMessage = "该分享的原始内容已被作者删除。"; 
      // 根据截图，target_title 已经很明确了，所以这里的 else 逻辑可能不需要那么复杂
    }
  }
  // ---> 结束修改 <---

  const { openTimeline } = useTimeline(); 

  // 添加调试hook，查看初始状态
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // console.log(`DynamicCard(${actionId}) 初始状态:`, {
      //   likes: {
      //     isLiked,
      //     likeCount,
      //     likeActionId
      //   },
      //   collects: {
      //     isCollected,
      //     collectCount,
      //     collectActionId
      //   },
      //   dynamic: {
      //     id: dynamic.id || dynamic.action_id,
      //     is_liked_by_current_user: dynamic.is_liked_by_current_user,
      //     is_collected_by_current_user: dynamic.is_collected_by_current_user,
      //     current_user_like_action_id: dynamic.current_user_like_action_id,
      //     current_user_collect_action_id: dynamic.current_user_collect_action_id,
      //     likes_count: dynamic.likes_count,
      //     like_count: dynamic.like_count,
      //     collects_count: dynamic.collects_count,
      //     collect_count: dynamic.collect_count
      //   }
      // });
    }
  }, []);

  // 当dynamic属性变化时更新组件内部状态
  useEffect(() => {
    // 更新点赞状态
    const newIsLiked = dynamic.is_liked_by_current_user !== undefined 
      ? dynamic.is_liked_by_current_user 
      : dynamic.current_user_like_action_id !== null && dynamic.current_user_like_action_id !== undefined;
    
    const newLikeCount = dynamic.likes_count !== undefined ? dynamic.likes_count : (dynamic.like_count || 0);
    
    const newLikeActionId = dynamic.current_user_like_action_id ?? null;
    
    // 更新收藏状态
    const newIsCollected = dynamic.is_collected_by_current_user !== undefined 
      ? dynamic.is_collected_by_current_user 
      : dynamic.current_user_collect_action_id !== null && dynamic.current_user_collect_action_id !== undefined;
    
    const newCollectCount = dynamic.collects_count !== undefined ? dynamic.collects_count : (dynamic.collect_count || 0);
    
    const newCollectActionId = dynamic.current_user_collect_action_id ?? null;
    
    // 检查是否有变化，并更新状态
    if (isLiked !== newIsLiked) setIsLiked(newIsLiked);
    if (likeCount !== newLikeCount) setLikeCount(newLikeCount);
    if (likeActionId !== newLikeActionId) setLikeActionId(newLikeActionId);
    
    if (isCollected !== newIsCollected) setIsCollected(newIsCollected);
    if (collectCount !== newCollectCount) setCollectCount(newCollectCount);
    if (collectActionId !== newCollectActionId) setCollectActionId(newCollectActionId);
    
    if (process.env.NODE_ENV !== 'production') {
      // console.log(`DynamicCard(${actionId}) 状态更新:`, {
      //   likes: { old: isLiked, new: newIsLiked, changed: isLiked !== newIsLiked },
      //   collects: { old: isCollected, new: newIsCollected, changed: isCollected !== newIsCollected }
      // });
    }
  }, [dynamic, dynamic.is_liked_by_current_user, dynamic.current_user_like_action_id, 
      dynamic.likes_count, dynamic.like_count, 
      dynamic.is_collected_by_current_user, dynamic.current_user_collect_action_id,
      dynamic.collects_count, dynamic.collect_count]);

  // --- 新增：处理卡片点击事件 --- 
  const handleCardClick = () => {
    // 只在 sidebar 模式下触发时间线打开
    if (variant === 'sidebar') {
      // 优先使用内部的 openTimeline
      // --- 修改：使用 actionId --- (旧注释，现在传递整个对象)
      // if (actionId) {
      //   openTimeline(actionId);
      // }
      // --- 新增：调用新的 openTimeline 并传递完整 dynamic 对象 ---
      if (dynamic) { // 确保 dynamic 对象存在
        // 注意：这里的 dynamic 是 DynamicCard 的 props，其类型需要兼容 TimelineContext 期望的 DynamicItem
        // 假设类型兼容或可以在这里进行转换
        try {
          openTimeline(dynamic as any); // 使用类型断言 (any) 暂时解决类型问题，后续应确保类型一致
        } catch (error) {
          console.error("Error calling openTimeline:", error);
          toast.error("无法打开时间线详情");
        }
      } else {
        console.warn("Dynamic data is missing, cannot open timeline.");
      }
    } else if (onClick) {
      // 如果是 main 模式且提供了外部 onClick，则调用它
      // --- 修改：使用 actionId --- (保持不变，如果外部 onClick 只需要 id)
      if (currentActionId) {
        onClick(currentActionId);
      }
    }
    // main 模式下默认不执行任何操作，除非有外部 onClick
  };

  // --- Corrected handleLikeToggle ---
  const handleLikeToggle = async () => {
    if (!token) {
      toast.error('请先登录再点赞');
      return;
    }
    if (isSubmitting || !currentActionId) return;
    setIsSubmitting(true);
    setError(null);

    // 保存原始状态以便回滚
    const originalIsLiked = isLiked;
    const originalLikeCount = likeCount;
    const originalLikeActionId = likeActionId;

    try {
      // 修改逻辑：根据当前UI状态而非likeActionId来判断操作类型
      if (isLiked) {
        // 如果UI显示已点赞，则尝试取消点赞
        if (!likeActionId) {
          // 特殊情况：UI显示已点赞但没有记录ID，修正UI状态即可
          setIsLiked(false);
          toast.info('已更新点赞状态');
          return;
        }
        
        // 正常取消点赞流程
        try {
          console.log(`尝试取消点赞，动态ID: ${currentActionId}`);
          
          // 使用新的专用点赞端点
          const apiUrl = `${API_BASE_URL}/api/actions/${currentActionId}/likes`.replace(/([^:]\/)\/+/g, "$1");
          console.log('DELETE请求URL:', apiUrl);
          
          const response = await axios.delete(apiUrl, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log('取消点赞响应:', response.data);
          
          // 更新UI状态
          setIsLiked(false);
          setLikeActionId(null);
          setLikeCount((prev: number) => Math.max(0, prev - 1));
          toast.success('取消点赞成功');
          
          // 通知父组件状态已更改
          if (onActionComplete) {
            console.log('调用onActionComplete回调');
            onActionComplete();
          }
        } catch (error) {
          console.error('取消点赞失败:', error);
          if (axios.isAxiosError(error)) {
            console.error('响应数据:', error.response?.data);
            console.error('响应状态:', error.response?.status);
            
            // 特殊处理404错误 - 记录不存在，说明已经被删除，更新UI状态
            if (error.response?.status === 404) {
              console.log('点赞记录已不存在，更新UI状态');
              setIsLiked(false);
              setLikeActionId(null);
              if (isLiked) {
                setLikeCount((prev: number) => Math.max(0, prev - 1));
              }
              toast.info('已更新点赞状态');
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
              return; // 不抛出错误
            }
          }
          throw error; // 继续抛出错误以便外层catch处理
        }
      } else {
        // 点赞操作
        try {
          console.log('发送点赞请求:', currentActionId);
          const response = await axios.post(
            `${API_BASE_URL}/api/actions/${currentActionId}/likes`,
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          
          console.log('点赞响应数据:', response.data);
          
          // 处理已存在点赞的情况 - 后端会返回 200 而不是 201
          if (response.data) {
            // 可能是新创建的点赞或已存在的点赞
            if (response.data.action_id) {
              // 从响应中提取点赞记录ID
              setLikeActionId(response.data.action_id);
              setIsLiked(true);
              
              // 只在实际计数变化时更新计数
              if (!isLiked) {
                setLikeCount((prev: number) => prev + 1);
              }
              
              toast.success('点赞成功');
              
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
            } 
            // 如果响应是timeline格式数据(直接返回动态详情)
            else if (response.data.current_user_like_action_id) {
              setLikeActionId(response.data.current_user_like_action_id);
              setIsLiked(true);
              
              // 如果响应包含likes_count，直接使用
              if (response.data.likes_count !== undefined) {
                setLikeCount(response.data.likes_count);
              } else if (!isLiked) {
                setLikeCount((prev: number) => prev + 1);
              }
              
              toast.success('点赞成功');
              
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
            } else {
              throw new Error('点赞失败：服务器返回的数据格式无效');
            }
          } else {
            throw new Error('点赞失败：服务器未返回数据');
          }
        } catch (error) {
          // 特殊处理：检查是否为后端未返回数据但实际操作已成功的情况
          if (axios.isAxiosError(error) && error.response?.status === 500) {
            console.log('后端返回500错误，但操作可能已成功，设置为点赞状态');
            // 假设操作成功但后端没有正确返回
            setIsLiked(true);
            setLikeCount((prev: number) => prev + 1);
            // 由于没有得到新记录ID，页面刷新后可能无法取消点赞，除非后端修复
            toast.warning('点赞可能已成功，但后端返回异常');
            return;
          }
          throw error; // 非特殊情况，继续抛出错误
        }
      }
    } catch (err) {
      console.error('Like toggle error:', err);
      
      // 回滚UI状态
      setIsLiked(originalIsLiked);
      setLikeCount(originalLikeCount);
      setLikeActionId(originalLikeActionId);
      
      let errorMessage = '操作失败，请稍后重试';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (axios.isAxiosError(err) && err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCollectToggle = async () => {
    if (!token) {
      toast.error('请先登录再收藏');
      return;
    }
    if (isSubmitting || !currentActionId) return;
    setIsSubmitting(true);
    setError(null);

    // 保存原始状态以便回滚
    const originalIsCollected = isCollected;
    const originalCollectCount = collectCount;
    const originalCollectActionId = collectActionId;

    try {
      // 修改逻辑：根据当前UI状态而非collectActionId来判断操作类型
      if (isCollected) {
        // 如果UI显示已收藏，则尝试取消收藏
        if (!collectActionId) {
          // 特殊情况：UI显示已收藏但没有记录ID，修正UI状态即可
          setIsCollected(false);
          toast.info('已更新收藏状态');
          return;
        }
        
        // 正常取消收藏流程
        try {
          console.log(`尝试取消收藏，动态ID: ${currentActionId}`);
          
          // 使用新的专用收藏端点
          const apiUrl = `${API_BASE_URL}/api/actions/${currentActionId}/collects`.replace(/([^:]\/)\/+/g, "$1");
          console.log('DELETE请求URL:', apiUrl);
          
          const response = await axios.delete(apiUrl, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log('取消收藏响应:', response.data);
          
          // 更新UI状态
          setIsCollected(false);
          setCollectActionId(null);
          setCollectCount((prev: number) => Math.max(0, prev - 1));
          toast.success('取消收藏成功');
          
          // 通知父组件状态已更改
          if (onActionComplete) {
            console.log('调用onActionComplete回调');
            onActionComplete();
          }
        } catch (error) {
          console.error('取消收藏失败:', error);
          if (axios.isAxiosError(error)) {
            console.error('响应数据:', error.response?.data);
            console.error('响应状态:', error.response?.status);
            
            // 特殊处理404错误 - 记录不存在，说明已经被删除，更新UI状态
            if (error.response?.status === 404) {
              console.log('收藏记录已不存在，更新UI状态');
              setIsCollected(false);
              setCollectActionId(null);
              if (isCollected) {
                setCollectCount((prev: number) => Math.max(0, prev - 1));
              }
              toast.info('已更新收藏状态');
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
              return; // 不抛出错误
            }
          }
          throw error; // 继续抛出错误以便外层catch处理
        }
      } else {
        // 收藏操作
        try {
          console.log('发送收藏请求:', currentActionId);
          const response = await axios.post(
            `${API_BASE_URL}/api/actions/${currentActionId}/collects`,
            {},
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          
          console.log('收藏响应数据:', response.data);
          
          // 处理已存在收藏的情况 - 后端会返回 200 而不是 201
          if (response.data) {
            // 可能是新创建的收藏或已存在的收藏
            if (response.data.action_id) {
              // 从响应中提取收藏记录ID
              setCollectActionId(response.data.action_id);
              setIsCollected(true);
              
              // 只在实际计数变化时更新计数
              if (!isCollected) {
                setCollectCount((prev: number) => prev + 1);
              }
              
              toast.success('收藏成功');
              
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
            } 
            // 如果响应是timeline格式数据(直接返回动态详情)
            else if (response.data.current_user_collect_action_id) {
              setCollectActionId(response.data.current_user_collect_action_id);
              setIsCollected(true);
              
              // 如果响应包含collects_count，直接使用
              if (response.data.collects_count !== undefined) {
                setCollectCount(response.data.collects_count);
              } else if (!isCollected) {
                setCollectCount((prev: number) => prev + 1);
              }
              
              toast.success('收藏成功');
              
              // 通知父组件状态已更改
              if (onActionComplete) {
                onActionComplete();
              }
            } else {
              throw new Error('收藏失败：服务器返回的数据格式无效');
            }
          } else {
            throw new Error('收藏失败：服务器未返回数据');
          }
        } catch (error) {
          // 特殊处理：检查是否为后端未返回数据但实际操作已成功的情况
          if (axios.isAxiosError(error) && error.response?.status === 500) {
            console.log('后端返回500错误，但操作可能已成功，设置为收藏状态');
            // 假设操作成功但后端没有正确返回
            setIsCollected(true);
            setCollectCount((prev: number) => prev + 1);
            // 由于没有得到新记录ID，页面刷新后可能无法取消收藏，除非后端修复
            toast.warning('收藏可能已成功，但后端返回异常');
            return;
          }
          throw error; // 非特殊情况，继续抛出错误
        }
      }
    } catch (err) {
      console.error('Collect toggle error:', err);
      
      // 回滚UI状态
      setIsCollected(originalIsCollected);
      setCollectCount(originalCollectCount);
      setCollectActionId(originalCollectActionId);
      
      let errorMessage = '操作失败，请稍后重试';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (axios.isAxiosError(err) && err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- handleShare opens the modal --- 
  const handleShare = () => {
    if (!token) { toast.error('请先登录再分享'); return; }
    setShareComment('');
    setSubmitError(null);
    setIsShareModalOpen(true);
  };

  // --- handleShareSubmit handles the actual API call --- 
  const handleShareSubmit = async (comment: string, images: string[] = []) => {
    if (!token) { 
      toast.error('请先登录'); 
      return; 
    }

    let finalTargetId: number;

    const currentDynamicActualId = dynamic?.action_id ?? dynamic?.id;

    if (!dynamic || typeof currentDynamicActualId === 'undefined') {
      console.error("DynamicCard: dynamic data or its ID (action_id/id) is missing for sharing."); // Updated error message
      toast.error("无法获取动态信息以进行分享。");
      return; // Exit if essential data is missing
    }
    
    finalTargetId = currentDynamicActualId; // Default to current dynamic's ID
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const payload = {
        action_type: 'share',
        target_type: 'action',
        target_id: finalTargetId, 
        content: comment,
        images: images 
      };
      
      const response = await fetch(`${API_BASE_URL}/api/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '分享失败');
      }
      
      setIsShareModalOpen(false);
      setShareComment('');
      toast.success('分享成功');
      
      onActionComplete?.();
      
    } catch (error: any) {
      console.error('转发失败:', error);
      setSubmitError(error.message || '分享失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Added Placeholder Functions --- 
  const handleDelete = async () => {
    // --- 修改：检查 actionId 和 dynamic.sharer_id ---
    if (!token || !currentUser || currentUser.id !== dynamic.sharer_id) return; 
    if (!currentActionId) { toast.error('无法获取动态ID'); return; }
    if (window.confirm('确定要删除这条动态吗？')) {
      setIsSubmitting(true);
      try {
        // --- 修改：使用 actionId ---
        await axios.delete(`${API_BASE_URL}/api/actions/${currentActionId}`, { 
          headers: { Authorization: `Bearer ${token}` }
        });
        
        toast.success('动态删除成功');
        
        // 确保调用onActionComplete回调
        if (onActionComplete) {
          console.log('删除操作完成，调用onActionComplete回调');
          onActionComplete();
        }
      } catch (err: any) {
        console.error('删除动态失败:', err);
        toast.error(err.response?.data?.error || '删除动态失败');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const navigateToDetail = () => {
    if (dynamic.target_type === 'article' && dynamic.target_article) {
      navigate(`/article/${dynamic.target_article.slug}`);
    } else if (dynamic.target_type === 'post' && dynamic.target_post) {
      navigate(`/posts/${dynamic.target_post.slug}`);
    } else if (dynamic.target_type === 'tool' && dynamic.target_tool) {
      navigate(`/tools/${dynamic.target_tool.slug}`);
    } else if (dynamic.target_type === 'action' && dynamic.original_action) {
       console.log("Navigation for reposted action detail not implemented yet.");
    } else {
        console.warn("Cannot navigate, target detail missing for dynamic:", dynamic);
    }
  };

  const renderTarget = () => {
    const isCompact = variant === 'sidebar';
    // The original_content_deleted check is now handled by isContentEffectivelyDeleted at a higher level.
    
    if (dynamic.target_type === 'user' || dynamic.target_type === 'user_status') {
      return null; // Original posts/statuses don't render a "target" card.
    }
    
    // Render target for article, post, tool only if NOT effectively deleted
    if (dynamic.target_type === 'article' && (dynamic.target_title || dynamic.target_article)) {
      const title = dynamic.target_title || (dynamic.target_article ? dynamic.target_article.title : null);
      const slug = dynamic.target_slug || (dynamic.target_article ? dynamic.target_article.slug : null);
      const category = dynamic.target_article ? dynamic.target_article.category : null;
      if (!title || !slug) return null;
      return (
        <div 
          className={`mt-2 ${isCompact ? 'p-1.5' : 'p-2'} ${isCompact ? 'bg-gray-300' : 'bg-gray-300'} rounded-md hover:bg-gray-400 cursor-pointer transition-all duration-200`} 
          onClick={(e) => { e.stopPropagation(); navigate(`/article/${slug}`); }}
        >
          <div className="flex items-center">
            <span className="text-xs text-blue-700 whitespace-nowrap flex-shrink-0">分享的文章{category ? `：${category}` : ''}</span>
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-blue-900 ml-1 truncate`}>{title}</span>
          </div>
        </div>
      );
    } 
    else if (dynamic.target_type === 'post' && (dynamic.target_title || dynamic.target_post)) {
      const title = dynamic.target_title || (dynamic.target_post ? dynamic.target_post.title : null);
      const slug = dynamic.target_slug || (dynamic.target_post ? dynamic.target_post.slug : null);
      const topic = dynamic.target_post && dynamic.target_post.topic ? dynamic.target_post.topic.name : null;
      if (!title || !slug) return null;
      return (
        <div 
          className={`mt-2 ${isCompact ? 'p-1.5' : 'p-2'} ${isCompact ? 'bg-gray-300' : 'bg-gray-300'} rounded-md hover:bg-gray-400 cursor-pointer transition-all duration-200`} 
          onClick={(e) => { e.stopPropagation(); navigate(`/posts/${slug}`); }}
        >
          <div className="flex items-center">
            <span className="text-xs text-green-700 whitespace-nowrap flex-shrink-0">分享的帖子{topic ? `：${topic}` : ''}</span>
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-green-900 ml-1 truncate`}>{title}</span>
          </div>
        </div>
      );
    }
    else if (dynamic.target_type === 'tool' && (dynamic.target_title || dynamic.target_tool)) {
      const title = dynamic.target_title || (dynamic.target_tool ? dynamic.target_tool.name : null);
      const slug = dynamic.target_slug || (dynamic.target_tool ? dynamic.target_tool.slug : null);
      const category = dynamic.target_tool && dynamic.target_tool.category ? dynamic.target_tool.category.name : null;
      if (!title || !slug) return null;
      return (
        <div 
          className={`mt-2 ${isCompact ? 'p-1.5' : 'p-2'} ${isCompact ? 'bg-gray-300' : 'bg-gray-300'} rounded-md hover:bg-gray-400 cursor-pointer transition-all duration-200`} 
          onClick={(e) => { e.stopPropagation(); navigate(`/tools/${slug}`); }}
        >
          <div className="flex items-center">
            <span className="text-xs text-purple-700 whitespace-nowrap flex-shrink-0">分享的工具{category ? `：${category}` : ''}</span>
            <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-purple-900 ml-1 truncate`}>{title}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // --- 图片展示区 ---
  const renderImages = (): React.ReactNode => {
    if (!dynamic.images || dynamic.images.length === 0) {
      return null;
    }

    // 最多展示9张
    const imagesToShow = dynamic.images.slice(0, 9);
    
    // 单张图片：不超过120px宽，居左，避免过大
    if (imagesToShow.length === 1) {
      return (
        <div className="mt-2 flex w-full">
          <div
            className="relative bg-gray-700 rounded-lg overflow-hidden cursor-pointer group w-[120px] max-w-full aspect-square"
            onClick={(e) => {
              e.stopPropagation();
              if (onImageClick) {
                onImageClick(dynamic.images, 0);
              }
            }}
          >
            <LazyImage 
              src={getImageUrl(imagesToShow[0]) || ''} 
              alt="分享图片 1"
              className="w-full h-full object-cover rounded-lg"
              isDynamicFeed={variant === 'sidebar'}
              priority={variant === 'sidebar' ? 5 : 3}
              blur={true}
              wrapperClassName="w-full h-full"
              onError={() => {
                console.warn(`图片加载失败: ${imagesToShow[0]}`);
              }}
            />
          </div>
        </div>
      );
    }

    // 多张图片：3列自动换行，间距美观
    return (
      <div className="mt-2 grid grid-cols-3 gap-1.5 w-full">
        {imagesToShow.map((imgSrc: string, idx: number) => (
          <div
            key={idx}
            className="relative aspect-square bg-gray-700 rounded-lg overflow-hidden cursor-pointer group"
            onClick={(e) => {
              e.stopPropagation();
              if (onImageClick) {
                onImageClick(dynamic.images, idx);
              }
            }}
          >
            <LazyImage 
              src={getImageUrl(imgSrc) || ''} 
              alt={`分享图片 ${idx + 1}`} 
              className="w-full h-full object-cover rounded-lg"
              isDynamicFeed={variant === 'sidebar'}
              priority={variant === 'sidebar' ? 5 : 3}
              blur={true}
              wrapperClassName="w-full h-full"
              onError={() => {
                console.warn(`图片加载失败: ${imgSrc}`);
              }}
            />
            {/* 超过9张时，最后一张显示+N */}
            {idx === 8 && dynamic.images.length > 9 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-lg font-bold">
                +{dynamic.images.length - 9}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // --- 核心渲染逻辑 ---
  return (
    <div
      onClick={handleCardClick}
      className={`
        w-full
        group transition-all duration-300 ease-in-out 
        hover:brightness-110
        ${variant === 'sidebar' 
          ? 'bg-gray-100' 
          : 'bg-gray-100'
        }
        rounded-xl mb-4 overflow-hidden 
        ${variant === 'sidebar' ? 'p-3 text-sm cursor-pointer' : (variant === 'timeline' ? 'p-4' : 'p-4')}
        relative
        ${className || ''}
      `}
      style={{
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.1)',
        transform: 'scale(1)',
        zIndex: isSelected && variant === 'sidebar' ? 10 : 1, 
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease-out',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(-6px) scale(1.01)';
        el.style.boxShadow = '0 8px 15px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'scale(1)';
        el.style.boxShadow = '0px 2px 6px rgba(0, 0, 0, 0.1)';
      }}
    >
      {/* Right side indicator bar */}
      {isSelected && variant === 'sidebar' && (
        <div
          className="absolute top-0 right-0 h-full w-1 bg-blue-500 rounded-r-xl transition-opacity duration-300 ease-in-out"
          style={{ opacity: 1 }}
        ></div>
      )}

      <div className="flex items-center justify-between pt-0">
        <div className="flex items-center">
          {authorId ? (
            <Link
              to={`/profile/${authorId}`}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0" 
            >
          <UserAvatarWithImage
            userId={authorId}
            avatarUrl={authorAvatar ?? undefined} 
            username={authorName} 
            size={variant === 'sidebar' ? 'sm' : 'md'} 
          />
            </Link>
          ) : (
            <UserAvatarWithImage
              userId={authorId} // Will be null/undefined, UserAvatarWithImage might have fallback
              avatarUrl={authorAvatar ?? undefined} 
              username={authorName} 
              size={variant === 'sidebar' ? 'sm' : 'md'} 
            />
          )}
          <div className="ml-3 flex flex-col justify-center">
            {authorId ? (
              <Link 
                to={`/profile/${authorId}`} 
                className={`font-semibold ${variant === 'sidebar' ? 'text-sm' : 'text-base'} text-blue-400 hover:underline`}
                onClick={(e) => e.stopPropagation()}
                target="_blank"
                rel="noopener noreferrer"
              >
                {authorName}
              </Link>
            ) : (
              <span className={`font-semibold ${variant === 'sidebar' ? 'text-sm' : 'text-base'} text-blue-400`}>
                {authorName}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-xs text-black">
            {formatDate(createdAt)}
          </span>
          {variant === 'main' && currentUser && currentUser.id === authorId && !isContentEffectivelyDeleted && (
            <div className="flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className="text-gray-400 hover:text-red-500 p-1 rounded-full transition-colors duration-150"
                aria-label="删除动态"
                disabled={!currentActionId} 
              >
                <FaTrash />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`w-full mt-1 ${variant === 'sidebar' ? 'text-xs' : 'text-sm'} text-gray-900 space-y-2 break-words`}>
        {/* 始终显示分享者自己的评论 (如果有) */}
        {dynamicContentFromData && (
          <div className="prose prose-invert prose-sm max-w-none text-gray-900 link:text-blue-600">
             <TextWithLinks text={dynamicContentFromData} />
          </div>
         )}

         {/* 始终显示分享者自己的图片 (如果有) */}
         {renderImages()}

        {/* 现在处理目标内容或转发内容 */}
        {dynamic.is_repost && dynamic.original_action && variant !== 'timeline' && (
            <div className="mt-1.5 transform transition-all duration-150">
              <QuotedDynamicView 
              dynamic={dynamic.original_action} 
                level={1} 
                forceExpand={forceExpandContent}
                onImageClick={onImageClick}
              onDynamicClick={variant === 'sidebar' && currentActionId ? 
                  () => openTimeline(dynamic as any) : 
                variant === 'main' && onClick && currentActionId ? 
                  () => onClick(currentActionId) : 
                    undefined
                }
              />
            </div>
          )}
          
        {!dynamic.is_repost && ( // 如果是直接分享 (不是转发)
          isContentEffectivelyDeleted ? ( // 检查直接分享的目标是否已删除
            <div className={`p-2 ${variant === 'sidebar' ? 'bg-gray-300' : 'bg-gray-300'} rounded-md`}>
              <p className="text-xs text-red-400 font-normal">{deletedMessage}</p>
            </div>
          ) : (
            // 目标内容未删除，正常渲染 renderTarget (文章/帖子/工具卡片)
            (dynamic.target_type === 'article' || dynamic.target_type === 'post' || dynamic.target_type === 'tool') &&
            renderTarget()
          )
        )}
      </div>

      {(variant === 'main' || variant === 'timeline') && (
        <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-300">
          <div className="flex space-x-3 text-gray-500">
            {/* 点赞按钮 - New Order: 1st */}
            <div className="w-16 flex items-center">
              <button
                className={`flex items-center gap-1 transition ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                onClick={handleLikeToggle}
                disabled={isSubmitting}
                aria-label={isLiked ? '取消点赞' : '点赞'}
              >
                {isLiked ? <FaHeart className="text-sm" /> : <FaRegHeart className="text-sm" />}
                <span 
                  className="text-sm tabular-nums min-w-[18px] text-right"
                >
                  {likeCount > 0 ? likeCount : ''}
                </span>
              </button>
            </div>

            {/* 收藏按钮 - New Order: 2nd */}
            <div className="w-16 flex items-center">
              <button
                className={`flex items-center gap-1 transition ${isCollected ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                onClick={handleCollectToggle}
                disabled={isSubmitting}
                aria-label={isCollected ? '取消收藏' : '收藏'}
              >
                {isCollected ? <FaBookmark className="text-sm" /> : <FaRegBookmark className="text-sm" />}
                <span 
                  className="text-sm tabular-nums min-w-[18px] text-right"
                >
                  {collectCount > 0 ? collectCount : ''}
                </span>
              </button>
            </div>

            {/* 分享按钮 - New Order: 3rd */}
            <div className="w-16 flex items-center">
              <button
                onClick={(e) => { e.stopPropagation(); handleShare(); }}
                className="flex items-center gap-1 hover:text-green-400 transition-colors duration-150"
                aria-label="分享"
              >
                <IoShareSocialOutline className="text-sm" />
                <span 
                  className="text-sm tabular-nums min-w-[18px] text-right"
                >
                  {(dynamic.repost_count || 0) > 0 ? (dynamic.repost_count || 0) : ''}
                </span>
              </button>
            </div>

            {/* 评论按钮 - New Order: 4th */}
            <div className="w-16 flex items-center">
              <div
                className={`flex items-center gap-1 text-gray-400`}
                aria-label="评论数"
              >
                <FaRegComment className="text-sm" />
                <span 
                  className="text-sm tabular-nums min-w-[18px] text-right"
                >
                  {(dynamic.comment_count || 0) > 0 ? (dynamic.comment_count || 0) : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      {isShareModalOpen && (
        <ShareDynamicModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onSubmit={handleShareSubmit}
          comment={shareComment}
          setComment={setShareComment}
          error={submitError}
          isLoading={isSubmitting}
          dynamicToShare={dynamic}
          altText={`转发 ${authorName} 的动态`}
          username={currentUser?.nickname || currentUser?.email?.split('@')[0] || '您'}
        />
      )}
    </div>
  );
});

export default DynamicCard;