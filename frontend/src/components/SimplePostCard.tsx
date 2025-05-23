import React from 'react';
import { Link } from 'react-router-dom';

export interface SimplePostCardProps {
  post: {
    id: number;
    title: string;
    coverImage?: string;
    creator: {
      id: number;
      username: string;
      avatar: string;
    };
    createdAt: string;
  };
}

const SimplePostCard: React.FC<SimplePostCardProps> = ({ post }) => {
  // 格式化日期函数
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 1000 / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 30) return `${diffDays}天前`;

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    return year === now.getFullYear() 
      ? `${month}月${day}日` 
      : `${year}年${month}月${day}日`;
  };

  return (
    <div className="p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all duration-200">
      <Link 
        to={`/posts/${post.id}`}
        className="flex items-start gap-4"
      >
        {post.coverImage && (
          <div className="shrink-0 w-24 h-24 overflow-hidden rounded-md">
            <img 
              src={post.coverImage}
              alt={post.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/images/fallback-cover.webp';
              }}
            />
          </div>
        )}

        <div className="flex-grow">
          <h3 className="text-white text-lg font-medium mb-2 line-clamp-2">
            {post.title}
          </h3>
          
          <div className="flex items-center text-sm text-gray-300 mt-3">
            <div className="flex items-center">
              <img 
                src={post.creator.avatar || '/images/default-avatar.png'}
                alt={post.creator.username}
                className="w-5 h-5 rounded-full mr-2"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/default-avatar.png';
                }}
              />
              <span>{post.creator.username}</span>
            </div>
            <span className="mx-2">·</span>
            <span>{formatDate(new Date(post.createdAt))}</span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default SimplePostCard; 