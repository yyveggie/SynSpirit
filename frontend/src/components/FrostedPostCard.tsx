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
import React, { useEffect, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { Heart, Pin, Share, Message } from '@mynaui/icons-react';

// --- 父主题类型 ---
type ParentTopicType = 'topic' | 'relationship';

interface Post {
  id: number;
  title: string;
  author: any; // Can be object { id, nickname, email, avatar } or string
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
  // User interaction status - to be passed from parent
  is_liked?: boolean;
  is_collected?: boolean;
}

// Define MediaItem type for the carousel
interface MediaItem {
  type: 'image' | 'youtube' | 'bilibili';
  src: string; // Original URL for images, embed URL for videos
  alt?: string; // For images
}

interface FrostedPostCardProps {
  post: Post;
  parentType: ParentTopicType;
  parentSlug: string | undefined; // 父 Slug 可能未定义
  // Interaction handlers from parent
  onLikeToggle: (postId: number) => void;
  onCollectToggle: (postId: number) => void;
  onCommentClick: (postId: number) => void;
  onShareClick: (postId: number) => void;
  // Optional: pass these if parent manages granular state per post
  // isLiked?: boolean; 
  // isCollected?: boolean;
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

// 自定义视频框架组件，强制16:9比例
const VideoFrame = ({ src, title = '' }: { src: string, title?: string }) => {
  return (
    <div 
      style={{
        position: 'relative',
        width: '100%',
        height: '0',
        paddingBottom: '56.25%', // 16:9 比例
        backgroundColor: '#000',
        overflow: 'hidden',
        borderRadius: '8px'
      }}
    >
      <iframe
        src={src}
        title={title}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none'
        }}
        allowFullScreen
        loading="lazy"
        frameBorder="0"
        scrolling="no"
      />
    </div>
  );
};

const FrostedPostCard: React.FC<FrostedPostCardProps> = ({ 
  post, 
  parentType, 
  parentSlug,
  onLikeToggle,
  onCollectToggle,
  onCommentClick,
  onShareClick
}) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [textualContent, setTextualContent] = useState('');

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

  // 获取作者名称、头像、ID
  const authorName = (() => {
    if (!post.author) return '匿名';
    if (typeof post.author === 'string') return post.author;
    return post.author.nickname || post.author.email?.split('@')[0] || '匿名';
  })();

  const authorAvatar = (() => {
    if (post.author && typeof post.author === 'object' && post.author.avatar) {
      return post.author.avatar;
    }
    // Placeholder avatar based on first letter of name
    const initial = (authorName || 'A').charAt(0).toUpperCase();
    return `https://via.placeholder.com/40/374151/FFFFFF?text=${initial}`;
  })();
  
  const authorId = post.author && typeof post.author === 'object' ? post.author.id : null;

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

  const postContent = post.content || post.summary || post.excerpt || '';

  // 使用与ArticlePage.tsx相同的正则表达式和处理方式
  useEffect(() => {
    if (!postContent) {
      setMediaItems([]);
      setTextualContent('');
      return;
    }
    
    let processedText = postContent;
    const extractedMedia: MediaItem[] = [];

    // 1. 处理并提取Markdown图片
    const markdownImageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(postContent)) !== null) {
      const alt = match[1] || '';
      const url = match[2];
      if (url) {
        extractedMedia.push({ type: 'image', src: url, alt });
      }
    }
    
    // 从文本中去除已提取的图片
    processedText = processedText.replace(markdownImageRegex, '<!-- image -->');
    
    // 2. 处理并提取YouTube视频
    const youtubeRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g;
    while ((match = youtubeRegex.exec(postContent)) !== null) {
      const videoId = match[2];
      if (videoId) {
        extractedMedia.push({ 
          type: 'youtube', 
          src: `https://www.youtube.com/embed/${videoId}` 
        });
      }
    }
    
    // 从文本中去除已提取的YouTube视频
    processedText = processedText.replace(youtubeRegex, '<!-- youtube -->');
    
    // 3. 处理并提取Bilibili视频
    const bilibiliRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g;
    while ((match = bilibiliRegex.exec(postContent)) !== null) {
      const videoId = match[2];
      if (videoId) {
        extractedMedia.push({ 
          type: 'bilibili', 
          src: `https://player.bilibili.com/player.html?bvid=${videoId}&page=1` 
        });
      }
    }
    
    // 从文本中去除已提取的Bilibili视频
    processedText = processedText.replace(bilibiliRegex, '<!-- bilibili -->');

    console.log('提取的媒体项:', extractedMedia);
    setMediaItems(extractedMedia);
    setTextualContent(processedText);
    
  }, [postContent]);

  // 获取互动数据，兼容不同命名
  const likesCount = post.likes_count !== undefined ? post.likes_count : post.like_count;
  const collectsCount = post.collects_count !== undefined ? post.collects_count : post.collect_count;
  const commentsCount = post.comments_count !== undefined ? post.comments_count : (post.comment_count !== undefined ? post.comment_count : post.comments);
  const sharesCount = post.shares_count !== undefined ? post.shares_count : post.share_count;

  // Current interaction states from post object (assuming parent updates this post object on interaction)
  const isLiked = post.is_liked || false;
  const isCollected = post.is_collected || false;

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

  const handlePrevMedia = () => {
    setCurrentMediaIndex(prev => (prev > 0 ? prev - 1 : mediaItems.length - 1));
  };

  const handleNextMedia = () => {
    setCurrentMediaIndex(prev => (prev < mediaItems.length - 1 ? prev + 1 : 0));
  };

  return (
    <div 
      className="bg-white shadow-lg rounded-lg p-5 mb-6 transition-shadow duration-300 hover:shadow-xl"
    >
      {/* Author Info & Date */}
      <div className="flex items-center text-sm text-gray-700 mb-4">
        <img 
          src={authorAvatar} 
          alt={authorName} 
          className="w-10 h-10 rounded-full mr-3 object-cover bg-gray-200"
          onError={(e) => { 
            // Fallback for broken avatar links
            const initial = (authorName || 'A').charAt(0).toUpperCase();
            (e.target as HTMLImageElement).src = `https://via.placeholder.com/40/374151/FFFFFF?text=${initial}`;
          }}
        />
        <div className="flex-grow">
          {authorId ? (
            <Link to={`/profile/${authorId}`} className="font-semibold text-gray-800 hover:text-blue-600 hover:underline">
              {authorName}
            </Link>
          ) : (
            <span className="font-semibold text-gray-800">{authorName}</span>
          )}
          <p className="text-xs text-gray-500">{formatDate(post.created_at || post.timestamp)}</p>
        </div>
      </div>

      {/* Title (link to post) */}
      <a 
        href={postUrl} 
        onClick={openInNewTabWithPreload(postUrl)}
        className="hover:text-blue-700 transition-colors duration-200 block cursor-pointer group"
        title={post.title} 
      >
        <h2 className="text-2xl font-bold text-black mb-3 group-hover:underline">{post.title}</h2>
      </a>
          
      {/* Content */}
      {/* Render textual content first */}
      {textualContent && (
        <div 
          className="prose prose-sm sm:prose-base max-w-none article-content text-gray-800 leading-relaxed mb-5"
          dangerouslySetInnerHTML={{ __html: textualContent }} 
        />
      )}

      {/* Media Carousel/Display - 使用自定义VideoFrame组件 */}
      {mediaItems.length > 0 && (
        <div className="media-carousel relative mb-5">
          {mediaItems.map((item, index) => (
            <div 
              key={index} 
              className={`media-item ${index === currentMediaIndex ? 'block' : 'hidden'} w-full`}
            >
              {item.type === 'image' && (
                <div style={{ width: '100%', height: 'auto', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '8px' }}>
                  <img 
                    src={item.src} 
                    alt={item.alt || '图片'} 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover' 
                    }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
              )}
              {item.type === 'youtube' && (
                <VideoFrame 
                  src={item.src} 
                  title="YouTube视频"
                />
              )}
              {item.type === 'bilibili' && (
                <VideoFrame
                  src={item.src} 
                  title="Bilibili视频"
                />
              )}
            </div>
          ))}
          
          {mediaItems.length > 1 && (
            <>
              <button 
                onClick={handlePrevMedia}
                className="absolute top-1/2 left-2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-opacity text-lg"
                aria-label="Previous media"
              >
                &#x276E;
              </button>
              <button 
                onClick={handleNextMedia}
                className="absolute top-1/2 right-2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-opacity text-lg"
                aria-label="Next media"
              >
                &#x276F;
              </button>
              
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-2">
                {mediaItems.map((_, index) => (
                  <button 
                    key={`dot-${index}`}
                    onClick={() => setCurrentMediaIndex(index)}
                    className={`w-2.5 h-2.5 rounded-full ${index === currentMediaIndex ? 'bg-white' : 'bg-gray-400 bg-opacity-75 hover:bg-white transition-colors'}`}
                    aria-label={`Go to media ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
        
      {/* Interaction Bar (Likes, Collects, Comments, Share) */}
      <div className="mt-auto pt-4 border-t border-gray-200 flex items-center justify-between text-gray-600">
        <div className="flex items-center space-x-4">
          {/* Like Button */}
          <button 
            onClick={() => onLikeToggle(post.id)} 
            className={`flex items-center hover:text-pink-500 transition-colors duration-150 ${isLiked ? 'text-pink-500' : 'text-gray-500'}`}
            aria-label="Like post"
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : 'fill-none'}`} />
            <span className="ml-1.5 text-sm">{likesCount !== undefined ? likesCount : 0}</span>
          </button>

          {/* Collect Button (Pin) */}
          <button 
            onClick={() => onCollectToggle(post.id)} 
            className={`flex items-center hover:text-yellow-500 transition-colors duration-150 ${isCollected ? 'text-yellow-500' : 'text-gray-500'}`}
            aria-label="Collect post"
          >
            <Pin className={`w-5 h-5 ${isCollected ? 'fill-current' : 'fill-none'}`} />
            <span className="ml-1.5 text-sm">{collectsCount !== undefined ? collectsCount : 0}</span>
          </button>

          {/* Share Button - Moved to the left group */}
          <button 
            onClick={() => onShareClick(post.id)} 
            className="flex items-center text-gray-500 hover:text-green-500 transition-colors duration-150"
            aria-label="Share post"
          >
            <Share className="w-5 h-5" />
            <span className="ml-1.5 text-sm">{sharesCount !== undefined ? sharesCount : 0}</span>
          </button>

          {/* Comment Button/Link */}
          <button 
            onClick={() => onCommentClick(post.id)} 
            className="flex items-center text-gray-500 hover:text-blue-500 transition-colors duration-150"
            aria-label="View comments"
          >
            <Message className="w-5 h-5" />
            <span className="ml-1.5 text-sm">{commentsCount !== undefined ? commentsCount : 0}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FrostedPostCard; 