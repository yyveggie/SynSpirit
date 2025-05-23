/**
 * 此文件定义了 UserAvatarWithImage 组件，专注于正确显示用户头像（图片优先）。
 * 
 * 主要功能:
 * - 接收用户头像URL、用户名和用户ID作为props
 * - 优先显示用户头像图片，无图片时显示用户名首字母作为占位符
 * - 支持点击头像跳转到用户主页
 * - 支持自定义大小和样式
 * - 确保头像URL在各种环境中正确加载（处理相对和绝对路径）
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';

interface UserAvatarWithImageProps {
  username: string;
  userId: number;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showName?: boolean;
}

/**
 * 处理头像URL，确保路径格式正确
 * @param avatarUrl 头像URL（可能是相对路径或绝对路径）
 * @returns 处理后的完整URL或默认头像URL
 */
const getImageUrl = (avatarUrl: string | null | undefined): string => {
  // console.log('处理前的头像URL:', avatarUrl);
  
  if (!avatarUrl) {
    // console.log('未提供头像URL，使用默认头像');
    return 'https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff'; // 使用在线头像生成服务
  }

  let processedUrl = avatarUrl;
  
  // 处理完整URL
  if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
    // 对于腾讯云COS上的图片，使用代理以避免跨域问题
    // --- 移除代理逻辑，假设 COS 已配置好 CORS --- 
    // if (avatarUrl.includes('cos.ap-shanghai.myqcloud.com')) {
    //   processedUrl = `/api/proxy-image?url=${encodeURIComponent(avatarUrl)}`;
    //   console.log('处理腾讯云COS图片URL:', processedUrl);
    // } else {
    //   console.log('保留完整URL:', processedUrl);
    // }
    // --- 直接使用 URL --- 
    processedUrl = avatarUrl;
    // console.log('直接使用完整URL:', processedUrl);
  }
  // 处理相对路径
  else if (avatarUrl.startsWith('/static') || avatarUrl.startsWith('uploads/')) {
    const urlParts = API_BASE_URL.split('/');
    const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
    const relativePath = avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`;
    
    // 根据路径构建完整URL
    if (avatarUrl.startsWith('/static')) {
      processedUrl = `${baseUrlWithoutPath}${relativePath}`;
      // console.log('处理/static路径:', processedUrl);
    } else {
      processedUrl = `${baseUrlWithoutPath}/static/${avatarUrl}`;
      // console.log('处理uploads路径:', processedUrl);
    }
  }
  // 处理仅有文件名的情况
  else if (!avatarUrl.includes('/')) {
    const urlParts = API_BASE_URL.split('/');
    const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
    processedUrl = `${baseUrlWithoutPath}/static/uploads/${avatarUrl}`;
    // console.log('处理文件名:', processedUrl);
  }
  // 其他情况直接返回
  else {
    // console.log('其他情况，直接使用:', processedUrl);
  }

  // console.log('最终处理后的URL:', processedUrl);
  return processedUrl;
};

const UserAvatarWithImage: React.FC<UserAvatarWithImageProps> = ({
  username,
  userId,
  avatarUrl,
  size = 'md',
  className = '',
  showName = false
}) => {
  // 根据尺寸设置样式类
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const containerClasses = `user-avatar-container inline-flex items-center ${className}`;
  const avatarSizeClass = sizeClasses[size];
  const displayName = username || '用户';
  
  // 处理头像URL
  const imageUrl = getImageUrl(avatarUrl);
  
  // 组件挂载时打印调试信息
  useEffect(() => {
    // console.log('UserAvatarWithImage组件渲染:');
    // console.log('用户ID:', userId);
    // console.log('用户名:', username);
    // console.log('原始头像URL:', avatarUrl);
    // console.log('处理后的头像URL:', imageUrl);
    // console.log('API_BASE_URL:', API_BASE_URL);
  }, [userId, username, avatarUrl, imageUrl]);

  return (
    <div className={containerClasses}>
      <div className="relative cursor-pointer">
          <img 
            src={imageUrl}
            alt={`${displayName}的头像`}
            className={`rounded-full object-cover ${avatarSizeClass}`}
            // onLoad={() => console.log('头像图片加载成功:', imageUrl)}
            onError={(e) => {
              // console.error('头像图片加载失败:', imageUrl);
              // 图片加载失败时显示首字母占位符
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div 
            className={`rounded-full hidden flex items-center justify-center bg-gray-600 text-white font-semibold absolute top-0 left-0 ${avatarSizeClass}`}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>

      {showName && (
        <span 
          className={`ml-2 font-medium ${size === 'sm' ? 'text-sm' : 'text-base'} text-gray-200`}
        >
            {displayName}
          </span>
      )}
    </div>
  );
};

export default UserAvatarWithImage; 