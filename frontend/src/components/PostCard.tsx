/**
 * 此文件定义了 PostCard 组件，用于以卡片形式展示单个社区帖子摘要。
 *
 * 主要功能:
 * - 接收帖子数据 (标题、摘要、作者、链接等) 作为 props。
 * - 以简洁的卡片布局展示帖子的关键信息。
 * - 提供点击卡片跳转到帖子详情页的功能。
 * - 可能包含点赞数、评论数等简单统计信息。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React from 'react';
import { Link } from 'react-router-dom';

interface PostCardProps {
  id: number;
  title: string;
  excerpt: string;
  slug: string; // For linking to the detail page
  author?: string; // <-- Add optional author prop
  // Add other fields if needed later, e.g., author, date
}

// Helper function to generate excerpt (can be moved to a utils file later)
const generateExcerpt = (htmlContent: string | undefined | null, maxLength: number = 100): string => {
  if (!htmlContent) return '';
  let text = htmlContent
    .replace(/<img[^>]*>/gi, '[图片]')
    .replace(/<video[^>]*>.*?<\/video>/gi, '[视频]')
    .replace(/<figure[^>]*>.*?<\/figure>/gi, '[媒体内容]');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
};

const PostCard: React.FC<PostCardProps> = ({ id, title, excerpt, slug, author }) => {
  const postLink = `/article/${slug}`; // Assuming posts use the same detail page structure for now

  return (
    <Link 
      to={postLink}
      className="block p-4 rounded-lg bg-gray-100 shadow-md hover:bg-gray-200 transition-all duration-200 group"
    >
      <h3 className="text-lg font-semibold text-black mb-1 group-hover:text-blue-600">{title}</h3>
      {author && <p className="text-xs text-gray-700 mb-2">作者: {author}</p>}
      <p className="text-sm text-gray-700 line-clamp-3">{excerpt}</p>
      {/* Add other elements like author, date, tags later if needed */}
    </Link>
  );
};

export default PostCard; 