/**
 * FrostedPostCard.tsx
 * 
 * 功能注释：
 * 定义一个可重用的 UI 组件，用于展示单个帖子的预览卡片。
 * 负责渲染帖子的关键信息，包括：
 *   - 封面图片 (如果存在)，置于右侧并保持合适的比例。
 *   - 帖子标题 (限制最多显示 1 行)。
 *   - 作者名称和发布时间。
 *   - 帖子内容预览，及查看全文功能。
 * 应用特定的视觉样式：
 *   - "毛玻璃" (frosted glass) 背景效果 (bg-white/5 backdrop-blur-lg)。
 *   - 圆角、边框和阴影。
 *   - 水平方向的 flex 布局 (flex-row)。
 * 接收帖子数据对象 (post) 以及其所属的父主题类型/Slug 作为 props。
 * 根据父主题信息构建指向帖子详情页的正确链接 (Link)。
 */
import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';

// --- 父主题类型 ---
type ParentTopicType = 'topic' | 'relationship';

interface Post {
  id: number;
  title: string;
  author: any; // 可以是对象或字符串 
  content?: string; // 帖子内容字段
  excerpt?: string;
  summary?: string; // 从API返回的数据使用 summary
  upvotes?: number;
  comments?: number;
  timestamp?: string;
  created_at?: string; // 从API返回的数据使用 created_at
  slug?: string;
  // 互动数据字段
  likes_count?: number;
  collects_count?: number;
  shares_count?: number;
  comments_count?: number;
  // 后端API可能使用的替代命名
  like_count?: number;
  collect_count?: number;
  comment_count?: number;
  share_count?: number;
}

interface FrostedPostCardProps {
  post: Post;
  parentType: ParentTopicType;
  parentSlug: string | undefined; // 父 Slug 可能未定义
}

// 从 HTML 获取纯文本预览的辅助函数
const getContentPreview = (htmlContent: string | null | undefined, maxLength: number = 450): string => {
  if (!htmlContent) return '';

  // 0. 处理Markdown格式的图片链接，先将它们替换为占位符，避免提取为文本
  let text = htmlContent.replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '[图片]');

  // 1. 移除脚本和样式标签及其内容
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. 将换行符、段落、列表项等视为可能的断句点
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');

  // 3. 移除所有剩余的 HTML 标签
  text = text.replace(/<[^>]+>/g, '');

  // 4. 替换 HTML 实体编码
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // 5. 规范化空白字符
  text = text.replace(/\s+/g, ' ').trim();

  // 6. 截断到指定长度
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
};

const FrostedPostCard: React.FC<FrostedPostCardProps> = ({ post, parentType, parentSlug }) => {
  // 格式化日期显示
  const formatDate = (dateString?: string) => {
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

  // 获取作者名称
  const getAuthorName = () => {
    if (!post.author) return '匿名';
    
    // 如果 author 是字符串直接返回
    if (typeof post.author === 'string') return post.author;
    
    // 优先显示昵称
    if (post.author.nickname) return post.author.nickname;
    
    // 如果有 email 但没有昵称，显示 email
    if (post.author.email) return post.author.email;
    
    // 如果都没有才显示匿名
    return '匿名';
  };

  // 构建帖子链接
  const buildPostUrl = () => {
    const postIdentifier = post.slug || post.id; // 优先使用 slug
    if (parentSlug && postIdentifier) {
        const parentPath = parentType === 'topic' ? 'topic' : 'relationship-topic';
        return `/community/${parentPath}/${parentSlug}/posts/${postIdentifier}`;
    } else {
        console.warn(`[FrostedPostCard] Missing parentSlug (${parentSlug}) or post identifier (${postIdentifier}) for post ID ${post.id}. Falling back to old URL.`);
        return `/posts/${postIdentifier}`;
    }
  };

  // 尝试获取内容，首先使用content字段，如果没有则尝试使用summary字段
  const postContent = post.content || post.summary || post.excerpt || '';

  // 获取互动数据，兼容不同命名
  const likesCount = post.likes_count !== undefined ? post.likes_count : post.like_count;
  const collectsCount = post.collects_count !== undefined ? post.collects_count : post.collect_count;
  const commentsCount = post.comments_count !== undefined ? post.comments_count : (post.comment_count !== undefined ? post.comment_count : post.comments);
  const sharesCount = post.shares_count !== undefined ? post.shares_count : post.share_count;

  // 新增：预加载打开新标签页的函数
  // useCallback 用于确保此函数在父组件重渲染时不被不必要地重新创建，
  // 除非其依赖项发生变化（此处无依赖项，因此仅创建一次）。
  const openInNewTabWithPreload = useCallback((url: string) => (e: React.MouseEvent) => {
    e.preventDefault(); // 阻止<a>标签的默认导航行为
    // preload.html 应该位于 public 文件夹下，因此路径通常是 /preload.html
    const preloadPageUrl = `/preload.html?redirect=${encodeURIComponent(url)}`;
    const newWindow = window.open(preloadPageUrl, '_blank');
    if (newWindow) {
      newWindow.opener = null; // 安全性考虑：移除新窗口对 window.opener 的引用
    }
  }, []); // 空依赖数组表示此函数永不改变

  const postUrl = buildPostUrl(); // 获取帖子详情页的URL

  return (
    <div 
      className="rounded-lg overflow-hidden 
                 bg-gray-900/50 backdrop-blur-lg 
                 shadow-lg hover:shadow-xl 
                 transform transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1
                 flex flex-col"
    >
      <div className="p-3">
          {/* 
            修改导航逻辑：
            - 将 react-router-dom 的 <Link> 组件替换为普通的 <a> 标签。
            - 为 <a> 标签添加 onClick 事件处理器，调用 openInNewTabWithPreload 函数。
            - 保留 href 属性，这样用户仍然可以右键点击链接进行"在新标签页中打开"、"复制链接地址"等标准浏览器操作。
            - 添加 cursor-pointer 样式，以提供视觉反馈，表明该元素是可点击的。
            - 将帖子标题作为 title 属性添加到 <a> 标签，鼠标悬停时可以显示完整标题。
          */}
          <a 
            href={postUrl} 
            onClick={openInNewTabWithPreload(postUrl)}
            className="hover:text-blue-300 transition-colors mb-2 block cursor-pointer"
            title={post.title} 
          >
            <h3 className="text-lg font-semibold text-white line-clamp-1">{post.title}</h3> {/* 限制标题只显示一行 */}
          </a>
          
        {/* 直接显示完整内容 */}
        {postContent && (
          <div className="text-gray-300 text-sm my-4 post-content-container">
            <style>{`
              .post-content-container img, 
              .post-content-container video,
              .post-content-container iframe,
              .post-content-container figure {
                margin-left: auto;
                margin-right: auto;
                display: block;
                max-width: 100%;
              }
              .post-content-container .post-content p {
                margin-bottom: 1rem;
              }
              .post-content-container a {
                color: #60a5fa;
                text-decoration: none;
              }
              .post-content-container a:hover {
                text-decoration: underline;
              }
            `}</style>
            <div 
              className="post-content" 
              dangerouslySetInnerHTML={{ 
                __html: postContent
                  // 将Markdown格式的图片链接 ![alt](url) 转换为HTML的<img>标签
                  .replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; display:block; margin:0 auto;">')
                  // 处理YouTube视频占位符，添加16:9容器
                  .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g, (match, originalUrl, videoId) => `
                    <figure class="not-prose video-figure" style="all: initial; display: block; text-align: center; width: 100%; margin: 1.5em 0; font-family: inherit; color: inherit;">
                      <div class="video-wrapper" style="width: 100%; max-width: 720px; margin: 0 auto; aspect-ratio: 16/9; background: #000; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); overflow: hidden; position: relative;">
                        <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=0&mute=0&controls=1" class="video-iframe" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 8px;" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Embedded YouTube Video"></iframe>
                      </div>
                    </figure>
                  `)
                  // 处理Bilibili视频占位符，添加16:9容器
                  .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g, (match, originalUrl, videoId) => `
                    <figure class="not-prose video-figure" style="all: initial; display: block; text-align: center; width: 100%; margin: 1.5em 0; font-family: inherit; color: inherit;">
                      <div class="video-wrapper" style="width: 100%; max-width: 720px; margin: 0 auto; aspect-ratio: 16/9; background: #000; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); overflow: hidden; position: relative;">
                        <iframe src="https://player.bilibili.com/player.html?bvid=${videoId}&page=1&high_quality=1&danmaku=0&autoplay=0" class="video-iframe" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; border-radius: 8px;" frameborder="0" scrolling="no" allowfullscreen title="Embedded Bilibili Video"></iframe>
                      </div>
                    </figure>
                  `)
              }} 
            />
          </div>
        )}
        
        {/* 底部作者信息和互动数据 */}
        <div className="flex justify-between items-end mt-4">
          <div className="flex gap-3 text-xs text-gray-400">
        {likesCount !== undefined && (
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>{likesCount || 0}</span>
          </div>
        )}
        
        {commentsCount !== undefined && (
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{commentsCount || 0}</span>
          </div>
        )}
        
        {collectsCount !== undefined && (
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span>{collectsCount || 0}</span>
          </div>
        )}
        
        {sharesCount !== undefined && (
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{sharesCount || 0}</span>
          </div>
        )}
          </div>
          <div className="text-xs text-gray-400">
            <span>由 {getAuthorName()} 发布于 {formatDate(post.created_at || post.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrostedPostCard; 