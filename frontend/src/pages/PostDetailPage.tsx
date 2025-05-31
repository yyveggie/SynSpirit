/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * PostDetailPage.tsx
 * 
 * 功能注释：
 * 定义展示单个帖子详情页面的 React 组件。
 * 
 * 主要功能:
 * - 从 URL 参数获取帖子 slug。
 * - 使用 TanStack Query 的自定义 Hook (`usePostDetails`) 获取并缓存帖子详情。
 * - 使用 TanStack Query 的 Mutation Hooks (`useLikePost`, `useCollectPost` from usePostQueries.ts) 处理点赞/收藏操作，包含乐观更新和缓存失效。
 * - 处理帖子内容的渲染，包括 iframe 居中。
 * - 显示作者信息、发布时间、标签、浏览量等元数据。
 * - 管理用户对帖子的分享操作及状态（本地状态管理）。
 * - 如果当前用户是作者，提供编辑和删除按钮。
 * - 集成 `CommentSection` 组件用于显示和处理评论。
 * - 使用 Modal 组件处理分享操作。
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 *
 * --- 重构说明 (重要) ---
 * 此版本已将点赞 (like) 和收藏 (collect) 的状态管理和 API 调用
 * 从本地 useState + 直接 axios 调用迁移至 TanStack Query 的 useMutation。
 * Mutation Hooks (`useLikePost`, `useCollectPost`) 已从外部文件 `../hooks/usePostQueries` 导入。
 * 状态现在直接从 usePostDetails 查询结果中读取，并通过乐观更新和缓存失效保持同步。
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Modal from '../components/Modal';
import CommentSection from '../components/CommentSection';
import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useSidebar } from '../contexts/SidebarContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLikePost, useCollectPost } from '../hooks/usePostQueries';
import PostDetailSkeleton from '../components/Skeletons/PostDetailSkeleton';
// 添加KaTeX相关导入
// @ts-ignore
import katex from 'katex';
import 'katex/dist/katex.min.css';
import ShareDynamicModal from '../components/ShareDynamicModal';
import { User } from '../context/AuthContext';
import AuthorTooltip from '../components/AuthorTooltip';
import { fixImageUrl, handleImageLoadError } from '../utils/imageProxy'; // 添加图片处理工具导入

// 帖子详情数据类型 (保持与 usePostQueries.ts 一致)
interface PostDetails {
  id: number;
  title: string;
  content: string;
  author: { id: number; nickname: string | null; email: string; avatar?: string | null } | null;
  created_at: string;
  updated_at?: string;
  tags?: string[];
  view_count: number;
  slug: string;
  cover_image?: string;
  is_liked?: boolean;
  is_collected?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
  likes_count?: number;
  collects_count?: number;
  share_count?: number;
  category_id?: number | null;
  category_name?: string | null;
  topic_id?: number | null;
  topic_name?: string | null;
  status?: string;
  priority?: number;
  published_at?: string | null;
  summary?: string | null;
}

// --- Custom Hook Definition for fetching post details (remains inside this file for now) ---
const usePostDetails = (postSlug: string | undefined, token: string | null) => {
    const queryKey = ['postDetails', postSlug];

    const fetchPostDetailsAPI = async () => {
        if (!postSlug) throw new Error("无效的帖子标识符");
        console.log(`[usePostDetails][Page] Fetching data for post slug: ${postSlug}`);
        const headers: { [key: string]: string } = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const postApiUrl = `${API_BASE_URL}/api/posts/slug/${postSlug}`;
        console.log(`[usePostDetails][Page][DEBUG] Fetching Post from: ${postApiUrl}`);
        const response = await axios.get<PostDetails>(postApiUrl, { headers });
        console.log("[usePostDetails][Page] Post Data:", response.data);
        return response.data;
    };

    return useQuery<PostDetails, Error>({
        queryKey: queryKey,
        queryFn: fetchPostDetailsAPI,
        enabled: !!postSlug,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 15 * 60 * 1000, // 15 minutes
        retry: (failureCount, error) => {
           if ((error as any)?.response?.status === 404) {
               console.warn(`[usePostDetails][Page] Post not found (404), not retrying.`);
               return false;
           }
           console.warn(`[usePostDetails][Page] Fetch failed (attempt ${failureCount + 1}), retrying... Error:`, error.message);
           return failureCount < 2;
        }
    });
};

const PostDetailPage: React.FC = () => {
  // Ensure postSlug defaults to an empty string if undefined
  const { postSlug = "" } = useParams<{ postSlug: string }>();
  const navigate = useNavigate();
  const { isSidebarOpen } = useSidebar();
  const { token, user } = useAuth();

  // --- Remove useState for like/collect states ---
  // State is now derived directly from the 'post' query data

  // --- Keep useState for share modal, author status, and share count ---
  const [shareCount, setShareCount] = useState(0); // Local state for share count (can be refactored later)
  const [isAuthor, setIsAuthor] = useState(false);
  const [isNewShareModalOpen, setIsNewShareModalOpen] = useState(false);
  const [newShareComment, setNewShareComment] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSubmittingNewShare, setIsSubmittingNewShare] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for content div (iframe centering)
  const queryClient = useQueryClient(); // Get query client instance (needed for optional share invalidation)
  // --- Tooltip State ---
  const [tooltipData, setTooltipData] = useState<{ nickname: string; bio?: string | null; tags?: string[] | null; avatar?: string | null } | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  // --- Use TanStack Query Hook for fetching post details ---
  const {
    data: post,       // The fetched post data (including like/collect status)
    isLoading: loading, // Loading state for the query
    isError,         // Error state for the query
    error: queryError // The error object
   } = usePostDetails(postSlug, token);

  // --- Instantiate the imported Mutation Hooks ---
  const likeMutation = useLikePost();
  const collectMutation = useCollectPost();

  // --- Determine effective error message ---
  const effectiveError = isError ? (queryError instanceof Error ? queryError.message : String(queryError)) || '无法加载帖子内容。' : null;

  // 添加调试信息 - 移到组件顶部
  useEffect(() => {
    if (post?.content) {
      
      // 计算Markdown图片数量
      const imageMatches = post.content.match(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g);
      
      if (imageMatches) {
        imageMatches.forEach((match, index) => {
          console.log(`图片${index+1}:`, match);
        });
      }
      
      // 检查处理后的内容
      const processedContent = processContentForVideos(post.content);
    }
  }, [post?.content]);

  // --- Update useEffect: Set author status and initialize share count based on fetched data ---
  useEffect(() => {
    if (post) {
      // Check if the logged-in user is the author of the post
      setIsAuthor(!!(user && post.author?.id === user.id));
      // Initialize local share count state from fetched post data
      setShareCount(post.share_count || 0);
    } else {
      // Reset states if post data is not available
      setIsAuthor(false);
      setShareCount(0);
    }
  }, [post, user]); // Dependencies: re-run when post data or user changes

  // --- iframe centering useEffect (使用与ArticlePage完全相同的视频处理逻辑) ---
  useEffect(() => {
    if (post?.content && contentRef.current) {
      // --- 增强的内容处理 ---
      // 1. 处理所有iframe和视频
      const iframes = contentRef.current.querySelectorAll('iframe');
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
        videoContainer.style.cssText = 'width: 100%; margin: 2em auto; position: relative; aspect-ratio: 16/9; background: #000; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;';
        
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
      
      // 2. 处理图片标签
      const images = contentRef.current.querySelectorAll('img');
      images.forEach(img => {
        // 处理COS图片URL
        const originalSrc = img.getAttribute('src');
        if (originalSrc && originalSrc.includes('synspirit-test-1313131901.cos.ap-shanghai.myqcloud.com')) {
          img.src = `/api/upload/proxy/image?url=${encodeURIComponent(originalSrc)}`;
          img.onerror = () => { 
              console.warn(`图片代理加载失败: ${originalSrc}`);
          };
        }
        
        // 确保图片标签有基本样式
        if (img.style.maxWidth === '') {
          img.style.maxWidth = '100%';
        }
        if (img.style.margin === '') {
          img.style.margin = '10px auto';
        }
        if (img.style.display === '') {
          img.style.display = 'block';
        }
      });
      
      // 3. 处理Markdown格式图片（![alt](url)）
      const allElements = contentRef.current.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.childNodes && el.childNodes.length > 0) {
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
              const text = node.textContent;
              // 查找Markdown图片格式: ![alt](url)
              const imgRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
              let match;
              let hasMatch = false;
              let lastIndex = 0;
              const fragment = document.createDocumentFragment();
              
              while ((match = imgRegex.exec(text)) !== null) {
                hasMatch = true;
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;
                
                // 添加图片前的文本
                if (matchStart > lastIndex) {
                  fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
                }
                
                // 创建图片元素
                const img = document.createElement('img');
                const originalUrl = match[2]; // 图片URL
                console.log(`(useEffect PostDetail) 处理Markdown图片: ${originalUrl.substring(0, 50)}${originalUrl.length > 50 ? '...' : ''}`);
                
                img.setAttribute('data-original-src', originalUrl);
                img.src = fixImageUrl(originalUrl); // Use fixImageUrl
                
                img.alt = match[1]; // alt文本
                img.className = 'markdown-image';
                img.style.maxWidth = '100%';
                img.style.margin = '10px auto';
                img.style.display = 'block';
                
                // 添加错误处理
                img.onerror = () => {
                  handleImageLoadError(originalUrl, img);
                  return true;
                };
                
                // 添加图片到片段
                fragment.appendChild(img);
                
                // 更新lastIndex
                lastIndex = matchEnd;
              }
              
              // 如果有匹配，替换原始节点
              if (hasMatch) {
                // 添加剩余文本
                if (lastIndex < text.length) {
                  fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                // 替换原始节点
                node.parentNode?.replaceChild(fragment, node);
              }
            }
          });
        }
      });
    }
  }, [post?.content, fixImageUrl]); // 依赖：post内容, fixImageUrl

  // --- LaTeX渲染 useEffect ---
  useEffect(() => {
    if (post?.content && contentRef.current) {
      /**
       * 重要的LaTeX公式渲染函数 - 请勿随意修改！
       * 
       * 此函数使用KaTeX库渲染文章中的LaTeX公式，同时保留公式周围的文本内容。
       * 它采用分段渲染策略，只替换文本中的公式部分，而保留公式前后的普通文本。
       * 
       * 警告：早期实现会替换整个文本节点，导致公式周围的文本内容丢失。
       * 如果修改此函数，必须保证公式周围的文本得以保留，否则会导致编辑时内容异常丢失。
       * 
       * 支持两种公式格式：
       * 1. $$latex ... $$ (指定latex关键字的特殊格式)
       * 2. $$ ... $$ (标准数学公式格式)
       * 
       * @param textNode 待处理的文本节点
       */
      const renderLatex = (textNode: Text) => {
          let nodeContent = textNode.nodeValue || '';
          
          // 定义正则表达式匹配两种类型的LaTeX公式
          // /g标志表示全局匹配，找出文本中所有的公式实例
          const latexBlockRegex = /\$\$latex\s*([\s\S]*?)\s*\$\$/g;  // 匹配 $$latex ... $$ 格式
          const standardBlockRegex = /\$\$([\s\S]*?)\$\$/g;  // 匹配标准 $$ ... $$ 格式
          
          // 创建文档片段，用于保存处理后的内容（包括公式和非公式部分）
          const fragment = document.createDocumentFragment();
          
          // 跟踪处理位置，确保不会丢失公式之间的文本
          let lastIndex = 0;
          let match;
          let hasMatches = false;
          
          // 第一步：优先处理 $$latex ... $$ 格式的公式
          while ((match = latexBlockRegex.exec(nodeContent)) !== null) {
              hasMatches = true;
              const matchStart = match.index;  // 公式开始位置
              const matchEnd = matchStart + match[0].length;  // 公式结束位置
              
              // 关键步骤：保留公式前的普通文本
              if (matchStart > lastIndex) {
                  fragment.appendChild(document.createTextNode(nodeContent.substring(lastIndex, matchStart)));
              }
              
              // 提取公式内容（去除$$latex和$$标记）
              const latexContent = match[1].trim();
              
              // 为公式创建容器并设置样式
              const container = document.createElement('span');
              container.className = 'latex-rendered-block';
              
              // 使用KaTeX渲染公式
              try {
                  // @ts-ignore
                  katex.render(latexContent, container, {
                      throwOnError: false,  // 错误时不抛出异常
                      displayMode: true     // 块级显示模式
                  });
                  fragment.appendChild(container);  // 将渲染后的公式添加到片段
              } catch (error) {
                  // 渲染失败时显示错误信息
                  console.error('LaTeX渲染错误:', error, '原始文本:', match[0]);
                  const errorNode = document.createElement('span');
                  errorNode.innerHTML = `<span style="color: red;">LaTeX渲染错误</span>`;
                  fragment.appendChild(errorNode);
              }
              
              // 更新处理位置
              lastIndex = matchEnd;
          }
          
          // 重置正则表达式的匹配位置
          standardBlockRegex.lastIndex = 0;
          
          // 第二步：如果没有找到 $$latex 格式，尝试处理标准 $$ 格式
          if (!hasMatches) {
              lastIndex = 0;  // 重置处理位置
              while ((match = standardBlockRegex.exec(nodeContent)) !== null) {
                  hasMatches = true;
                  const matchStart = match.index;
                  const matchEnd = matchStart + match[0].length;
                  
                  // 关键步骤：保留公式前的普通文本
                  if (matchStart > lastIndex) {
                      fragment.appendChild(document.createTextNode(nodeContent.substring(lastIndex, matchStart)));
                  }
                  
                  // 提取并渲染标准公式
                  const latexContent = match[1].trim();
                  
                  // 为公式创建容器
                  const container = document.createElement('span');
                  container.className = 'latex-rendered-block';
                  
                  try {
                      // @ts-ignore
                      katex.render(latexContent, container, {
                          throwOnError: false,
                          displayMode: true
                      });
                      fragment.appendChild(container);
                  } catch (error) {
                      console.error('LaTeX渲染错误:', error, '原始文本:', match[0]);
                      const errorNode = document.createElement('span');
                      errorNode.innerHTML = `<span style="color: red;">LaTeX渲染错误</span>`;
                      fragment.appendChild(errorNode);
                  }
                  
                  // 更新处理位置
                  lastIndex = matchEnd;
              }
          }
          
          // 第三步：添加所有剩余的文本内容
          // 这确保了最后一个公式之后的文本也不会丢失
          if (lastIndex < nodeContent.length) {
              fragment.appendChild(document.createTextNode(nodeContent.substring(lastIndex)));
          }
          
          // 最后，只有在确实找到公式时才替换原始节点
          // 这避免了对不含公式的文本进行不必要的DOM操作
          if (hasMatches) {
              textNode.parentNode?.replaceChild(fragment, textNode);
          }
      };
      
      // --- 初始渲染和MutationObserver设置 ---
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
               // 检查文本节点是否包含可能的LaTeX分隔符
               if (node.nodeValue && (node.nodeValue.includes('$$') || node.nodeValue.includes('$latex'))) {
                    renderLatex(node as Text);
               }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // 同时检查添加元素的子元素
              (node as Element).querySelectorAll(':scope > *:not(script):not(style)').forEach(el => {
                  el.childNodes.forEach(childNode => {
                      if (childNode.nodeType === Node.TEXT_NODE && childNode.nodeValue && (childNode.nodeValue.includes('$$') || childNode.nodeValue.includes('$latex'))) {
                          renderLatex(childNode as Text);
                      }
                  });
              });
              // 检查添加节点本身的直接文本子节点
              node.childNodes.forEach(childNode => {
                  if (childNode.nodeType === Node.TEXT_NODE && childNode.nodeValue && (childNode.nodeValue.includes('$$') || childNode.nodeValue.includes('$latex'))) {
                      renderLatex(childNode as Text);
                  }
        });
    }
          });
        });
      });

      // 对现有内容进行初始渲染
      const initialRender = (element: Node) => {
          if (element.nodeType === Node.TEXT_NODE && element.nodeValue && (element.nodeValue.includes('$$') || element.nodeValue.includes('$latex'))) {
             renderLatex(element as Text);
          } else if (element.nodeType === Node.ELEMENT_NODE) {
              // 避免遍历已渲染的KaTeX元素或可能出问题的元素
              if (!(element as HTMLElement).classList?.contains('katex') && 
                  !(element as HTMLElement).classList?.contains('katex-html') &&
                  element.nodeName !== 'SCRIPT' && element.nodeName !== 'STYLE') {
                  element.childNodes.forEach(initialRender);
              }
          }
      };
      
      if (contentRef.current) {
          // 处理现有内容
          contentRef.current.childNodes.forEach(initialRender);
          // 监听未来内容变化
          observer.observe(contentRef.current, { childList: true, subtree: true });
          
          // 处理图片代理
          const processImages = () => {
            if (!contentRef.current) return;

            // 1. 处理已有的img标签
                  const images = contentRef.current.querySelectorAll('img');
                  images.forEach(img => {
              const currentSrc = img.getAttribute('src');
              const dataOriginalSrc = img.getAttribute('data-original-src');

              if (dataOriginalSrc) { // If data-original-src exists, it's our source of truth
                const desiredSrc = fixImageUrl(dataOriginalSrc);
                if (img.src !== desiredSrc) {
                  console.log(`(PostDetailPage useEffect) Correcting src for ${dataOriginalSrc.substring(0, 50)}... to ${desiredSrc.substring(0, 50)}...`);
                  img.src = desiredSrc;
                              img.onerror = () => {
                    handleImageLoadError(dataOriginalSrc, img);
                                  return true;
                              };
                }
              } else if (currentSrc && currentSrc.startsWith('http')) { // No data-original-src, and current src is an http URL
                console.log(`(PostDetailPage useEffect) Initial processing for ${currentSrc.substring(0, 50)}...`);
                img.setAttribute('data-original-src', currentSrc);
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
            const allElements = contentRef.current.querySelectorAll('*:not(script):not(style)');
            allElements.forEach(el => {
              if (el.childNodes && el.childNodes.length > 0) {
                Array.from(el.childNodes).forEach(node => { // Iterate over a copy
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
                      const originalUrlFromMarkdown = match[2];
                      console.log(`(PostDetailPage useEffect) Processing Markdown image from text node: ${originalUrlFromMarkdown.substring(0, 50)}...`);
                      
                      img.setAttribute('data-original-src', originalUrlFromMarkdown);
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
          processImages(); // Call directly
      }
      
      // 清理函数
      return () => {
          if (observer) {
              observer.disconnect();
          }
      };
    }
  }, [post?.content, fixImageUrl]); // 依赖：post内容, fixImageUrl

  // --- Helper functions (no changes needed) ---
  const getAuthorName = (author: PostDetails['author']) => {
    if (!author) return '匿名用户';
    return author.nickname || author.email || '匿名用户';
  };

  // 添加自定义getImageUrl函数，确保始终使用代理
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

  const formatDate = (dateString: string) => {
    if (!dateString) return '未知日期';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateString;
    }
  };

  // --- Refactor Interaction Handlers to use Imported Mutations ---
  const handleLikeToggle = () => {
    if (!post || !user || !token || likeMutation.isPending || !postSlug) return;
    likeMutation.mutate({
      postId: post.id,
      token: token,
      currentLikeState: post.is_liked || false,
      currentLikeActionId: post.like_action_id || null,
      postSlug: postSlug,
    });
  };

  const handleCollectToggle = () => {
    if (!post || !user || !token || collectMutation.isPending || !postSlug) return;
    collectMutation.mutate({
      postId: post.id,
      token: token,
      currentCollectState: post.is_collected || false,
      currentCollectActionId: post.collect_action_id || null,
      postSlug: postSlug,
    });
  };

  // --- handleNewShareSubmit for ShareDynamicModal ---
  const handleNewShareSubmit = async (comment: string, images?: string[]) => {
    if (!post || !token) {
      toast.warn('请先登录再分享');
      setShareError('请先登录再分享');
      return;
    }
    setIsSubmittingNewShare(true);
    setShareError(null);
    const payload = {
      action_type: 'share',
      target_type: 'post',
      target_id: post.id,
      content: comment,
    };
    try {
      const response = await axios.post(`${API_BASE_URL}/api/actions`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 201) {
        toast.success('分享成功！');
        setIsNewShareModalOpen(false);
        setNewShareComment('');
        queryClient.invalidateQueries({ queryKey: ['postDetails', postSlug] });
      } else {
        const errorData = response.data?.error || '分享操作失败';
        setShareError(errorData);
        throw new Error(errorData);
      }
    } catch (err: any) {
      console.error('分享操作失败:', err);
      const errorMsg = err.response?.data?.error || err.message || '分享操作时出错';
      setShareError(errorMsg);
      toast.error(`分享失败: ${errorMsg}`);
    } finally {
      setIsSubmittingNewShare(false);
    }
  };

  // --- handleDeletePost (Logic remains using direct axios call) ---
   const handleDeletePost = async () => {
    if (!post || !token || !isAuthor) {
      toast.error('无法删除帖子：权限不足或帖子信息不完整。');
      return;
    }
    const postIdToDelete = post.id;
    const postTitle = post.title;
    // Confirmation dialog
    if (window.confirm(`您确定要删除帖子 "${postTitle || '此帖子'}" 吗？此操作无法撤销。`)) {
      try {
        // Direct axios call for deletion
        const response = await axios.delete(`${API_BASE_URL}/api/posts/${postIdToDelete}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (response.status === 200 || response.status === 204) {
          toast.success('帖子已成功删除！');
          navigate('/community'); // Navigate away after deletion
        } else {
          throw new Error(response.data?.error || "删除帖子失败");
        }
      } catch (err: any) {
        console.error(`删除帖子 ${postIdToDelete} 失败:`, err);
        const errorMsg = err.response?.data?.error || err.message || "删除帖子时出错";
        toast.error(`删除失败: ${errorMsg}`);
      }
    }
  };

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
      if (!imgUrl) return match;
      
      console.log(`处理帖子内容中的Markdown图片 (processContentForVideos): alt=${altText}, url=${imgUrl}`);
      
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
        <figure class="not-prose" style="all: initial; display: block; text-align: center; width: 100%; margin: 2em 0; font-family: inherit; color: inherit;">
          <div style="width: 100%; max-width: 800px; margin: 0 auto; aspect-ratio: 16/9; background: #000; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; position: relative;">
            <iframe src="${embedUrl}" class="video-iframe" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 12px;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Embedded YouTube Video"></iframe>
          </div>
        </figure>
      `;
    });
    
    // 处理Bilibili视频
    processedContent = processedContent.replace(bilibiliPlaceholderRegex, (match, originalUrl, videoId) => {
      if (!originalUrl || !videoId) return match;
      
      const embedUrl = `https://player.bilibili.com/player.html?bvid=${videoId}&page=1&high_quality=1&danmaku=0`;
      return `
        <figure class="not-prose" style="all: initial; display: block; text-align: center; width: 100%; margin: 2em 0; font-family: inherit; color: inherit;">
          <div style="width: 100%; max-width: 800px; margin: 0 auto; aspect-ratio: 16/9; background: #000; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; position: relative;">
            <iframe src="${embedUrl}" class="video-iframe" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 12px;" frameborder="0" scrolling="no" allowfullscreen title="Embedded Bilibili Video"></iframe>
          </div>
        </figure>
      `;
    });
    
    return processedContent;
  };

  // 2. 在 return 语句的开头检查加载状态
  if (loading) {
    return <PostDetailSkeleton />;
  }

  if (isError || !post) { // 处理错误或帖子未找到的情况
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4" style={{backgroundColor: 'var(--bg-base-color)', backgroundImage: 'var(--bg-gradient)'}}> {/* 使用CSS变量保持背景一致 */}
        <h2 className="text-2xl font-semibold mb-4">无法加载帖子</h2>
        <p className="text-gray-400 mb-8">{effectiveError || '帖子可能已被删除或链接无效。'}</p>
        <button
          onClick={() => navigate(-1)} // 返回上一页
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors"
        >
          返回
        </button>
      </div>
    );
  }

  // 在渲染内容之前处理视频占位符
  const contentWithVideos = processContentForVideos(post.content);

  // 正常渲染帖子内容
  return (
    <motion.div 
      className="post-detail-container pt-8 pb-16 px-2 md:px-4 lg:px-6 bg-transparent text-white min-h-screen" // 确保背景透明以显示全局背景
      initial={{ opacity: 0 }} // framer-motion 的初始状态
      animate={{ opacity: 1 }} // framer-motion 动画到最终状态
      transition={{ duration: 0.4, delay: 0.1 }} // framer-motion 动画参数
    >
      {/* 完全居中的容器，删除左侧偏移 */}
      <div className="max-w-4xl mx-auto transition-all duration-300 ease-in-out">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto pb-8"
        >
          {/* Header */}
          <header className="mb-6 pb-4">
            {/* 标题单独一行 */}
            <div className="mb-3">
              <h1 className="text-3xl md:text-4xl font-bold text-white break-words">
                {post.title}
              </h1>
            </div>

            {/* 作者信息、浏览量、标签、按钮在同一行，两端对齐 */}
            <div className="flex flex-wrap justify-between items-center text-sm text-gray-400 gap-x-4 gap-y-2">
              {/* 左侧：作者、发布日期、浏览量 - 缩小间距 */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1"> {/* Reduced gap-x from 4 to 3 */}
                {/* 添加作者头像和名字 - 使用 AuthorTooltip 包裹 */}
                <div 
                  className="flex items-center relative" // 添加 relative 定位
                  onMouseEnter={() => {
                    if (post?.author) {
                      setTooltipData({
                        nickname: post.author.nickname || post.author.email?.split('@')[0] || '匿名用户',
                        // 假设 post.author 也有 bio, tags, avatar，需要确保 PostDetails 类型同步
                        bio: (post.author as any).bio, 
                        tags: (post.author as any).tags,
                        avatar: post.author.avatar
                      });
                      setIsTooltipVisible(true);
                    }
                  }}
                  onMouseLeave={() => {
                    setIsTooltipVisible(false);
                  }}
                >
                  <img 
                    src={post.author?.avatar || `https://via.placeholder.com/40/374151/FFFFFF?text=${(post.author?.nickname || post.author?.email || 'U').charAt(0).toUpperCase()}`}
                    alt={post.author?.nickname || post.author?.email || '作者头像'} 
                    className="w-6 h-6 rounded-full mr-2 object-cover bg-gray-700" /* Reduced size from w-8 h-8 */
                  />
                  <Link 
                    to={`/profile/${post.author?.id}`} 
                    className="text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    {getAuthorName(post.author)}
                  </Link>
                </div>
                {/* 中间的点 • */}
                <span className="hidden sm:inline text-gray-500">•</span>
                {/* 发布日期 */}
                <span>{formatDate(post.created_at)}</span>
                {/* 中间的点 • */}
                <span className="hidden sm:inline text-gray-500">•</span>
                {/* 浏览量 */}
                <span>浏览量: {post.view_count}</span>
             </div>

              {/* 右侧：标签和按钮 */}
              <div className="flex items-center space-x-4 flex-shrink-0">
                {/* Tags */} 
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map(tag => (
                      <span key={tag} className="bg-indigo-600 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Author Actions: Edit/Delete Buttons - 移到这里并移除绝对定位 */}
            {isAuthor && (
                  <div className="flex items-center space-x-2 flex-shrink-0">
                   <button 
                     onClick={() => navigate(`/edit-post/${post.slug}`)} 
                     className="px-3 py-1 text-xs font-medium text-gray-300 hover:text-white 
                                bg-transparent border border-gray-500/70 hover:border-white/70 
                                rounded-full transition-all duration-200 
                                disabled:opacity-50 disabled:cursor-not-allowed"
                     title="编辑帖子" 
                      disabled={!post?.slug || loading} 
                   >
                       编辑
                   </button>
                   <button 
                     onClick={handleDeletePost} 
                     className="px-3 py-1 text-xs font-medium text-gray-300 hover:text-white 
                                bg-transparent border border-gray-500/70 hover:border-white/70 
                                rounded-full transition-all duration-200 
                                disabled:opacity-50 disabled:cursor-not-allowed"
                     title="删除帖子" 
                      disabled={!post?.id || loading} 
                   >
                       删除
                   </button>
               </div>
             )}
              </div>
            </div>
          </header>
          
          {/* Content */}
          <div
            ref={contentRef}
            className="prose prose-lg prose-invert max-w-none ck-content-output text-gray-300 prose-headings:font-semibold prose-headings:text-white prose-a:text-blue-400 prose-strong:text-white mt-6 prose-blockquote:border-l-blue-500 prose-blockquote:text-gray-400"
            dangerouslySetInnerHTML={{ __html: contentWithVideos || '<p>内容加载失败或为空。</p>' }} // Fallback content
          />

          {/* Comment Section - Passed updated props */}
          <div className="mt-12 pt-8">
              <CommentSection
                  targetType="post"
                  targetId={post.id}
                  apiBaseUrl={API_BASE_URL}
                  token={token}
                  currentUser={user}
                  isLiked={post.is_liked || false}
                  isCollected={post.is_collected || false}
                  likeCount={post.likes_count || 0}
                  collectCount={post.collects_count || 0}
                  shareCount={shareCount}
                  handleLikeToggle={handleLikeToggle}
                  handleCollectToggle={handleCollectToggle}
                  handleShareClick={() => setIsNewShareModalOpen(true)}
                  isSubmittingAction={likeMutation.isPending || collectMutation.isPending}
              />
          </div>
        </motion.div>
      </div>

      {/* Share Dynamic Modal */}
      {post && (
        <ShareDynamicModal
          isOpen={isNewShareModalOpen}
          onClose={() => {
            setIsNewShareModalOpen(false);
            setNewShareComment('');
            setShareError(null);
          }}
          onSubmit={handleNewShareSubmit}
          comment={newShareComment}
          setComment={setNewShareComment}
          error={shareError}
          isLoading={isSubmittingNewShare}
          dynamicToShare={post}
          username={user?.nickname || '当前用户'}
          altText={`分享帖子: ${post.title}`}
        />
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

export default PostDetailPage; 