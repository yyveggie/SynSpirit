/**
 * 此文件定义了 UserAvatar 组件，用于展示用户头像和用户名。
 *
 * 主要功能:
 * - 接收用户名等用户信息作为 props。
 * - 显示用户名，并添加点击事件，跳转到用户动态页面。
 * - 支持显示真实头像，若无头像则显示用户名首字母作为占位符。
 * - 支持自定义样式和大小。
 * - 支持控制是否显示用户名。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React from 'react';
import { Link } from 'react-router-dom'; // 导入 Link 组件
import { API_BASE_URL } from '../config';
import { useInsideLink } from '../contexts/LinkContext'; // 导入Link上下文

interface UserAvatarProps {
  username: string;
  userId?: number; // 用户ID，用于链接到用户动态页面
  avatar?: string | null; // 头像URL
  size?: 'sm' | 'md' | 'lg'; // 大小
  className?: string; // 允许传入额外 class
  showName?: boolean; // 是否显示用户名
}

// 获取头像URL的辅助函数
const getAvatarUrl = (avatarUrl?: string | null): string | null => {
  if (!avatarUrl) return null;
  
  // 如果是完整URL，直接返回
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    return avatarUrl;
  }
  
  // 如果是相对路径，但没有API_BASE_URL前缀，添加前缀
  // 排除已经是完整路径的情况，例如已经包含 /media/
  if (!avatarUrl.startsWith('/')) {
    // 如果不是以斜杠开头，确保路径正确
    return `${API_BASE_URL}/${avatarUrl}`;
    }
  
  // 处理以斜杠开头的情况，避免双斜杠
  if (avatarUrl.startsWith('/') && API_BASE_URL.endsWith('/')) {
    return `${API_BASE_URL}${avatarUrl.substring(1)}`;
  } 
  
  // 一般情况，直接拼接
  return `${API_BASE_URL}${avatarUrl}`;
};

const UserAvatar: React.FC<UserAvatarProps> = ({ 
  username, 
  userId, 
  avatar, 
  size = 'md', 
  className = '',
  showName = true
}) => {
  // 根据是否有 userId 决定链接目标
  // 如果有userId，则链接到用户动态页面，否则链接到个人主页
  const profileLink = userId ? `/profile/${userId}` : '/profile/me';

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const containerClasses = `user-avatar-container inline-flex items-center ${className}`;
  const avatarSizeClass = sizeClasses[size];
  const processedAvatarUrl = getAvatarUrl(avatar);

  // 检测是否已经在Link组件内部
  const isInsideLink = useInsideLink();

  // 渲染头像内容的函数
  const renderAvatarContent = () =>
    <>
        {processedAvatarUrl ? (
          <img 
            src={processedAvatarUrl} 
            alt={`${username}的头像`} 
          className={`rounded-full object-cover ${avatarSizeClass}`}
            onError={(e) => {
              // 保持失败时的占位符逻辑
              const imgElement = e.currentTarget as HTMLImageElement;
              const fallbackElement = imgElement.nextElementSibling as HTMLElement;
              imgElement.style.display = 'none'; // 隐藏损坏的图片
              if (fallbackElement) {
                fallbackElement.style.display = 'flex'; // 显示占位符
              } 
              // 还可以考虑记录错误或显示通用占位符
              console.error(`Failed to load avatar: ${processedAvatarUrl}`);
            }}
          />
        ) : null /* 如果一开始就没有 URL，则不渲染 img 标签 */}
        {/* 首字母占位符 (初始隐藏，加载失败或无 URL 时显示) */} 
        <div 
        className={`rounded-full flex items-center justify-center bg-gray-600 text-white font-semibold ${avatarSizeClass} ${processedAvatarUrl ? 'hidden' : ''}`}
          style={processedAvatarUrl ? {display: 'none'} : {display: 'flex'}} // 初始根据是否有 URL 控制显示
          title={username}
        >
          {username?.charAt(0).toUpperCase() || '?'} 
        </div>
    </>
  ;

  return (
    <div className={containerClasses}>
      {/* 头像部分 */}
      {isInsideLink ? (
        // 如果已经在Link内，直接渲染头像内容
        <div className="flex-shrink-0">
          {renderAvatarContent()}
        </div>
      ) : (
        // 否则，用Link包裹头像内容
        <Link to={profileLink} title={`查看 ${username} 的个人主页`} className="flex-shrink-0">
          {renderAvatarContent()}
      </Link>
      )}

      {/* 用户名链接 - 仅在 showName 为 true 时显示 */}
      {showName && (
        isInsideLink ? (
          // 如果已经在Link内，只渲染文本
          <span className={`username ${size === 'sm' ? 'text-sm' : 'text-base'} font-medium text-gray-300`}>
            {username}
          </span>
        ) : (
          // 否则，使用Link包裹
      <Link 
        to={profileLink} 
        className={`username-link hover:underline transition-colors ${size === 'sm' ? 'text-sm' : 'text-base'} font-medium text-gray-300 hover:text-blue-400`}
        title={`查看 ${username} 的个人主页`} 
      >
        <span className="username">{username}</span>
      </Link>
        )
      )}
    </div>
  );
};

export default UserAvatar; 