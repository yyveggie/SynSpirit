/**
 * ArticlePage.tsx
 * 
 * 功能注释：
 * 定义展示单个文章详情页面的 React 组件。
 * 
 * 主要功能:
 * - 从 URL 参数获取文章 slug。
 * - 使用 TanStack Query 的自定义 Hook (`useArticleDetails`) 获取并缓存文章详情。
 * - 处理文章内容的渲染，包括 LaTeX 和 iframe 居中。
 * - 显示作者信息、发布时间、标签、系列文章等元数据。
 * - 管理用户对文章的点赞、收藏、分享操作及状态（本地状态管理，通过初始数据填充）。
 * - 如果当前用户是作者，提供编辑和删除按钮。
 * - 集成 `CommentSection` 组件用于显示和处理评论。
 * - 集成实时聊天功能 (Socket.IO)。
 * - 显示相关工具推荐。
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext'; // 引入 useSidebar
import axios from 'axios';
import io, { Socket } from 'socket.io-client';
// @ts-ignore
import 'katex/dist/katex.min.css';
import Modal from '../components/Modal';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import CommentSection from '../components/CommentSection'; // 确保 CommentSection 引入
import { motion } from 'framer-motion'; // 导入 motion
// --- TanStack Query Imports (Add these) ---
import { useQueryClient } from '@tanstack/react-query';
// --- Import Custom Hook ---
import { useArticleDetails, useLikeArticle, useCollectArticle } from '../hooks/useArticleQueries'; // Import the hook
// --- 导入分享组件 ---
import ShareDynamicModal from '../components/ShareDynamicModal';
import { Share2 } from 'lucide-react';
import ArticleDetailSkeleton from '../components/Skeletons/ArticleDetailSkeleton'; // 1. 导入骨架屏
import AuthorTooltip from '../components/AuthorTooltip'; // 导入 AuthorTooltip 组件
import { fixImageUrl, handleImageLoadError } from '../utils/imageProxy'; // 添加图片处理工具导入

// --- 接口定义 (确保包含 nickname) ---
interface UserInfo { 
  id: number;
  nickname?: string | null;
  email?: string;
  avatar?: string | null; // 添加avatar属性
}
// --- 结束接口定义 ---

// Add Tool interface back
interface Tool {
  id: number;
  name: string;
  description?: string; 
  category_id?: number; 
  slug?: string; 
}

// --- 新增：聊天消息接口 ---
interface ChatMessage {
  username: string;
  message: string;
  room: string; // 确认房间
  timestamp?: string; // 可选时间戳
}
// --- 结束新增 ---

// 添加User接口定义
interface User {
  id: number;
  username: string;
  nickname?: string | null;
  email?: string;
  avatar?: string | null; // 添加avatar属性
}

const ArticlePage: React.FC = () => {
  const queryClient = useQueryClient(); // 将 useQueryClient() 移动到这里
  const { slug } = useParams<{ slug: string }>();
  // Removed useState for article, loading, error
  const { isSidebarOpen } = useSidebar();
  const [featuredTools, setFeaturedTools] = useState<Tool[]>([]);
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const SERIES_WINDOW_SIDE = 5;
  const [visibleSeriesStart, setVisibleSeriesStart] = useState(0);
  const [visibleSeriesEnd, setVisibleSeriesEnd] = useState(-1);
  const [totalSeriesCount, setTotalSeriesCount] = useState(0);
  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(-1);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareComment, setShareComment] = useState('');
  // --- Tooltip State ---
  const [tooltipData, setTooltipData] = useState<{ nickname: string; bio?: string | null; tags?: string[] | null; avatar?: string | null } | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  // --- Add back shareCount state --- 
  const [shareCount, setShareCount] = useState(0);
  // Keep interaction states locally
  const [isSubmittingAction, setIsSubmittingAction] = useState(false); // Keep for share/delete actions
  // Keep chat states locally
  const socketRef = useRef<Socket | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const [isRealtimeChatOpen, setIsRealtimeChatOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [commentBoxPosition, setCommentBoxPosition] = useState({ x: 0, y: 0 });

  // --- Use TanStack Query Hooks --- 
  const { 
    data: article, 
    isLoading: loading, // Rename isLoading to loading
    isError, 
    error: queryError 
  } = useArticleDetails(slug, token);

  // --- Instantiate Mutation Hooks ---
  const likeMutation = useLikeArticle(slug);
  const collectMutation = useCollectArticle(slug);

  // Determine effective error state
  const effectiveError = isError 
    ? (queryError as Error)?.name === "RateLimitExceeded" 
      ? "请求频率过高，请等待片刻后刷新页面。" 
      : (queryError as Error)?.message || '获取文章详情失败，请稍后重试。' 
    : null;

  // Add debug function to log content info right before render - 移动到组件顶部
  useEffect(() => {
    if (article?.content) {
      
      // Count Markdown images 
      const imageMatches = article.content.match(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g);
      
      if (imageMatches) {
        imageMatches.forEach((match, index) => {
          console.log(`图片${index+1}:`, match);
        });
      }
      
      // Preview processed content
      const processed = processContentForVideos(article.content);
    }
  }, [article?.content]);

  // --- Initialize shareCount from article data --- 
  useEffect(() => {
      if (article) {
          setShareCount(article.share_count || 0);
      } else {
          setShareCount(0);
      }
  }, [article]);

  // --- Socket.IO useEffect (remains the same, depends on slug, user, isRealtimeChatOpen) --- 
  useEffect(() => {
    if (!slug || !isRealtimeChatOpen) return;
    let hasLoggedError = false;
    console.log('初始化Socket.IO连接...');
    const baseUrl = 'http://localhost:5001';
    console.log('Socket.IO服务器地址:', baseUrl);
    socketRef.current = io(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'], 
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000
    });
    const socket = socketRef.current;
    socket.on('connect', () => {
      console.log('Socket连接成功:', socket.id);
      setIsConnected(true);
      hasLoggedError = false;
      const username = user?.nickname || user?.email || 'Anonymous';
      socket.emit('join', { room: slug, username: username });
      console.log(`加入聊天室: ${slug} 用户名: ${username}`);
    });
    socket.on('status', (data: { msg: string }) => {
      console.log('服务器状态信息:', data.msg);
      setChatMessages(prev => [...prev, { username: 'System', message: data.msg, room: slug }]);
    });
    socket.on('receive_message', (data: ChatMessage) => {
      if (data.room === slug) {
        setChatMessages(prev => [...prev, data]);
      }
    });
    socket.on('connect_error', (err) => {
      if (!hasLoggedError) {
        console.warn('聊天服务连接错误，将自动重试:', err.message);
        hasLoggedError = true;
      }
      setIsConnected(false);
    });
    socket.on('disconnect', (reason) => {
      console.log('Socket断开连接:', reason);
      setIsConnected(false);
    });
    return () => {
      if (socket && socket.connected) {
        console.log(`离开聊天室: ${slug}`);
        const username = user?.nickname || user?.email || 'Anonymous';
        socket.emit('leave', { room: slug, username: username });
        console.log('断开Socket连接...');
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [slug, user, isRealtimeChatOpen]);

  // --- Chat auto-scroll useEffect (remains the same) --- 
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // --- Featured Tools useEffect (remains the same, no dependency on article data) --- 
  useEffect(() => {
    const loadFeaturedTools = async () => {
      try {
        // Use axios if preferred, ensure API_BASE_URL is correct
        const response = await axios.get<{ tools: Tool[] }>(`${API_BASE_URL}/api/tools?limit=6&sort_by=popularity&sort_order=desc`);
        setFeaturedTools(response.data.tools || []);
      } catch (error) {
        console.error('加载热门工具失败:', error);
      }
    };
    loadFeaturedTools();
  }, []); // Empty dependency array, fetch only once

  // --- Series Navigation useEffect (remains the same, depends on article?.series_articles) --- 
  useEffect(() => {
    if (article?.series_articles && article.series_articles.length > 0) {
      const totalCount = article.series_articles.length;
      const currentIndex = article.series_articles.findIndex(a => a.is_current);
      setTotalSeriesCount(totalCount);
      setCurrentSeriesIndex(currentIndex);
      if (currentIndex !== -1) {
        const start = Math.max(0, currentIndex - SERIES_WINDOW_SIDE);
        const end = Math.min(totalCount - 1, currentIndex + SERIES_WINDOW_SIDE);
        setVisibleSeriesStart(start);
        setVisibleSeriesEnd(end);
      } else {
        setVisibleSeriesStart(0);
        setVisibleSeriesEnd(Math.min(totalCount - 1, (SERIES_WINDOW_SIDE * 2)));
      }
    } else {
      setVisibleSeriesStart(0);
      setVisibleSeriesEnd(-1);
      setTotalSeriesCount(0);
      setCurrentSeriesIndex(-1);
    }
  }, [article?.series_articles]);

  // --- Expand Series Handlers (remain the same) --- 
  const showEarlierSeries = () => {
    const newStart = Math.max(0, visibleSeriesStart - (SERIES_WINDOW_SIDE * 2 + 1));
    setVisibleSeriesStart(newStart);
  };
  const showLaterSeries = () => {
    const newEnd = Math.min(totalSeriesCount - 1, visibleSeriesEnd + (SERIES_WINDOW_SIDE * 2 + 1));
    setVisibleSeriesEnd(newEnd);
  };

  // --- formatDate Helper (remains the same) --- 
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: 'long', // Changed from 'numeric' to 'long' for '月'
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // --- getImageUrl Helper --- 
  const getImageUrl = (imagePath: string | null): string | undefined => {
    if (!imagePath) return undefined;
    
    // 直接使用/api/upload/proxy/image确保使用代理，绕过全局设置
    if (imagePath.startsWith('http')) {
      const proxyDomain = '/api/upload/proxy/image';
      const queryParams = new URLSearchParams();
      queryParams.append('url', encodeURIComponent(imagePath));
      
      return `${proxyDomain}?${queryParams.toString()}`;
    }
    
    // 非http URL直接返回（如相对路径或data:URLs）
    return imagePath;
  };

  // --- LaTeX Rendering useEffect (remains the same, depends on article?.content) --- 
  useEffect(() => {
    if (article?.content && contentRef.current) {
      const processImages = () => {
        if (!contentRef.current) return;
        
        // 1. 处理已有的img标签
        const images = contentRef.current.querySelectorAll('img');
        images.forEach(img => {
          const currentSrc = img.getAttribute('src');
          const dataOriginalSrc = img.getAttribute('data-original-src');

          if (dataOriginalSrc) { // If data-original-src exists, it's our source of truth for the original URL
            console.log(`[ArticlePage useEffect img dataOriginalSrc] URL before fixImageUrl: ${dataOriginalSrc}`);
            const desiredSrc = fixImageUrl(dataOriginalSrc);
            if (img.src !== desiredSrc) {
              console.log(`(ArticlePage useEffect) Correcting src for ${dataOriginalSrc.substring(0, 50)}... to ${desiredSrc.substring(0, 50)}...`);
              img.src = desiredSrc;
              // Ensure onerror is re-attached if we are changing src, pointing to the true original URL
              img.onerror = () => {
                handleImageLoadError(dataOriginalSrc, img);
                return true;
              };
            }
          } else if (currentSrc && currentSrc.startsWith('http')) { // No data-original-src, and current src is an http URL
            console.log(`(ArticlePage useEffect) Initial processing for ${currentSrc.substring(0, 50)}...`);
            img.setAttribute('data-original-src', currentSrc);
            console.log(`[ArticlePage useEffect img currentSrc] URL before fixImageUrl: ${currentSrc}`);
            img.src = fixImageUrl(currentSrc);
            img.onerror = () => {
              handleImageLoadError(currentSrc, img);
              return true;
            };
          }

          // 基本样式应用
          if (img.className === '') img.className = 'markdown-image';
          if (img.style.maxWidth === '') img.style.maxWidth = '100%';
          if (img.style.margin === '') img.style.margin = '10px auto';
          if (img.style.display === '') img.style.display = 'block';
        });

        // 2. 处理Markdown格式图片（从文本节点动态创建）
        const allElements = contentRef.current.querySelectorAll('*:not(script):not(style)'); // Avoid processing script/style tags
        allElements.forEach(el => {
          if (el.childNodes && el.childNodes.length > 0) {
            Array.from(el.childNodes).forEach(node => { // Iterate over a copy if replacing nodes
              if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const text = node.textContent;
                const imgRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
                let match;
                let lastIndex = 0;
                const fragment = document.createDocumentFragment();
                let hasMatch = false;
                
                while ((match = imgRegex.exec(text)) !== null) {
                  hasMatch = true;
                  const matchStart = match.index;
                  const matchEnd = matchStart + match[0].length;
                  
                  if (matchStart > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
                  }
                  
                  const img = document.createElement('img');
                  const originalUrlFromMarkdown = match[2]; // 图片URL from regex
                  console.log(`(ArticlePage useEffect) Processing Markdown image from text node: ${originalUrlFromMarkdown.substring(0, 50)}...`);
                  
                  img.setAttribute('data-original-src', originalUrlFromMarkdown);
                  console.log(`[ArticlePage useEffect markdown] URL before fixImageUrl: ${originalUrlFromMarkdown}`);
                  img.src = fixImageUrl(originalUrlFromMarkdown);
                  img.alt = match[1];
                  img.className = 'markdown-image';
                  img.style.maxWidth = '100%';
                  img.style.margin = '10px auto';
                  img.style.display = 'block';
                  img.onerror = () => {
                    handleImageLoadError(originalUrlFromMarkdown, img);
                    return true;
                  };
                  fragment.appendChild(img);
                  lastIndex = matchEnd;
                }
                
                if (hasMatch) {
                  if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                  }
                  node.parentNode?.replaceChild(fragment, node);
                }
              }
            });
          }
        });
      };

      processImages();

      // LaTeX渲染逻辑 (保持不变)
      // ... (KaTeX and observer logic) ...
    }
  }, [article?.content, fixImageUrl]); // fixImageUrl 作为依赖

  // --- iframe centering useEffect (使用更宽松的选择器处理视频) ---
  useEffect(() => {
    if (contentRef.current && article?.content) {
      // 查找所有的视频iframe元素，无论来源
      const iframes = contentRef.current.querySelectorAll('iframe');
      
      // 处理每个找到的iframe
      iframes.forEach(iframe => {
        // 跳过已经处理过的iframe
        if (iframe.parentElement?.classList.contains('video-processed')) return;
        
        // 确保iframe有一个清晰的宽高比例容器
        const currentParent = iframe.parentElement;
        if (!currentParent) return;
        
        // 重置当前父元素的样式
        if (currentParent instanceof HTMLElement) {
          currentParent.style.cssText = '';
          currentParent.className = '';
        }

        // 创建新的视频容器div
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container video-processed';
        videoContainer.style.cssText = 'width: 100%; max-width: 800px; margin: 2em auto; position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;';
        
        // 设置iframe样式
        if (iframe instanceof HTMLIFrameElement) {
          iframe.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 12px;';
        }
        
        // 用新容器替换原来的父元素
        if (currentParent.parentElement) {
          // 创建外层容器以彻底隔离Prose样式
          const outerContainer = document.createElement('div');
          outerContainer.className = 'not-prose';
          outerContainer.style.cssText = 'all: initial; display: block; text-align: center; width: 100%; margin: 2em 0; font-family: inherit; color: inherit;';
          
          // 构建DOM结构: outerContainer > videoContainer > iframe
          videoContainer.appendChild(iframe.cloneNode(true));
          outerContainer.appendChild(videoContainer);
          currentParent.parentElement.replaceChild(outerContainer, currentParent);
        }
      });

    }
  }, [article?.content]);

  // --- Refactor Interaction Handlers --- 
  const handleLikeToggle = () => {
    if (!article || !token) {
      toast.warn('请先登录再操作');
      return;
    }
    // 调用 mutation，传递简化后的变量
    likeMutation.mutate({
        articleId: article.id, // 传递文章 ID
        token: token,
        // 直接从 article 读取当前状态和 action ID
        currentActionState: article.is_liked || false, 
        currentActionId: article.like_action_id || null 
    });
  };
  
  const handleCollectToggle = () => {
    if (!article || !token) {
      toast.warn('请先登录再操作');
      return;
    }
    // 调用 mutation，传递简化后的变量
    collectMutation.mutate({
        articleId: article.id, // 传递文章 ID
        token: token,
        // 直接从 article 读取当前状态和 action ID
        currentActionState: article.is_collected || false, 
        currentActionId: article.collect_action_id || null 
    });
  };

  const handleShareSubmit = async (content: string, images: string[] = []) => {
    if (!article || !token) {
      toast.warn('请先登录再分享');
      return;
    }
    
    setIsSubmittingAction(true);
    
    // 对于ArticlePage组件，我们处理的始终是article类型
    const payload = {
      action_type: 'share',
      target_type: 'article', // 在文章详情页中，始终是分享文章
      target_id: article.id,
      content: content,
      images: images // 添加图片数据
    };
    
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/actions`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (res.status === 201) {
        toast.success('分享成功!');
        setIsShareModalOpen(false);
        setShareComment('');
        // 确保查询失效被调用，以便从后端获取更新后的计数
        queryClient.invalidateQueries({ queryKey: ['articleDetails', slug] });
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || '分享失败，请稍后重试';
      toast.error(`分享失败: ${errorMsg}`);
      console.error(err);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeleteArticle = async () => {
    if (!article || !token || !user || !article.author || user.id !== article.author.id) return; // Added check for article.author
    const articleSlug = article.slug;
    const articleTitle = article.title;
    if (window.confirm(`您确定要删除文章 \"${articleTitle}\" 吗？此操作无法撤销。`)) {
      setIsSubmittingAction(true); // Indicate loading state for delete
      try {
        console.log(`开始删除文章 "${articleTitle}" (slug: ${articleSlug})`);
        console.log('使用的API端点:', `${API_BASE_URL}/api/articles/${articleSlug}`);
        
        const response = await axios.delete(`${API_BASE_URL}/api/articles/${articleSlug}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('删除请求响应:', response.status, response.data);
        
        if (response.status === 200 || response.status === 204) {
          console.log('删除成功，将跳转到文章列表页面');
          toast.success('文章已成功删除！');
          navigate('/articles');
        } else {
          throw new Error(response.data?.error || "删除文章失败，状态码: " + response.status);
        }
      } catch (err: any) {
        console.error(`删除文章 ${articleSlug} 失败:`, err);
        console.error('错误详情:', err.response?.data || err.message);
        toast.error(`删除失败: ${err.response?.data?.error || err.message}`);
      } finally {
          setIsSubmittingAction(false);
      }
    }
  };

  const handleSendChatMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (currentChatMessage.trim() && socketRef.current && slug && isConnected) {
      const username = user?.nickname || user?.email || 'Anonymous';
      const messageData: ChatMessage = {
        username: username,
        message: currentChatMessage,
        room: slug,
        timestamp: new Date().toISOString()
      };
      socketRef.current.emit('send_message', messageData);
      setCurrentChatMessage(''); 
    } else {
      console.warn("无法发送消息: 消息为空, 或 Socket 未连接/slug 缺失.");
      if (!isConnected) {
        toast.error("聊天服务器未连接，无法发送消息。"); // User feedback
      }
    }
  };
  
  // 在 return 之前准备并打印调试信息
  const isUserLoggedIn = !!user;
  const articleAuthor = article?.author;
  const canShowButtons = isUserLoggedIn && !!articleAuthor && user.id === articleAuthor.id;

  // 2. 在 return 语句的开头检查加载状态
  if (loading) {
    return <ArticleDetailSkeleton />;
  }

  if (isError || !article) { // 处理错误或文章未找到的情况
    return (
      <div 
        className="flex flex-col items-center justify-center min-h-screen text-white p-4"
        style={{backgroundColor: 'var(--bg-base-color)', backgroundImage: 'var(--bg-gradient)'}} // 使用CSS变量保持背景一致
      >
        <h2 className="text-2xl font-semibold mb-4">无法加载文章</h2>
        {/* 使用上面定义的 effectiveError */}
        <p className="text-gray-400 mb-8">{effectiveError || '文章可能已被删除或链接无效。'}</p>
        <button
          onClick={() => navigate(-1)} // 返回上一页
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors"
        >
          返回
        </button>
      </div>
    );
  }

  // --- 处理视频的辅助函数 --- 
  const processContentForVideos = (htmlContent: string) => {
    if (!htmlContent) return '';
    
    // 添加Markdown图片格式的正则表达式 - 更精确的版本
    const markdownImageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
    
    // YouTube视频占位符的正则表达式
    const videoPlaceholderRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g;
    
    // Bilibili视频占位符的正则表达式
    const bilibiliPlaceholderRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g;
    
    // 注意：首先处理Markdown格式的图片，这样它们就不会被其他处理干扰
    let processedContent = htmlContent.replace(markdownImageRegex, (match, altText, imgUrl) => {
      // 验证URL
      if (!imgUrl) return match;
      
      console.log(`[ArticlePage processContentForVideos] URL before fixImageUrl: ${imgUrl}`);
      // 使用 fixImageUrl 来获取代理 URL
      const processedUrl = fixImageUrl(imgUrl);
      
      // 构建响应式图片标签，添加data-original-src属性用于错误处理
      return `<img src="${processedUrl}" data-original-src="${imgUrl}" alt="${altText || '图片'}" class="mx-auto my-4 max-w-full rounded-lg shadow-lg markdown-image" style="display: block; max-width: 100%; margin: 10px auto;" onerror="if(this.getAttribute('data-original-src')){window.handleImageLoadError?.(this.getAttribute('data-original-src'),this)}" />`;
    });
    
    // 处理YouTube视频
    processedContent = processedContent.replace(videoPlaceholderRegex, (match, originalUrl, videoId) => {
      if (!originalUrl || !videoId) return match;
      
      const embedUrl = `https://www.youtube.com/embed/${videoId}`;
      return `
        <figure class="not-prose my-8">
          <div class="aspect-w-16 aspect-h-9 relative rounded-lg overflow-hidden">
            <iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="absolute inset-0 w-full h-full rounded-lg shadow-xl"></iframe>
          </div>
          <figcaption class="text-center text-sm text-gray-500 mt-2">YouTube 视频</figcaption>
        </figure>
      `;
    });
    
    // 处理Bilibili视频
    processedContent = processedContent.replace(bilibiliPlaceholderRegex, (match, originalUrl, videoId) => {
      if (!originalUrl || !videoId) return match;
      
      const embedUrl = `https://player.bilibili.com/player.html?bvid=${videoId}&page=1&high_quality=1&danmaku=0`;
      return `
        <figure class="not-prose my-8">
          <div class="aspect-w-16 aspect-h-9 relative rounded-lg overflow-hidden">
            <iframe src="${embedUrl}" frameborder="0" scrolling="no" allowfullscreen class="absolute inset-0 w-full h-full rounded-lg shadow-xl"></iframe>
          </div>
          <figcaption class="text-center text-sm text-gray-500 mt-2">Bilibili 视频</figcaption>
        </figure>
      `;
    });

    return processedContent;
  };

  // --- Success State Rendering (Main JSX) --- 
  return (
    <motion.div 
      className="article-detail-container bg-transparent text-black min-h-screen" // 修改为黑色文本
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }} 
    >
      {/* 移除左侧偏移，使用固定宽度和水平居中实现整体居中布局 */}
      <main className="flex-1 transition-all duration-300 ease-in-out overflow-y-auto px-4 sm:px-6 lg:px-4 py-10 w-full">
        <div className="max-w-4xl mx-auto">
          {/* 文章封面 - 移到标题之前 */}
          {article.cover_image && (
            <div className="mb-8 aspect-video overflow-hidden rounded-lg shadow-2xl bg-gray-800">
              <img 
                src={getImageUrl(article.cover_image)} 
                alt={article.title} 
                className="w-full h-full object-cover" 
                onError={(e) => (e.currentTarget.style.display = 'none')} 
              />
            </div>
          )}

          {/* 文章头部信息 */}
          <header className="mb-10">
            {/* 标题单独一行 - 更新字体大小 */}
            <div className="mb-6">
              <h1 className="text-3xl md:text-4xl font-bold text-black break-words"> {/* 更改为黑色标题 */}
                {article.title}
              </h1>
            </div>
            
            {/* 作者信息、阅读量、标签、按钮在同一行，两端对齐 */}
            <div className="flex flex-wrap justify-between items-center text-sm text-gray-600 gap-x-4 gap-y-2">
              {/* 左侧：作者信息、发布日期、阅读量、标签（移到这里）- 更新样式和结构 */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1"> {/* Reduced gap-x to 3 */}
                {/* 作者头像和名字 - 使用 AuthorTooltip 包裹 */}
                <div 
                  className="flex items-center relative" // 添加 relative 定位
                  onMouseEnter={() => {
                    if (article?.author) {
                      setTooltipData({
                        nickname: article.author.nickname || article.author.email?.split('@')[0] || '匿名用户',
                        bio: article.author.bio, // 直接访问，类型已更新
                        tags: article.author.tags, // 直接访问，类型已更新
                        avatar: article.author.avatar // 直接访问，类型已更新
                      });
                      setIsTooltipVisible(true);
                    }
                  }}
                  onMouseLeave={() => {
                    setIsTooltipVisible(false);
                  }}
                >
                  <img 
                    src={article.author?.avatar || `https://via.placeholder.com/40/374151/FFFFFF?text=${(article.author?.nickname || article.author?.email || 'U').charAt(0).toUpperCase()}`} /* Updated to use article.author.avatar */
                    alt={article.author?.nickname || article.author?.email || '作者头像'} 
                    className="w-6 h-6 rounded-full mr-2 object-cover bg-gray-700" /* Updated avatar size */
                  />
                  {/* 作者链接 */}
                  {article.author?.id ? (
                    <Link 
                      to={`/profile/${article.author.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline" /* 更新链接颜色 */
                    >
                      {article.author.nickname || article.author.email?.split('@')[0] || '匿名用户'}
                    </Link>
                  ) : (
                    <span className="text-blue-600">{/* 更新颜色 */}
                      {article.author?.nickname || article.author?.email?.split('@')[0] || '匿名用户'}
                    </span>
                  )}
                </div>
                
                {/* 分隔线 */}
                <span className="hidden sm:inline text-gray-500">|</span> {/* 更改为竖线分隔符 */}
                
                {/* 发布日期 */}
                <span>{formatDate(article.created_at)}</span>
                
                {/* 分隔线和阅读量 */}
                {article.view_count !== undefined && (
                  <>
                    <span className="hidden sm:inline text-gray-500">|</span> {/* 更改为竖线分隔符 */}
                    <span>阅读量: {article.view_count}</span>
                  </>
                )}
                
                {/* 标签（从右侧移到这里） */}
                {article.tags && article.tags.length > 0 && (
                  <>
                    <span className="hidden sm:inline text-gray-500">|</span> {/* 添加竖线分隔符 */}
                    <div className="flex flex-wrap gap-2">
                      {article.tags.map(tag => (
                        <span key={tag} className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600 text-xs font-semibold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 右侧：只保留编辑和删除按钮 */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                {/* 编辑和删除按钮 */}
                {canShowButtons && (
                  <div className="flex items-center space-x-4 flex-shrink-0">
                    <button
                      onClick={() => navigate(`/edit-article/${slug}`)}
                      className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-800
                                 bg-transparent 
                                 rounded-full transition-all duration-200 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="编辑文章"
                      disabled={loading || isSubmittingAction} 
                    >
                      编辑
                    </button>
                    <button
                      onClick={handleDeleteArticle}
                      className="px-4 py-1.5 text-sm font-medium text-white 
                                 bg-gray-600 hover:bg-gray-700
                                 rounded-full transition-all duration-200 
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="删除文章"
                      disabled={loading || isSubmittingAction} 
                    >
                      {isSubmittingAction && (location.pathname.includes(slug || '不可能匹配到的slug')) ? 
                          (<svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : 
                          ( "删除" )
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* 文章内容 */}
          <div 
            ref={contentRef} 
            className="prose prose-lg max-w-none article-content-actual mt-10 text-black 
                       prose-headings:text-black prose-headings:font-semibold prose-headings:mb-6 prose-headings:mt-10
                       prose-p:mb-6 prose-p:leading-loose
                       prose-a:text-blue-600 hover:prose-a:text-blue-800 
                       prose-strong:text-black prose-code:text-pink-600 prose-code:bg-gray-100 prose-code:p-1 prose-code:rounded
                       prose-blockquote:border-l-blue-500 prose-blockquote:text-gray-700 prose-blockquote:not-italic prose-blockquote:my-8
                       prose-img:rounded-md prose-img:shadow-lg prose-img:max-w-full prose-img:mx-auto prose-img:my-8
                       prose-table:border-gray-300 prose-th:bg-gray-100 prose-th:text-black prose-td:border-gray-300
                       prose-ul:list-disc prose-ul:ml-5 prose-ul:my-6 prose-ol:list-decimal prose-ol:ml-5 prose-ol:my-6
                       prose-li:mb-2 prose-li:leading-loose
                       leading-loose"
            dangerouslySetInnerHTML={{ __html: processContentForVideos(article.content) }} 
          />

          {/* 系列文章导航 */}
          {article.series_articles && article.series_articles.length > 0 && (
             <div className="my-12 p-6 bg-gray-100/90 border border-gray-300/50 rounded-lg backdrop-blur-sm shadow-md"> {/* 更新背景样式 */}
               <h3 className="text-lg font-semibold mb-4 text-black">
                 系列: {article.series_name || '未命名系列'}
               </h3>
               {visibleSeriesStart > 0 && (
                 <button
                   onClick={showEarlierSeries}
                   className="text-xs text-blue-600 hover:text-blue-800 mb-2 block transition-colors"
                 >
                   ↑ 显示更早
                 </button>
               )}
               <ul className="space-y-3"> {/* 将系列文章的间距从1.5扩大到3 */}
                 {article.series_articles?.slice(visibleSeriesStart, visibleSeriesEnd + 1).map((seriesArticle, index) => (
                   <li key={seriesArticle.id} className={`text-sm transition-colors duration-150 ${seriesArticle.is_current ? 'font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-1.5' : 'text-gray-700 hover:text-black'}`}>
                     <Link
                       to={`/article/${seriesArticle.slug}`}
                       className="hover:underline flex items-center py-1"
                       title={seriesArticle.title}
                     >
                       <span className="mr-2 w-4 text-right">{seriesArticle.series_order}.</span>
                       <span className="truncate">{seriesArticle.title}</span> 
                     </Link>
                   </li>
                 ))}
               </ul>
               {visibleSeriesEnd < totalSeriesCount - 1 && (
                 <button
                   onClick={showLaterSeries}
                   className="text-xs text-blue-600 hover:text-blue-800 mt-2 block transition-colors"
                 >
                   ↓ 显示后续
                 </button>
               )}
             </div>
           )}

          {/* Comment Section */}
          <div className="mt-16"> {/* 增加评论区上方边距从12到16 */}
            <CommentSection
              targetType="article"
              targetId={article.id}
              apiBaseUrl={API_BASE_URL}
              token={token}
              currentUser={user}
              isLiked={article.is_liked || false}
              isCollected={article.is_collected || false}
              likeCount={article.like_count || 0}
              collectCount={article.collect_count || 0}
              shareCount={shareCount}
              handleLikeToggle={handleLikeToggle}
              handleCollectToggle={handleCollectToggle}
              handleShareClick={() => setIsShareModalOpen(true)}
              isSubmittingAction={likeMutation.isPending || collectMutation.isPending}
            />
          </div>
        </div>
      </main>

      {/* 分享模态框 */}
      {isShareModalOpen && (
        <Modal 
          isOpen={isShareModalOpen} 
          onClose={() => setIsShareModalOpen(false)}
        >
          <ShareDynamicModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            onSubmit={handleShareSubmit}
            comment={shareComment}
            setComment={setShareComment}
            error={null}
            isLoading={isSubmittingAction}
            dynamicToShare={article}
            username={user?.nickname || user?.email?.split('@')[0] || '您'}
            altText={`分享文章: ${article?.title}`}
          />
        </Modal>
      )}

      {/* Author Tooltip */} 
      {tooltipData && (
        <AuthorTooltip 
          nickname={tooltipData.nickname}
          bio={tooltipData.bio}
          tags={tooltipData.tags}
          avatar={tooltipData.avatar}
          isVisible={isTooltipVisible}
        />
      )}
    </motion.div>
  );
};

export default ArticlePage; 