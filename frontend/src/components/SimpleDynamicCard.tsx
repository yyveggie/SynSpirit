import React from 'react';
import { Link } from 'react-router-dom';

export interface SimpleDynamicCardProps {
  dynamic: {
    id: number;
    content: string;
    images?: string[];
    user: {
      id: number;
      username: string;
      avatar: string;
    };
    createdAt: string;
  };
}

const SimpleDynamicCard: React.FC<SimpleDynamicCardProps> = ({ dynamic }) => {
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
        to={`/dynamic/${dynamic.id}`}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center mb-2">
          <img 
            src={dynamic.user.avatar || '/images/default-avatar.png'}
            alt={dynamic.user.username}
            className="w-8 h-8 rounded-full mr-3"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/images/default-avatar.png';
            }}
          />
          <div>
            <div className="text-white font-medium">{dynamic.user.username}</div>
            <div className="text-xs text-gray-400">
              {formatDate(new Date(dynamic.createdAt))}
            </div>
          </div>
        </div>

        <div className="text-gray-100 line-clamp-3">
          {dynamic.content}
        </div>
        
        {dynamic.images && dynamic.images.length > 0 && (
          <div className="flex mt-2 gap-2 overflow-hidden">
            {dynamic.images.slice(0, 3).map((image, index) => (
              <div 
                key={index} 
                className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0"
              >
                <img 
                  src={image}
                  alt={`动态图片 ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/images/fallback-image.webp';
                  }}
                />
              </div>
            ))}
            {dynamic.images.length > 3 && (
              <div className="w-20 h-20 bg-gray-700/50 rounded-md flex items-center justify-center">
                <span className="text-white">+{dynamic.images.length - 3}</span>
              </div>
            )}
          </div>
        )}
      </Link>
    </div>
  );
};

export default SimpleDynamicCard; 