/**
 * 首页统一内容流标题组件
 * 
 * 注意：按照需求，该组件被设置为不可见（透明+高度为0），
 * 仅保留其功能性以确保应用正常运行。
 * 如果将来需要重新显示标题，只需移除透明和高度为0的样式即可。
 */
import React from 'react';
import { FavoriteItem } from '../hooks/useFavoriteQueries';

interface HomeTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  favoriteItems: FavoriteItem[];
  user: any | null;
}

const HomeTabs: React.FC<HomeTabsProps> = ({ 
  activeTab, 
  setActiveTab, 
  favoriteItems, 
  user 
}) => {
  return (
    <div className="mt-4 mb-0 flex-shrink-0 opacity-0 h-0 overflow-hidden">
      {/* 
        此组件已设置为不可见（opacity-0 和 h-0），但保留功能性
        仍然可以通过点击（虽然看不见）或程序调用来切换activeTab
        如需恢复可见性，请移除opacity-0和h-0类
      */}
      <div className="flex flex-wrap gap-x-1 gap-y-2"> 
        <button 
          className="px-5 py-0 rounded-md text-sm font-medium transition-colors duration-200 bg-transparent text-transparent"
          onClick={() => setActiveTab('unified')}
          aria-hidden="true"
        >
        </button>
      </div>
    </div>
  );
};

export default HomeTabs; 