/**
 * 此文件定义了 ArticleCard 组件，用于在列表中以卡片形式展示单个文章摘要。
 *
 * 主要功能:
 * - 接收文章数据 (标题、摘要、作者、封面图、链接等) 作为 props。
 * - 以卡片布局展示文章的关键信息。
 * - 提供"查看全文"功能，可直接在卡片内展开完整内容。
 * - 实现评论、点赞、收藏和分享按钮的完整交互功能。
 * - 点击评论按钮可在当前文章卡片右侧显示评论区。
 * - 包含标签、分类、发布时间等信息。
 * - 点击标题跳转到文章详情页的功能，支持在新窗口打开。
 * - 文章内容展开时支持平滑动画过渡。
 * - 评论区使用毛玻璃效果显示在文章卡片右侧适当位置。
 * - 点赞、收藏与分享功能使用TanStack Query实现，确保与文章详情页状态同步。
 * - 采用乐观更新模式处理点赞和收藏状态，提高响应速度和用户体验。
 * - 实现防重复点击保护，避免短时间内重复触发同一操作。
 * - 使用引用值(useRef)跟踪状态，避免状态更新延迟导致的问题。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useMemo, useEffect, lazy, Suspense, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomLink from './CustomLink'; // 导入CustomLink组件
import { extractMediaItems } from '../utils/imageUrl';
import MediaCarousel from './MediaCarousel';
import { motion, AnimatePresence } from 'framer-motion'; // 引入动画组件
import SimpleCommentSection from './SimpleCommentSection'; // 引入简化版评论组件
import { useAuth } from '../context/AuthContext'; // 引入认证上下文
import { useSidebar } from '../contexts/SidebarContext'; // 引入侧边栏上下文
import { toast } from 'react-toastify'; // 引入toast通知
import axios from 'axios'; // 引入axios进行API调用
import { API_BASE_URL } from '../config'; // 引入API基础URL
import '../assets/css/article-card.css'; // 引入文章卡片样式
// 引入 TanStack Query 相关 hooks
import { useQueryClient } from '@tanstack/react-query';
// 导入模态框组件
import Modal from '../components/Modal';
// 导入自定义的点赞和收藏 hooks
import { useLikeArticle, useCollectArticle } from '../hooks/useArticleQueries';
import { useLikePost, useCollectPost } from '../hooks/usePostQueries';
// 导入分享弹窗组件
import ShareDynamicModal from './ShareDynamicModal';
// 引入 lucide-react 图标
import { Share2 } from 'lucide-react';
import type { AuthorProfile } from '../api/articleApi'; // Import AuthorProfile type
import AuthorTooltip from './AuthorTooltip'; // 导入 AuthorTooltip
import { formatDate } from '../utils/formatDate';

// Define the structure for series article links passed as props
interface SeriesArticleLink {
    id: number;
    title: string;
    slug?: string; // Slug might be needed for linking
    series_order?: number; // Optional order
    is_current?: boolean; // Optional flag
    // Add date if you want to display it in the expanded list
    date?: string; 
}

// Revised Tag Colors (avoiding blue)
const tagColorClasses = [
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-teal-100 text-teal-700",    // Added teal
  "bg-cyan-100 text-cyan-700",    // Added cyan
  "bg-lime-100 text-lime-700",    // Added lime
];

// 性能优化：将tagColor函数提取到组件外部，避免每次渲染都重新创建
const getTagColor = (index: number) => tagColorClasses[index % tagColorClasses.length];

// 添加全局评论打开计数器，用于准确追踪评论框状态
if (typeof window !== 'undefined') {
  // 确保window存在（避免SSR问题）
  // 使用dataset存储计数
  if (!document.body.dataset.openCommentsCount) {
    document.body.dataset.openCommentsCount = '0';
  }
}

/**
 * 更新全局评论框计数器
 * 
 * 该函数负责维护页面上打开的评论框数量，用于控制动态栏的位置状态。
 * 当计数为0时，确保移除body上的comments-open类，触发动态栏返回原位。
 * 
 * @param increment - true表示增加计数（评论框打开），false表示减少计数（评论框关闭）
 */
const updateGlobalCommentsCount = (increment: boolean) => {
  if (typeof window !== 'undefined' && document.body) {
    const currentCount = parseInt(document.body.dataset.openCommentsCount || '0', 10);
    
    if (increment) {
      document.body.dataset.openCommentsCount = String(currentCount + 1);
    } else {
      document.body.dataset.openCommentsCount = String(Math.max(0, currentCount - 1));
    }
    
    // 性能优化：减少不必要的日志输出
    // console.log(`评论框计数: ${document.body.dataset.openCommentsCount}`);
    
    // 当计数为0时，确保移除comments-open类
    if (document.body.dataset.openCommentsCount === '0') {
      document.body.classList.remove('comments-open');
      // 立即触发全局事件通知所有评论已关闭
      window.dispatchEvent(new CustomEvent('all-comments-closed'));
    }
  }
};

// 创建一个单独的图片懒加载组件
const ArticleContent = React.memo(({ content }: { content: string }) => {
  // 处理Markdown格式的图片链接
  const processedContent = content
    // 转换Markdown图片为带data-src属性的img标签
    .replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E" data-src="$2" alt="$1" class="lazy-load" style="max-width:100%; display:block; margin:0 auto;">')
    // 处理视频占位符 - YouTube
    .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g, 
      '<div class="iframe-container"><iframe src="https://www.youtube.com/embed/$2" frameborder="0" allowfullscreen></iframe></div>')
    // 处理视频占位符 - Bilibili
    .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g,
      '<div class="iframe-container"><iframe src="https://player.bilibili.com/player.html?bvid=$2&page=1" frameborder="0" allowfullscreen></iframe></div>');
  
  // 图片懒加载处理逻辑
  React.useEffect(() => {
    // 延迟执行，确保内容已渲染
    const timer = setTimeout(() => {
      // 获取所有懒加载图片
      const lazyImages = document.querySelectorAll('.article-content img.lazy-load[data-src]');
      
      // 如果不支持IntersectionObserver，降级处理
      if (!('IntersectionObserver' in window)) {
        lazyImages.forEach(img => {
          const imgEl = img as HTMLImageElement;
          if (imgEl.dataset.src) {
            imgEl.src = imgEl.dataset.src;
            imgEl.classList.add('lazy-loaded');
          }
        });
        return;
      }
      
      // 创建观察者
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.classList.add('lazy-loaded');
              observer.unobserve(img);
            }
          }
        });
      }, {
        rootMargin: '200px 0px', // 提前200px加载
        threshold: 0.01 // 只需要1%可见就开始加载
      });
      
      // 开始观察所有懒加载图片
      lazyImages.forEach(img => observer.observe(img));
      
      // 组件卸载时清理
      return () => {
        observer.disconnect();
      };
    }, 100);
    
    // 清理定时器
    return () => clearTimeout(timer);
  }, []);
  
  // 渲染内容
  return (
    <div 
      className="article-content"
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  );
});

// 使用React.lazy延迟加载组件
const LazyArticleContent = lazy(() => 
  Promise.resolve({
    default: ArticleContent
  })
);

// 性能优化：缓存正则表达式
const imageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
const videoRegex = /\[视频占位符:[^]]+\]/i;
const latexRegex = /\$\$latex[\s\S]*?\$\$/g;
const tagRegex = /<[^>]+>/g;
const htmlEntitiesRegex = /&nbsp;|&lt;|&gt;|&amp;|&quot;|&#39;/g;
const htmlEntities: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'"
};

// --- 新增：从 HTML 获取纯文本预览的辅助函数 ---
/**
 * 从 HTML 字符串提取纯文本并截断以生成预览。
 * @param htmlContent HTML 内容字符串。
 * @param maxLength 最大预览长度，默认为 450。
 * @returns 截断后的纯文本预览。
 */
const getContentPreview = (htmlContent: string | null | undefined, maxLength: number = 450): string => {
  if (!htmlContent) return '';

  // 0. 处理Markdown格式的图片链接，先将它们替换为占位符，避免提取为文本
  let text = htmlContent.replace(imageRegex, '[图片]');

  // 新增：将 LaTeX 公式块替换为占位符
  text = text.replace(latexRegex, '[公式]');

  // 1. 移除脚本和样式标签及其内容
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. 将换行符、段落、列表项等视为可能的断句点（暂时替换为特殊标记，避免直接移除）
  // 替换 <br>, <p>, <li> 等为换行符，以便后续处理
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n'); // div 也可能用于分段

  // 3. 移除所有剩余的 HTML 标签
  text = text.replace(tagRegex, '');

  // 4. 替换 HTML 实体编码（常见的）
  text = text.replace(htmlEntitiesRegex, (match) => htmlEntities[match] || match);

  // 5. 规范化空白字符：将多个空白（包括换行符）压缩成一个空格
  text = text.replace(/\s+/g, ' ').trim();

  // 6. 截断到指定长度
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
};

// --- 新增：预览评论相关接口 ---
interface CommentPreviewUser {
  id: number;
  nickname?: string | null;
  // avatar?: string | null; // 可选，如果要在预览中显示头像
}

interface CommentPreview {
  id: number;
  content: string;
  user: CommentPreviewUser | null;
  like_count?: number; // 新增：点赞数字段，用于排序
  // created_at: string; // 预览通常不需要时间戳
}

interface CommentsPreviewResponse {
  comments: CommentPreview[];
  total?: number; // 可选
  has_more?: boolean; // 可选
  next_cursor?: string; // 可选
}
// --- 结束：预览评论相关接口 ---

interface ArticleCardProps {
  id: number;
  title: string;
  content: string;
  date: string;
  tags?: string[];
  slug?: string;
  seriesArticles?: SeriesArticleLink[] | null;
  series_name?: string | null;
  like_count?: number;
  collect_count?: number;
  share_count?: number;
  comment_count?: number;
  author?: AuthorProfile | null;
  communityType?: 'topic' | 'relationship' | null;
  communitySlug?: string | null;
  communityNameDisplay?: string | null;
  targetType: 'article' | 'post';
  is_liked?: boolean;
  is_collected?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
}

// 使用React.memo包装组件，避免不必要的重渲染
const ArticleCard = React.memo(({
  id,
  title,
  content,
  date,
  tags = [],
  slug = '',
  seriesArticles = null,
  series_name = null,
  like_count = 0,
  collect_count = 0,
  share_count = 0,
  comment_count = 0,
  author = null,
  communityType = null,
  communitySlug = null,
  communityNameDisplay = null,
  targetType,
  is_liked: initialIsLiked,
  is_collected: initialIsCollected,
  like_action_id: initialLikeActionId,
  collect_action_id: initialCollectActionId,
}: ArticleCardProps) => {
  const navigate = useNavigate();
  const [showSeriesCards, setShowSeriesCards] = useState(false);
  // 添加内容展开状态
  const [isExpanded, setIsExpanded] = useState(false);
  // 添加评论区显示状态
  const [showComments, setShowComments] = useState(false);
  // 添加内容加载状态
  const [isContentLoading, setIsContentLoading] = useState(false);
  // 评论按钮引用，用于定位评论区
  const commentBtnRef = useRef<HTMLButtonElement>(null);
  // 文章卡片引用，用于获取位置信息
  const articleCardRef = useRef<HTMLDivElement>(null);
  // 存储评论区位置
  const [commentPosition, setCommentPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  // 获取认证信息
  const auth = useAuth();
  // 获取侧边栏状态
  const { toggleSidebarForComment } = useSidebar();
  // 新增：点赞状态
  const [isLiked, setIsLiked] = useState(initialIsLiked || false);
  // 新增：实时点赞数
  const [likesCount, setLikesCount] = useState(like_count || 0);
  // 新增：收藏状态
  const [isCollected, setIsCollected] = useState(initialIsCollected || false);
  // 新增：实时收藏数
  const [collectsCount, setCollectsCount] = useState(collect_count || 0);
  // 唯一ID，用于标识当前文章卡片的评论区
  const cardId = useMemo(() => `article-card-${id}`, [id]);
  // 添加连接线引用
  const connectionLineRef = useRef<SVGSVGElement>(null);
  
  // 格式化日期显示，将ISO格式的时间戳格式化为"年/月/日 时:分"的格式
  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
      return dateString;
    }
  };
  
  // 分享相关状态
  const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
  const [shareComment, setShareComment] = useState('');
  const [shareCount, setShareCount] = useState(share_count || 0);
  // 添加isSubmittingAction状态
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  // 添加分享错误状态
  const [shareError, setShareError] = useState<string | null>(null);
  
  // --- 新增：预览评论状态 ---
  const [previewComments, setPreviewComments] = useState<CommentPreview[] | null>(null);
  const [currentPreviewCommentIndex, setCurrentPreviewCommentIndex] = useState<number>(0);
  const [isLoadingPreviewComments, setIsLoadingPreviewComments] = useState<boolean>(false);
  // --- 结束：预览评论状态 ---
  
  // QueryClient 实例，用于缓存管理
  const queryClient = useQueryClient();
  
  // 添加refs以跟踪前一个状态，避免循环依赖
  const isLikedRef = useRef(false);
  const isCollectedRef = useRef(false);

  // 根据 targetType 选择合适的 hooks
  const articleLikeMutation = useLikeArticle(targetType === 'article' ? slug : undefined);
  const articleCollectMutation = useCollectArticle(targetType === 'article' ? slug : undefined);
  const postLikeMutation = useLikePost();
  const postCollectMutation = useCollectPost();

  // 文章详情和点赞/收藏状态追踪变量
  const [likeActionId, setLikeActionId] = useState<number | null>(initialLikeActionId ?? null);
  const [collectActionId, setCollectActionId] = useState<number | null>(initialCollectActionId ?? null);

  // 提取媒体项
  const mediaItems = useMemo(() => {
    if (!content) return [];
    return extractMediaItems(content);
  }, [content]);

  // 生成文章链接：根据是否在社区中确定正确的URL
  const articleLink = useMemo(() => {
    if (!slug) return `/article/${id}`;
    
    // 如果有社区信息，则生成社区专用链接
    if (communityType && communitySlug) {
      if (communityType === 'topic') {
        return `/community/topic/${communitySlug}/posts/${slug}`;
      } else if (communityType === 'relationship') {
        return `/community/relationship-topic/${communitySlug}/posts/${slug}`;
      }
    }
    
    // 默认链接
    return `/article/${slug}`;
  }, [id, slug, communityType, communitySlug]);

  // --- 新增：获取预览评论 ---
  useEffect(() => {
    // 仅当文章存在评论、评论区未打开、且有文章ID时获取
    if (id && comment_count && comment_count > 0 && !showComments) {
      const fetchPreviewComments = async () => {
        setIsLoadingPreviewComments(true);
        try {
          // 根据targetType选择不同的API路径
          let apiUrl = '';
          if (targetType === 'article') {
            // 文章评论API路径
            apiUrl = `${API_BASE_URL}/api/original-comments/articles/${id}/comments?sort_by=latest&limit=10`;
          } else if (targetType === 'post') {
            // 帖子评论API路径
            apiUrl = `${API_BASE_URL}/api/posts/${id}/comments?sort_by=latest&limit=10`;
          } else {
            throw new Error(`Unsupported targetType: ${targetType}`);
          }
          
          const response = await axios.get<CommentsPreviewResponse>(apiUrl, {
            headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
          });

          // 处理API响应，提取评论数据
          let commentsData: CommentPreview[] = [];
          if (response.data) {
            if (targetType === 'article') {
              // 文章评论API返回的是直接的评论数组
              commentsData = response.data.comments || [];
              
              // 确保文章评论数据格式匹配预期的CommentPreview格式
              commentsData = commentsData.map(comment => {
                return {
                  id: comment.id,
                  content: comment.content,
                  user: comment.user ? {
                    id: comment.user.id,
                    nickname: comment.user.nickname
                  } : null,
                  // 处理后端返回的不同字段名：优先使用likes_count，后备使用like_count
                  like_count: (comment as any).likes_count || (comment as any).like_count || 0
                } as CommentPreview;
              });
            } else if (targetType === 'post') {
              // 帖子评论API返回的是 { comments: [...] } 格式
              commentsData = response.data.comments || [];
              // 确保评论数据格式匹配预期的CommentPreview格式
              commentsData = commentsData.map(comment => {
                // 使用类型断言让TypeScript接受这个对象
                return {
                  id: comment.id,
                  content: comment.content,
                  user: comment.user ? {
                    id: comment.user.id,
                    nickname: comment.user.nickname
                  } : null,
                  // 处理后端返回的不同字段名：优先使用likes_count，后备使用like_count
                  like_count: (comment as any).likes_count || (comment as any).like_count || 0
                } as CommentPreview;
              });
            }
          }

          if (commentsData.length > 0) {
            // 1. 过滤掉已删除的评论
            const validComments = commentsData.filter(
              comment => comment.content !== "[该评论已删除]" && comment.content?.trim() !== ""
            );

            // 2. 按点赞数降序排序 (确保 like_count 存在且是数字)
            const sortedComments = validComments.sort((a, b) => 
              (b.like_count || 0) - (a.like_count || 0)
            );

            // 3. 取点赞数最高的最多5条作为预览
            const topComments = sortedComments.slice(0, 5);

            if (topComments.length > 0) {
              setPreviewComments(topComments);
              setCurrentPreviewCommentIndex(0); // 重置到第一条
            } else {
              setPreviewComments(null); // 没有有效评论
            }
          } else {
            setPreviewComments(null); // 没有评论或返回空数组
          }
        } catch (error) {
          setPreviewComments(null);
        } finally {
          setIsLoadingPreviewComments(false);
        }
      };
      fetchPreviewComments();
    } else {
      // 如果条件不满足（例如评论区已打开），则清除预览评论
      if (previewComments !== null) { // 避免不必要的重复设置
        setPreviewComments(null);
      }
    }
  }, [id, auth.token, comment_count, showComments, previewComments === null, targetType]); // 添加targetType到依赖项
  // --- 结束：获取预览评论 ---

  // --- 新增：定时切换预览评论 ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!showComments && previewComments && previewComments.length > 0) {
      timer = setInterval(() => {
        setCurrentPreviewCommentIndex(prevIndex => {
          if (previewComments.length <= 1) return 0; // 如果只有一条或没有评论，则不切换或保持在0
          let nextIndex;
          do {
            nextIndex = Math.floor(Math.random() * previewComments.length);
          } while (nextIndex === prevIndex); // 确保下一条与当前不同
          return nextIndex;
        });
      }, 10000); // 每10秒切换一次
    }
    return () => {
      clearInterval(timer); // 组件卸载或依赖变化时清除定时器
    };
  }, [previewComments, showComments]);
  // --- 结束：定时切换预览评论 ---

  // 监听全局评论打开/关闭事件
  useEffect(() => {
    /**
     * 处理其他文章卡片评论打开事件
     * 当其他卡片的评论被打开时，关闭当前卡片的评论，确保同时只有一个评论框
     */
    const handleOtherCommentOpened = (e: CustomEvent) => {
      const openedCardId = e.detail?.cardId;
      // 如果是其他卡片的评论打开了，我们要关闭当前卡片的评论
      if (openedCardId && openedCardId !== cardId && showComments) {
        setShowComments(false);
      }
    };

    /**
     * 响应检查评论是否打开的事件
     * 当系统需要检查哪些评论是打开状态时，当前卡片会回应自己的状态
     */
    const handleCheckCommentsOpen = () => {
      if (showComments) {
        // 通知系统当前有评论是打开的
        window.dispatchEvent(new CustomEvent('comment-is-open', { 
          detail: { cardId } 
        }));
      }
    };
    
    /**
     * 处理全部评论关闭事件，确保动态栏回到原位
     * 当所有评论框都被关闭时，确保动态栏平滑回到原位
     */
    const handleAllCommentsClosed = () => {
      // 获取动态栏元素
      const dynamicFeed = document.getElementById('dynamic-feed');
      const dynamicFeedContainer = document.querySelector('.dynamic-feed-container');
      
      if (dynamicFeed) {
        // 确保移除任何可能的强制重置类
        dynamicFeed.classList.remove('force-reset');
        dynamicFeed.classList.remove('reset-transform');
        
        if (dynamicFeedContainer) {
          (dynamicFeedContainer as HTMLElement).classList.remove('reset-transform');
        }
        
        // 确保移除comments-open类，允许CSS过渡效果生效
        document.body.classList.remove('comments-open');
        
        // 移除记录的最后打开评论信息
        delete document.body.dataset.lastCommentOpenTime;
        delete document.body.dataset.lastOpenCommentId;
      }
    };

    window.addEventListener('comment-opened', handleOtherCommentOpened as EventListener);
    window.addEventListener('check-comments-open', handleCheckCommentsOpen);
    window.addEventListener('all-comments-closed', handleAllCommentsClosed);
    
    return () => {
      window.removeEventListener('comment-opened', handleOtherCommentOpened as EventListener);
      window.removeEventListener('check-comments-open', handleCheckCommentsOpen);
      window.removeEventListener('all-comments-closed', handleAllCommentsClosed);
    };
  }, [cardId, showComments]);

  /**
   * 管理评论区打开/关闭状态，控制动态栏移动
   * 
   * 该效果负责：
   * 1. 当评论打开时：添加comments-open类到body元素，触发动态栏右移
   * 2. 当评论关闭时：检查是否还有其他评论打开，如无则移除classes
   * 3. 发布自定义事件通知其他组件评论状态变化
   * 4. 在评论关闭时确保动态栏平滑回到原位
   */
  useEffect(() => {
    if (showComments) {
      // 打开评论区时，发布事件
      const openEvent = new CustomEvent('comment-opened', { detail: { cardId } });
      window.dispatchEvent(openEvent);
      document.body.classList.add('comments-open');
      toggleSidebarForComment?.(true);
      
      // 记录当前评论打开时间戳，用于判断是否是最后一个关闭的评论
      document.body.dataset.lastCommentOpenTime = Date.now().toString();
      document.body.dataset.lastOpenCommentId = cardId;
    } else {
      // 关闭评论区时，检查是否还有其他评论区打开
      setTimeout(() => {
        const event = new CustomEvent('check-comments-open');
        let hasOpenComments = false;
        
        const tempListener = (e: Event) => { 
          hasOpenComments = true;
          // 记录最后响应的评论ID
          const customEvent = e as CustomEvent;
          if (customEvent.detail?.cardId) {
            document.body.dataset.lastOpenCommentId = customEvent.detail.cardId;
          }
        };
        window.addEventListener('comment-is-open', tempListener);
        window.dispatchEvent(event);
        
        setTimeout(() => {
          window.removeEventListener('comment-is-open', tempListener);
          if (!hasOpenComments) {
            // 确保通过计数器也确认所有评论框已关闭
            const openCount = parseInt(document.body.dataset.openCommentsCount || '0', 10);
            if (openCount <= 0) {
              // 确保移除comments-open类
              document.body.classList.remove('comments-open');
              toggleSidebarForComment?.(false);
              
              // 重置计数器
              document.body.dataset.openCommentsCount = '0';
              
              // 派发自定义事件通知动态栏可以回到原位
              window.dispatchEvent(new CustomEvent('all-comments-closed'));
              
              // 移除记录的最后打开评论信息
              delete document.body.dataset.lastCommentOpenTime;
              delete document.body.dataset.lastOpenCommentId;
            }
          }
        }, 50);
      }, 50);
    }
  }, [showComments, cardId, toggleSidebarForComment]);

  /**
   * 更新评论区位置，使其显示在文章卡片右侧
   * 根据文章卡片的位置和屏幕尺寸计算评论区的最佳位置
   */
  const updateCommentPosition = useCallback(() => {
    if (!articleCardRef.current || !showComments) return;
    
    const cardRect = articleCardRef.current.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    
    // 获取窗口宽度和动态栏位置
    const windowWidth = window.innerWidth;
    const dynamicFeedEl = document.getElementById('dynamic-feed');
    const dynamicFeedLeft = dynamicFeedEl ? 
      dynamicFeedEl.getBoundingClientRect().left : 
      windowWidth - 100;
    
    // 计算可用空间和最佳评论区宽度
    // 限制最小宽度为320px，最大宽度为可用空间的0.9倍或500px(取小)
    const spaceAfterCard = dynamicFeedLeft - cardRect.right - 40; // 40px是最小间距
    const commentWidth = Math.min(
      Math.max(320, spaceAfterCard * 0.9), 
      500
    );
    
    // 确保评论区不会显示在视窗外
    const commentLeft = Math.min(
      cardRect.right + scrollLeft + 20, // 常规位置：卡片右侧20px
      windowWidth - commentWidth - 20 + scrollLeft // 屏幕右侧边界保留20px边距
    );
    
    // 设置评论区显示在文章卡片右侧，垂直居中
    setCommentPosition({
      top: cardRect.top + scrollTop, // 与卡片顶部对齐
      left: commentLeft,
      width: commentWidth,
      height: Math.max(cardRect.height, 400) // 评论区最小高度400px
    });
    
    // 滚动到评论区位置，确保评论区可见
    window.scrollTo({
      top: cardRect.top + scrollTop - 20, // 向上偏移20px，留出一点间距
      behavior: 'smooth'
    });
  }, [showComments]);
  
  // 监听窗口大小和滚动事件，保持评论区位置更新
  useEffect(() => {
    if (showComments) {
      // 立即更新评论区位置
      updateCommentPosition();
      
      // 延迟200ms再次更新位置，确保布局稳定后再定位
      const timer = setTimeout(updateCommentPosition, 200);
      
      // 监听窗口大小变化，重新计算评论区位置
      window.addEventListener('resize', updateCommentPosition);
      // 监听滚动事件，保持评论区位置同步
      window.addEventListener('scroll', updateCommentPosition, { passive: true });
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateCommentPosition);
        window.removeEventListener('scroll', updateCommentPosition);
      };
    }
  }, [showComments, updateCommentPosition]);

  // 检查登录状态
  const checkAuthStatus = useCallback(() => {
    if (!auth.token) {
      toast.warning('请先登录后再操作');
      return false;
    }
    return true;
  }, [auth.token]);

  // 获取初始点赞和收藏状态 - 使用统一的API
  useEffect(() => {
    if (auth.token && slug) {
      // 获取文章详情，包含点赞和收藏状态
      axios.get(`${API_BASE_URL}/api/articles/slug/${slug}`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      })
      .then(response => {
        const article = response.data;
        // 设置点赞状态
        setIsLiked(article.is_liked || false);
        isLikedRef.current = article.is_liked || false;
        setLikeActionId(article.like_action_id);
        
        // 设置收藏状态
        setIsCollected(article.is_collected || false);
        isCollectedRef.current = article.is_collected || false;
        setCollectActionId(article.collect_action_id);
        
        // 更新计数（以防后端数据更新）
        if (article.like_count !== undefined) setLikesCount(article.like_count);
        if (article.collect_count !== undefined) setCollectsCount(article.collect_count);

      })
      .catch(error => {
        // console.error('获取文章状态失败', error);
      });
    }
  }, [slug, auth.token]);
  
  // 点赞功能实现 - 使用 TanStack Query
  const handleLike = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.token) {
      toast.error("请先登录后再点赞！");
      return;
    }

    const previousLiked = isLiked;
    const previousLikeActionId = likeActionId;
    const previousLikeCount = likesCount;

    setIsLiked(!previousLiked);
    setLikeActionId(null); 
    setLikesCount(prevCount => !previousLiked ? prevCount + 1 : Math.max(0, prevCount - 1));

    try {
        let mutationResponse;
        if (targetType === 'article') {
            if (id === undefined) throw new Error("文章ID无效");
            await articleLikeMutation.mutateAsync({ 
                articleId: id,
                token: auth.token,
                currentActionState: previousLiked,
                currentActionId: previousLikeActionId,
            });
        } else if (targetType === 'post') {
            if (id === undefined || !slug) throw new Error("帖子ID或Slug无效");
            mutationResponse = await postLikeMutation.mutateAsync({ 
                postId: id,
                token: auth.token,
                currentLikeState: previousLiked,
                currentLikeActionId: previousLikeActionId,
                postSlug: slug, 
            });
            
            if (mutationResponse) {
                if (typeof mutationResponse.is_liked === 'boolean') setIsLiked(mutationResponse.is_liked);
                setLikeActionId(mutationResponse.action_id !== undefined ? mutationResponse.action_id : null);
                if (typeof mutationResponse.target_likes_count === 'number') setLikesCount(mutationResponse.target_likes_count);
            }
        } else {
            throw new Error("未知目标类型，无法点赞。");
        }
    } catch (error: any) {
        setIsLiked(previousLiked);
        setLikeActionId(previousLikeActionId);
        setLikesCount(previousLikeCount);
    }
}, [
    id, auth.token, targetType, slug, // Removed optional chaining from auth.token if auth is guaranteed
    isLiked, likesCount, likeActionId, 
    articleLikeMutation, postLikeMutation 
]);

  // 收藏功能实现 - 使用 TanStack Query
  const handleCollect = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.token) {
      toast.error("请先登录后再收藏！");
      return;
    }
    
    const previousCollected = isCollected;
    const previousCollectActionId = collectActionId;
    const previousCollectCount = collectsCount;

    setIsCollected(!previousCollected);
    setCollectActionId(null);
    setCollectsCount(prevCount => !previousCollected ? prevCount + 1 : Math.max(0, prevCount - 1));

    try {
        let mutationResponse;
        if (targetType === 'article') {
            if (id === undefined) throw new Error("文章ID无效");
            await articleCollectMutation.mutateAsync({ 
                articleId: id,
                token: auth.token,
                currentActionState: previousCollected,
                currentActionId: previousCollectActionId,
            });
        } else if (targetType === 'post') {
            if (id === undefined || !slug) throw new Error("帖子ID或Slug无效");
            mutationResponse = await postCollectMutation.mutateAsync({ 
                postId: id,
                token: auth.token,
                currentCollectState: previousCollected,
                currentCollectActionId: previousCollectActionId,
                postSlug: slug,
            });

            if (mutationResponse) {
                if (typeof mutationResponse.is_collected === 'boolean') setIsCollected(mutationResponse.is_collected);
                setCollectActionId(mutationResponse.action_id !== undefined ? mutationResponse.action_id : null);
                if (typeof mutationResponse.target_collects_count === 'number') setCollectsCount(mutationResponse.target_collects_count);
            }
        } else {
            throw new Error("未知目标类型，无法收藏。");
        }
    } catch (error: any) {
        setIsCollected(previousCollected);
        setCollectActionId(previousCollectActionId);
        setCollectsCount(previousCollectCount);
    }
}, [
    id, auth.token, targetType, slug, 
    isCollected, collectsCount, collectActionId, 
    articleCollectMutation, postCollectMutation
]);
  
  // 监听点赞mutation成功
  useEffect(() => {
    // 移除此处的 toast 调用，因为 usePostQueries/useArticleQueries 中的 onSuccess 会处理
}, [articleLikeMutation.isSuccess, postLikeMutation.isSuccess, targetType, isLiked]); // isLiked 仍然作为依赖，因为原始的 toast 消息依赖它

  // 监听收藏mutation成功
  useEffect(() => {
    // 移除此处的 toast 调用，因为 usePostQueries/useArticleQueries 中的 onSuccess 会处理
}, [articleCollectMutation.isSuccess, postCollectMutation.isSuccess, targetType, isCollected]); // isCollected 仍然作为依赖

  // 分享功能实现 - 显示分享选项而非模态框
  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!auth.token) {
      toast.warn('请先登录再操作');
      return;
    }
    
    // 打开分享弹窗
    setIsSharePanelOpen(true);
  }, [auth.token]);

  // 处理分享提交
  const handleShareSubmit = async (comment: string, images: string[] = []) => {
    if (!auth.token) {
      toast.warn('请先登录再分享');
      return;
    }
    
    setIsSubmittingAction(true);
    setShareError(null);
    
    const payload = {
      action_type: 'share' as 'share', // 显式类型
      target_type: 'article' as 'article', // 显式类型
      target_id: id,
      content: comment,
      images: images // 添加图片数组
    };
    
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/actions`,
        payload,
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      
      if (response.status === 201) {
        setIsSharePanelOpen(false);
        setShareComment('');
        setShareCount(prev => prev + 1);
        toast.success('分享成功！');
        
        // 同步缓存
        queryClient.setQueryData(['articleDetails', slug], (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            share_count: (oldData.share_count || 0) + 1
          };
        });
      } else {
        throw new Error(response.data?.error || '分享操作失败');
      }
    } catch (err: any) {
      console.error('分享操作失败:', err);
      const errorMessage = err.response?.data?.error || err.message || '分享失败';
      setShareError(errorMessage);
      toast.error(`分享失败: ${errorMessage}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 关闭分享弹窗
  const handleCloseShare = () => {
    setIsSharePanelOpen(false);
    setShareError(null);
  };

  // 同步refs和状态
  useEffect(() => {
    isLikedRef.current = isLiked;
  }, [isLiked]);

  useEffect(() => {
    isCollectedRef.current = isCollected;
  }, [isCollected]);

  const handleCardClick = (e: React.MouseEvent) => {
    // 如果内容已展开或评论区已显示,阻止导航
    if (isExpanded || showComments) {
      e.stopPropagation();
      return;
    }
    
    // Prevent navigation if click is on series button OR within the media carousel OR an action button
    if (
        (e.target as HTMLElement).closest('.series-toggle-button') || 
        (e.target as HTMLElement).closest('.media-carousel-container') ||
        (e.target as HTMLElement).closest('.action-button') // 阻止点击交互按钮时的导航
    ) {
        return;
    }
    // navigate(articleLink); // 移除: 取消卡片点击时的当前页导航
  };

  const handleSeriesClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSeriesCards(!showSeriesCards);
  };

  // 展开/收起内容的动画设置
  const contentAnimationProps = {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: { opacity: 0, height: 0 },
    transition: { 
      duration: 0.5, 
      ease: [0.16, 1, 0.3, 1], // 使用更平滑的曲线函数
      opacity: { duration: 0.4 }
    }
  };

  // 添加展开/折叠内容的处理函数
  const handleExpandToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded) {
      // 展开内容前，设置加载状态
      setIsContentLoading(true);
      
      // 使用一个非常短的延迟，以便浏览器能处理状态变化
      setTimeout(() => {
        setIsExpanded(true);
        // 给DOM更新的时间，然后移除加载状态
        requestAnimationFrame(() => {
          setIsContentLoading(false);
        });
      }, 20);
    } else {
      // 添加平滑的收起动画
      const contentElement = articleCardRef.current?.querySelector('.article-content');
      if (contentElement) {
        contentElement.classList.add('content-closing');
        // 短暂延迟后再实际关闭内容，给动画时间执行
        setTimeout(() => {
          setIsExpanded(false);
          setTimeout(() => {
            contentElement.classList.remove('content-closing');
          }, 50);
        }, 80);
      } else {
        setIsExpanded(false);
      }
    }
  };

  /**
   * 处理评论按钮点击事件
   * 
   * 功能：
   * 1. 切换评论区显示状态
   * 2. 更新全局评论计数器
   * 3. 控制动态栏的位置（通过CSS类触发）
   * 4. 确保动态栏先移动再显示评论区
   */
  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // 防止事件冒泡
    
    if (showComments) {
      // 如果已经显示评论，则直接关闭
      setShowComments(false);
      updateGlobalCommentsCount(false);
    } else {
      // 如果要打开评论，先触发动态栏移动，再显示评论区
      
      // 1. 更新全局评论计数
      updateGlobalCommentsCount(true);
      
      // 2. 添加 comments-open 类到 body 元素，触发动态栏移动
      document.body.classList.add('comments-open');
      
      // 3. 短暂延迟后再显示评论区，确保动态栏已经开始移动
      setTimeout(() => {
        setShowComments(true);
        
        // 4. 滚动到当前文章位置确保可见
        const rect = articleCardRef.current?.getBoundingClientRect();
        if (rect) {
          window.scrollTo({
            top: window.scrollY + rect.top - 20,
            behavior: 'smooth'
          });
        }
      }, 50); // 50毫秒的延迟，足够CSS过渡开始但又不会让用户感到明显延迟
    }
  };

  /**
   * 关闭评论区的处理函数
   */
  const handleCloseComments = () => {
    setShowComments(false);
    updateGlobalCommentsCount(false);
  };
  
  const isSeries = seriesArticles && seriesArticles.length > 0;

  // Restore original classes, add card-interactive
  const cardWrapperClasses = `
    bg-gray-800/8 backdrop-blur-xl rounded-lg overflow-hidden
    transition-all duration-300 cursor-pointer
    group relative z-10 card-interactive border border-white/5
  `;

  // Tooltip State
  const [isAuthorTooltipVisible, setIsAuthorTooltipVisible] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleAuthorMouseEnter = (e: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    // 直接显示工具提示，无需检查bio和tags
    setIsAuthorTooltipVisible(true);
  };

  const handleAuthorMouseLeave = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setIsAuthorTooltipVisible(false);
    }, 300); // 增加延迟时间，避免鼠标快速移动时工具提示闪烁
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const contentPreview = useMemo(() => getContentPreview(content, 450), [content]);

  /**
   * 评论区动态栏交互特效 - 监听其他文章卡片的评论状态变化
   * 当其他文章卡片的评论被打开/关闭时，自动更新当前文章卡片的显示状态
   */
  useEffect(() => {
    // 当显示评论时，自动滚动到文章位置
    if (showComments) {
      const rect = articleCardRef.current?.getBoundingClientRect();
      if (rect) {
        // 确保文章在视口中可见
        const scrollTop = window.scrollY + rect.top - 50;
        window.scrollTo({
          top: scrollTop > 0 ? scrollTop : 0,
          behavior: 'smooth'
        });
        
        // 添加类以标记评论正在显示
        document.body.classList.add('showing-comments');
        if (articleCardRef.current) {
          articleCardRef.current.classList.add('showing-comments');
        }
      }
    } else {
      // 评论关闭时移除类
      document.body.classList.remove('showing-comments');
      if (articleCardRef.current) {
        articleCardRef.current.classList.remove('showing-comments');
      }
    }
    
    return () => {
      // 组件卸载时清理
      document.body.classList.remove('showing-comments');
    };
  }, [showComments]);

  return (
    <div className={`mb-2 relative article-card-wrapper ${showComments ? 'expanded-with-comments' : ''}`} ref={articleCardRef} id={cardId}> 
      {/* Restore original Stacking effect for series articles */}
      {isSeries && (
        <>
          {/* Offset background card 1 */}
          <div className="absolute inset-0 bg-gray-800/8 backdrop-blur-md rounded-lg shadow-md transform translate-x-1 translate-y-1 -z-10 border border-white/5"></div>
          {/* Offset background card 2 */}
          <div className="absolute inset-0 bg-gray-800/5 backdrop-blur-md rounded-lg shadow-sm transform translate-x-2 translate-y-2 -z-20 border border-white/3"></div>
        </>
      )}
      
      {/* 文章卡片容器 */}
      <div
        onClick={handleCardClick} 
        className={cardWrapperClasses}
        style={{
          boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
          transform: 'scale(1)',
          transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease-out'
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.transform = 'translateY(-8px) scale(1.02)';
          el.style.boxShadow = '0 15px 25px rgba(0, 0, 0, 0.3)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.3)';
        }}
      >
        <div className="p-4 transition-all duration-300">
          {/* Top section: Title, Tags and Meta */}
          <div className="mb-2">
            {/* 第一部分：标题和可能的社区名称标签 */}
            <div className="flex items-center gap-x-2 mb-1">
                <CustomLink 
                to={articleLink}
                  className="text-lg md:text-xl font-semibold text-gray-100 hover:text-blue-400 transition-colors duration-200 leading-tight"
                forceNewTab={true}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                }}
                >
                  {title}
                </CustomLink>
              {/* 社区名称标签 - 如果希望它紧随标题，可以保留在这里 */}
                {communityNameDisplay && (
                  communityType && communitySlug ? (
                    <Link 
                      to={communityType === 'topic' ? `/community/topic/${communitySlug}` : `/community/relationship-topic/${communitySlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-medium px-2 py-0.5 rounded bg-green-800/60 text-green-100 hover:bg-green-700/80 transition-colors duration-150 whitespace-nowrap flex-shrink-0"
                      title={`前往 ${communityNameDisplay} 社区`}
                    >
                      {communityNameDisplay}
                    </Link>
                  ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-800/60 text-green-100 whitespace-nowrap flex-shrink-0">
                      {communityNameDisplay}
                    </span>
                  )
                )}
              </div>
              
            {/* 第二部分：标签、系列按钮和日期，始终在标题下方 */}
            {/* 这个 div 包含所有应该在标题下方的元信息 */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
              {/* 普通标签 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag, index) => (
                    <span 
                      key={index}
                      className="inline-block bg-blue-900/40 text-blue-200 px-2 py-0.5 rounded text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              
              {/* 系列文章按钮 */}
              {isSeries && (
                 <button 
                    onClick={handleSeriesClick}
                    className="series-toggle-button flex-shrink-0 px-2 py-0.5 bg-purple-900/60 hover:bg-purple-900/80 text-purple-200 text-xs rounded-md flex items-center transition-colors"
                  >
                    {series_name ? `系列文章：${series_name}` : '系列文章'}
                    <svg 
                      className={`ml-1 w-3 h-3 transition-transform duration-300 ${showSeriesCards ? 'transform rotate-180' : ''}`} 
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
              )}
            
              {/* 日期 - 移到这个统一的元信息行 */}
              <span className="whitespace-nowrap">{formatDate(date)}</span>
            </div>
          </div>
          
          {/* 条件渲染：内容预览/完整内容/加载状态 */}
          <AnimatePresence mode="wait">
            {isContentLoading ? (
              <motion.div 
                className="flex justify-center items-center py-4 text-gray-400"
                key="loading"
                {...contentAnimationProps}
              >
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle 
                    className="opacity-25" 
                    cx="12" cy="12" r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                    fill="none"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>内容加载中...</span>
              </motion.div>
            ) : !isExpanded ? (
              // 预览模式 - 显示文本预览和媒体内容
              <motion.div key="preview" {...contentAnimationProps}>
                {/* 文本预览 with Author Nickname */}
                {content && (
                  <p className="text-gray-300 text-sm line-clamp-6 mb-3">
                    {author && author.nickname && (
                      <span 
                        className="relative inline-block mr-1"
                        onMouseEnter={handleAuthorMouseEnter}
                        onMouseLeave={handleAuthorMouseLeave}
                      >
                        <Link 
                          to={`/profile/${author.username || author.id}`} // Prefer username if available
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 hover:text-blue-300 font-semibold"
                        >
                          {author.nickname}：
                        </Link>
                        {/* 确保工具提示始终显示 */}
                        <AuthorTooltip
                          nickname={author.nickname}
                          bio={author.bio}
                          tags={Array.isArray(author.tags) ? author.tags : (author.tags ? [author.tags] : null)}
                          isVisible={isAuthorTooltipVisible}
                          avatar={author.avatar}
                        />
                      </span>
                    )}
                    {getContentPreview(content)} 
                  </p>
                )}
                
                {/* 媒体预览 - 仅在非展开状态显示 */}
                {mediaItems.length > 0 && (
                  <div className="media-carousel-container mb-3">
                    <MediaCarousel mediaItems={mediaItems} />
                  </div>
                )}
                
                {/* "查看全文"按钮 - 移到媒体内容下方 */}
                {content && (
                  <button 
                    onClick={handleExpandToggle}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-3 flex items-center action-button"
                  >
                    查看全文
                    <svg 
                      className="ml-1 w-4 h-4 transition-transform duration-300"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </motion.div>
            ) : (
              // 展开模式 - 完整内容
              <motion.div key="fullContent" {...contentAnimationProps}>
                {/* 使用Suspense和React.lazy延迟加载文章内容 */}
                <Suspense fallback={<div className="text-gray-400 text-center py-2">加载内容中...</div>}>
                  <div className="text-gray-300 text-sm mb-3">
                    <LazyArticleContent content={content} />
                  </div>
                </Suspense>
                
                {/* "收起内容"按钮 */}
                <button 
                  onClick={handleExpandToggle}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-3 flex items-center action-button"
                >
                  收起内容
                  <svg 
                    className="ml-1 w-4 h-4 transition-transform duration-300 transform rotate-180"
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
            
          {/* 交互按钮 - 改造为可点击按钮 */}
          <div className={`flex items-center space-x-4 text-sm text-gray-400 pt-2 border-t border-gray-700/30`}> 
              {/* 点赞按钮 - 改为心形图标 */}
              {likesCount !== undefined && (
                <button 
                  className={`flex items-center transition-colors action-button ${isLiked ? 'text-red-500' : 'hover:text-red-400'}`}
                  title={`${likesCount} 个赞`}
                  onClick={handleLike}
                  disabled={targetType === 'article' ? articleLikeMutation.isPending : postLikeMutation.isPending}
                >
                  {isLiked ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 ${targetType === 'article' ? articleLikeMutation.isPending : postLikeMutation.isPending ? 'animate-pulse' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 ${targetType === 'article' ? articleLikeMutation.isPending : postLikeMutation.isPending ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
              )}
                  <span>{likesCount}</span>
                </button>
              )}
              
              {/* 收藏按钮 */}
              {collectsCount !== undefined && (
                <button 
                  className={`flex items-center transition-colors action-button ${isCollected ? 'text-yellow-500' : 'hover:text-yellow-400'}`}
                  title={`${collectsCount} 个收藏`}
                  onClick={handleCollect}
                  disabled={targetType === 'article' ? articleCollectMutation.isPending : postCollectMutation.isPending}
                >
                  {isCollected ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 ${targetType === 'article' ? articleCollectMutation.isPending : postCollectMutation.isPending ? 'animate-pulse' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 ${targetType === 'article' ? articleCollectMutation.isPending : postCollectMutation.isPending ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                     <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  )}
                  <span>{collectsCount}</span>
                </button>
              )}
              
              {/* 分享按钮 */}
              {shareCount !== undefined && (
                <button 
                  className="flex items-center hover:text-green-400 transition-colors action-button" 
                  title={`${shareCount} 次分享`}
                  onClick={handleShare}
                  disabled={isSubmittingAction}
                >
                  <Share2 className={`h-4 w-4 mr-1 ${isSubmittingAction ? 'animate-pulse' : ''}`} />
                  <span>{shareCount}</span>
                </button>
              )}
              
              {/* 评论按钮 */}
               {comment_count !== undefined && (
                <div className="relative flex items-center"> {/* 包裹评论按钮和预览 */}
                  <button 
                    ref={commentBtnRef}
                    className={`flex items-center transition-colors action-button ${showComments ? 'text-blue-400' : 'hover:text-blue-400'}`}
                    title={`${comment_count} 条评论`}
                    onClick={handleCommentClick}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                       <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                     </svg>
                     <span>{comment_count}</span>
                  </button>

                  {/* 新增：预览评论显示区域 */}
                  {!showComments && previewComments && previewComments.length > 0 && (
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentPreviewCommentIndex} // 确保评论切换时动画重新触发
                        className="ml-2 text-xs text-gray-300 pointer-events-none whitespace-nowrap overflow-hidden max-w-xs" // 增加最大宽度以显示更多内容
                        style={{ textOverflow: 'ellipsis' }} // 确保省略号生效
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 0.85, x: 0 }} // 调整透明度使其更明显
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                      >
                        <span className="font-medium text-gray-200">{previewComments[currentPreviewCommentIndex]?.user?.nickname || '匿名'}:</span>
                        <span className="ml-1">{previewComments[currentPreviewCommentIndex]?.content}</span>
                      </motion.div>
                    </AnimatePresence>
                  )}
                  {/* 调试信息 */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="hidden">
                      <p>调试: showComments={String(showComments)}, isLoadingPreviewComments={String(isLoadingPreviewComments)}, 
                         previewComments={previewComments ? `有${previewComments.length}条` : '无'}, 
                         targetType={targetType}</p>
                    </div>
                  )}
                  {/* 结束：预览评论显示区域 */}
                </div>
              )}
            </div>
            {/* End Interaction Counts */}
        </div>
      </div>
      
      {/* Restore Expanded Series List Section */} 
      {isSeries && (
        <div 
          className={`relative z-0 mt-1 space-y-1 overflow-hidden transition-all duration-500 ease-in-out ${showSeriesCards ? 'max-h-[500px] opacity-100 pt-1' : 'max-h-0 opacity-0'}`}
        >
          {seriesArticles.map((article, index) => (
            <CustomLink 
              key={article.id}
              to={article.slug ? `/article/${article.slug}` : '#'} 
              className={`
                block bg-gray-800/10 backdrop-blur-xl rounded-lg p-2 shadow-sm 
                hover:bg-gray-700/20 transition-colors duration-200
                transform opacity-100 card-interactive border border-white/5
              `}
              style={{ 
                 transitionDelay: `${index * 50}ms`,
                 marginLeft: `1rem` 
              }}
            >
              <div className="flex justify-between items-center">
                <h3 className={`text-sm truncate ${article.is_current ? 'text-blue-400 font-semibold' : 'text-white'}`}>
                   {article.series_order ? `${article.series_order}. ` : ''}{article.title}
                </h3>
                {article.date && <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{article.date}</span>}
              </div>
            </CustomLink>
          ))}
        </div>
      )}
      
      {/* 评论区 - 修改为跟随文章卡片位置显示 */}
      {showComments && (
        <div className="comment-container" style={{
          position: "absolute",
          top: 0,
          left: "100%",
          height: "100%",
          width: "450px",
          zIndex: 50,
          marginLeft: "20px" 
        }}>
          {/* 简化连接线，降低存在感 */}
          <div 
            className="connection-hint" 
            style={{
              position: "absolute",
              top: "50%",
              left: 0, 
              width: "1px", 
              height: "20px",
              transform: "translateY(-50%)",
              background: "rgba(74, 222, 128, 0.05)",
              borderRadius: "0 1px 1px 0"
            }}
          />
          <div 
            className="comments-glass-panel custom-scrollbar"
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              maxHeight: "100%",
              borderRadius: "0.75rem",
              background: "transparent", 
              overflow: "hidden"
            }}
          >
            <SimpleCommentSection
              targetId={id}
              targetType={targetType}
              slug={slug}
              token={auth.token}
              currentUser={auth.user}
              onClose={handleCloseComments}
              isVisible={showComments}
            />
          </div>
        </div>
      )}
      
      {/* 分享弹窗 */}
      {isSharePanelOpen && (
        <Modal isOpen={isSharePanelOpen} onClose={handleCloseShare} maxWidthClass="max-w-xl">
          <ShareDynamicModal
            isOpen={isSharePanelOpen} 
            onClose={handleCloseShare}
            onSubmit={handleShareSubmit}
            comment={shareComment}
            setComment={setShareComment}
            error={shareError}
            isLoading={isSubmittingAction}
            dynamicToShare={{ id, title, content: content || '' }} 
            username={auth.user?.nickname || auth.user?.email?.split('@')[0] || '您'} 
            altText={`分享文章: ${title}`}
          />
        </Modal>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较逻辑，只有关键属性变化时才重新渲染
  return (
    prevProps.id === nextProps.id &&
    prevProps.title === nextProps.title &&
    prevProps.content === nextProps.content &&
    prevProps.like_count === nextProps.like_count &&
    prevProps.collect_count === nextProps.collect_count &&
    prevProps.share_count === nextProps.share_count &&
    prevProps.comment_count === nextProps.comment_count &&
    prevProps.is_liked === nextProps.is_liked &&
    prevProps.is_collected === nextProps.is_collected
  );
});

export default ArticleCard;