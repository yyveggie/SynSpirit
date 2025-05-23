/**
 * 此文件定义了 UserCard 组件，用于展示用户信息卡片。
 *
 * 主要功能:
 * - 基于UserAvatar组件，展示更完整的用户信息。
 * - 支持不同尺寸（sm, md, lg）和不同样式模式（normal, compact, list）。
 * - 展示用户名称、简介、创建时间等信息。
 * - 点击卡片或用户名可跳转到用户主页。
 * - 支持自定义样式和额外操作按钮。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar'; // 导入UserAvatar组件

// 用户信息接口
interface UserInfo {
  id: number;
  nickname?: string | null;
  email?: string;
  bio?: string | null;
  avatar?: string | null;
  created_at?: string;
}

// 组件属性接口
interface UserCardProps {
  user: UserInfo; // 用户信息对象
  mode?: 'normal' | 'compact' | 'list'; // 显示模式
  size?: 'sm' | 'md' | 'lg'; // 尺寸
  showBio?: boolean; // 是否显示简介
  showCreatedAt?: boolean; // 是否显示创建时间
  className?: string; // 自定义样式类
  actionButtons?: React.ReactNode; // 额外的操作按钮
  onClick?: () => void; // 点击卡片的回调
}

/**
 * 用户信息卡片组件
 */
const UserCard: React.FC<UserCardProps> = ({
  user,
  mode = 'normal',
  size = 'md',
  showBio = true,
  showCreatedAt = false,
  className = '',
  actionButtons,
  onClick
}) => {
  // 用户名显示（优先使用昵称，否则使用邮箱前缀）
  const displayName = user.nickname || (user.email ? user.email.split('@')[0] : '未知用户');
  
  // 根据模式选择合适的样式
  const cardStyles = {
    normal: 'bg-gray-800 rounded-lg shadow-md p-4 border border-gray-700 hover:border-gray-600 transition-colors',
    compact: 'bg-gray-800 rounded-md shadow-sm p-3 border border-gray-700',
    list: 'bg-transparent hover:bg-gray-800/30 rounded-md p-2 transition-colors'
  };
  
  // 根据尺寸选择头像大小
  const avatarSize = size;
  
  // 计算创建时间的格式化显示
  const formattedDate = user.created_at 
    ? new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  
  // 构造用户主页链接
  const profileUrl = `/profile/${user.id}`;
  
  return (
    <div 
      className={`user-card ${cardStyles[mode]} ${className}`}
      onClick={onClick}
    >
      <div className="flex items-start">
        {/* 头像部分 */}
        <Link to={profileUrl} className="flex-shrink-0">
          <UserAvatar 
            username={displayName} 
            userId={user.id} 
            avatar={user.avatar}
            size={avatarSize}
          />
        </Link>
        
        {/* 用户信息部分 */}
        <div className="ml-3 flex-grow">
          <Link 
            to={profileUrl}
            className="text-gray-100 hover:text-blue-300 hover:underline font-medium transition-colors"
          >
            {displayName}
          </Link>
          
          {/* 用户创建时间 */}
          {showCreatedAt && formattedDate && (
            <div className="text-xs text-gray-400 mt-1">
              加入于 {formattedDate}
            </div>
          )}
          
          {/* 用户简介 */}
          {showBio && user.bio && mode !== 'compact' && (
            <p className="text-gray-300 text-sm mt-2 line-clamp-2">{user.bio}</p>
          )}
          
          {/* 操作按钮区域 */}
          {actionButtons && (
            <div className="mt-3 flex space-x-2">
              {actionButtons}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserCard; 