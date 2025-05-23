/**
 * 特色工具展示组件
 * 
 * 在首页以卡片方式展示特色AI工具
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Tool } from '../api/toolApi';

// 移除图片导入

interface FeaturedToolsProps {
  tools: Tool[];
}

const FeaturedTools: React.FC<FeaturedToolsProps> = ({ tools }) => {
  const navigate = useNavigate();
  // 移除工具图片数组
  
  // 限制最多显示6个工具
  const displayTools = tools.slice(0, 6);
  
  const handleToolClick = (toolSlug: string) => {
    navigate(`/tools/${toolSlug}`);
  };

  // 默认占位图URL
  const defaultImageUrl = 'https://via.placeholder.com/400x300/1d1d43/ffffff?text=AI+Tool';

  return (
    <div className="transition-transform duration-500 ease-out mb-4 flex-shrink-0">
      <div className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide"> 
        {displayTools.map((tool, index) => (
          <div 
            key={tool.id}
            className="featured-tool-card flex-shrink-0 w-48 h-56 cursor-pointer relative rounded-lg overflow-hidden shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group border border-indigo-900/50"
            onClick={() => handleToolClick(tool.slug)}
            style={{ transitionDelay: `${index * 50}ms` }}
          >
            <img 
              src={tool.screenshot_url || defaultImageUrl} 
              alt={tool.name} 
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = defaultImageUrl;
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-1/3 p-3 text-left bg-gradient-to-t from-black/70 via-black/40 to-transparent z-10 flex flex-col justify-end items-start">
              <h3 className="text-base font-semibold text-white mb-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{tool.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturedTools; 