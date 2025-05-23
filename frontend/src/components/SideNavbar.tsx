/**
 * 此文件定义了 SideNavbar 组件，即应用程序的侧边导航栏。
 * 注意：该组件当前已被禁用，导航功能已移至顶部导航栏。
 * 保留此文件是为了将来可能的扩展或恢复需求。
 *
 * 主要功能:
 * - 提供垂直的导航链接列表。
 * - 侧边栏的展开和收起状态由全局 SidebarContext 管理。
 * - 包含到应用主要部分的链接 (如首页、文章、工具、社区、聊天等)。
 * - 使用 TanStack Query (`useUserFavorites`) 获取并显示用户收藏的社区列表。
 * - 可能包含热门工具或其他动态内容的展示区域。
 * - 响应式设计，可能在小屏幕上隐藏或以不同方式显示。
 * - 选中导航项时显示优雅的渐变背景（浅绿到浅蓝）、微发光和放大动画，无边框。
 * - 当选中收藏的社区时，"社区"导航项不显示选中状态。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 *
 * --- 重构说明 ---
 * - 收藏列表现在由 TanStack Query (`useUserFavorites`) 管理，移除了手动缓存和状态管理。
 * - `favoritesUpdated` 事件现在通过 invalidate 查询来更新列表，而不是手动更新状态。
 * - 选中样式更新为渐变背景、微发光和优雅动画，防止其他选项移动。
 * - 调整社区选中逻辑，收藏社区选中时社区导航不激活。
 */
import React, { useEffect, useCallback, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useQueryClient } from '@tanstack/react-query';
import { useUserFavorites, FavoriteItem } from '../hooks/useFavoriteQueries';

// --- Memoized FavoriteList Component ---
const FavoriteList = memo(({ items, locationPathname }: { items: FavoriteItem[], locationPathname: string }) => {
  return (
    <div className="mt-1 space-y-1">
      {items.map(item => (
        <Link
          key={`${item.type}-${item.id}`}
          to={item.type === 'topic' ? `/community/topic/${item.slug}` : `/community/relationship-topic/${item.slug}`}
          className={`group flex items-center px-2 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            locationPathname.endsWith(`/${item.slug}`)
              ? 'text-white bg-gradient-to-r from-green-200/30 to-blue-200/30 scale-103 opacity-100 shadow-inner'
              : 'text-gray-300 hover:bg-gradient-to-r hover:from-green-200/10 hover:to-blue-200/10 hover:scale-103 hover:opacity-90 hover:shadow-sm'
          }`}
        >
          <span className={`mr-2.5 h-2 w-2 rounded-full flex-shrink-0 ${
            item.type === 'topic' ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-gradient-to-r from-purple-400 to-pink-500'
          }`}></span>
          <span className="truncate">{item.name}</span>
        </Link>
      ))}
    </div>
  );
});
FavoriteList.displayName = 'FavoriteList';

const SideNavbar: React.FC = () => {
  const { isSidebarOpen } = useSidebar();
  const location = useLocation();
  const { user, token } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: favoriteItems = [],
    isLoading: loadingFavorites,
  } = useUserFavorites(token);

  const handleFavoritesUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['userFavorites'] });
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener('favoritesUpdated', handleFavoritesUpdated);
    return () => {
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdated);
    };
  }, [handleFavoritesUpdated]);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isActivePrefix = (prefix: string) => {
    if (prefix === '/community') {
      return location.pathname === '/community';
    }
    return location.pathname.startsWith(prefix);
  };

  // 组件被保留但不再显示，返回null
  return null;
};

export default SideNavbar;