/**
 * 用户资料卡片组件
 * 
 * 在首页侧边栏显示登录用户的简要信息
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface UserProfileCardProps {
  user: {
    nickname?: string | null;
    email: string;
    bio?: string | null;
    tags?: string[] | null;
  } | null;
}

const UserProfileCard: React.FC<UserProfileCardProps> = ({ user }) => {
  const navigate = useNavigate();
  
  if (!user) return null;
  
  return (
    <div 
      className="relative bg-gray-800/60 backdrop-blur-sm p-4 rounded-lg shadow-lg text-white flex flex-col mb-4 cursor-pointer border border-transparent transition-all duration-300 ease-out group"
      onClick={() => navigate('/profile/me')}
      title="查看个人主页"
      style={{
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
        transform: 'scale(1)',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease-out',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(-6px) scale(1.01)';
        el.style.boxShadow = '0 15px 25px rgba(0, 0, 0, 0.3)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'scale(1)';
        el.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.3)';
      }}
    >
      <div className="mb-3"> 
        <h4 className="text-lg font-semibold mb-2 truncate" title={user.nickname || user.email}>
          Hi, {user.nickname || user.email.split('@')[0]}!
        </h4>
        {user.bio ? (
          <p className="text-sm text-gray-300 italic whitespace-pre-wrap break-words line-clamp-2" title={user.bio}>
            {user.bio}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">还没有个性签名</p>
        )}
      </div>
      
      {user.tags && user.tags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700/50 flex flex-wrap gap-1">
          {user.tags.map((tag, index) => (
            <span 
              key={index} 
              className="px-2 py-0.5 text-xs font-medium text-indigo-100 rounded-full bg-indigo-600/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserProfileCard; 