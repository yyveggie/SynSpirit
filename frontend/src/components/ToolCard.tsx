import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

interface ToolCardProps {
  title: string;
  description: string;
  category: string;
  tags?: string[];
  rating?: number;
  isFree?: boolean;
  imageUrl?: string;
  slug?: string;
}

const ToolCard: React.FC<ToolCardProps> = ({ 
  title, 
  description, 
  category,
  tags = [],
  rating = 0,
  isFree = true,
  imageUrl,
  slug
}) => {
  // 格式化评分，保留一位小数
  const formattedRating = rating ? rating.toFixed(1) : '0.0';
  
  // 显示最多3个标签
  const visibleTags = tags?.slice(0, 3) || [];
  
  return (
    <Link to={slug ? `/tools/${slug}` : '#'} className="block">
      <div className="bg-white rounded-lg shadow-md p-6 h-full hover:shadow-xl transition-shadow duration-300 border border-gray-100">
      <motion.div 
        whileHover={{ y: -5 }}
        transition={{ duration: 0.2 }}
      >
        {/* 工具图片 */}
        {imageUrl && (
          <div className="mb-4 h-40 overflow-hidden rounded-md bg-gray-100">
            <img 
              src={imageUrl.startsWith('http') ? imageUrl : `/images/${imageUrl}`} 
              alt={title} 
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log('Image loading error:', imageUrl);
                (e.target as HTMLImageElement).src = '/images/placeholder-tool.png';
              }}
            />
          </div>
        )}
        
        {/* 工具标题与免费/付费/评分/类别 */}
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-gray-800 mr-2 truncate">{title}</h3>
          {/* 右侧信息集合 */}
          <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
            {/* 免费/付费标签 */}
          {isFree ? (
              <span className="text-xs font-medium bg-green-500 text-white px-2 py-0.5 rounded">免费</span>
          ) : (
              <span className="text-xs font-medium bg-amber-500 text-white px-2 py-0.5 rounded">付费</span>
          )}
            {/* 评分与分类 */}
            <div className="flex items-center text-xs text-gray-500 space-x-2 mt-1">
        {/* 评分 */}
              {rating > 0 && (
                <div className="flex items-center text-yellow-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
                  <span className="text-gray-700">{formattedRating}</span>
                </div>
              )}
               {/* 分类 */}
              {category && (
                 <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{category}</span>
              )}
            </div>
          </div>
        </div>
        
        {/* 工具描述 */}
        <p className="text-gray-600 mb-4 line-clamp-3">{description}</p>
        
        {/* 标签列表 */}
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-auto">
            {visibleTags.map((tag, index) => (
              <span 
                key={index} 
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </motion.div>
      </div>
    </Link>
  );
};

export default ToolCard;
