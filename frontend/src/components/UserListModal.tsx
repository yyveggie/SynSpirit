import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom'; // 用于链接到用户主页

// 定义列表中的用户信息接口
interface UserInfo {
  id: number;
  nickname: string;
  avatar: string | null;
}

interface UserListModalProps {
  isOpen: boolean;                // Modal 是否可见
  onClose: () => void;           // 关闭 Modal 的回调函数
  title: string;                  // Modal 标题 ("关注列表" 或 "粉丝列表")
  users: UserInfo[];              // 要显示的用户列表
  isLoading: boolean;             // 是否正在加载列表数据
}

/**
 * @component UserListModal
 * @description 一个可重用的模态框组件，用于显示用户列表（关注/粉丝）。
 *              支持平滑动画过渡和现代UI设计。
 */
const UserListModal: React.FC<UserListModalProps> = ({ 
  isOpen,
  onClose,
  title,
  users,
  isLoading 
}) => {
  // 使用内部状态来控制动画，确保动画在挂载/卸载时正确执行
  const [showModal, setShowModal] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      // 打开动画：分两步执行
      setShowModal(true); // 先挂载组件
      // 确保模态框打开时禁止页面滚动
      document.body.style.overflow = 'hidden';
      
      // 短暂延迟后添加动画类，创造渐入效果
      timerRef.current = setTimeout(() => {
        setAnimationClass('modal-enter-active');
      }, 50); // 小延迟确保DOM已渲染
    } else {
      // 关闭动画：先设置关闭动画类
      setAnimationClass('modal-exit-active');
      
      // 等待动画结束后卸载
      timerRef.current = setTimeout(() => {
        setShowModal(false);
        // 恢复页面滚动
        document.body.style.overflow = '';
      }, 600); // 延长退出动画时间
    }
    
    return () => {
      // 清理定时器
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOpen]);

  // 如果内部状态为 false，则不渲染任何内容
  if (!showModal) {
    return null;
  }

  return (
    // 背景容器
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center ${animationClass}`}
      onClick={onClose}
      style={{
        // 添加过渡样式
        transition: 'opacity 500ms ease-out',
        opacity: animationClass === 'modal-enter-active' ? 1 : 0
      }}
    >
      {/* Modal 内容区域 - 使用渐变背景 */} 
      <div 
        className={`
          relative mb-16 
          overflow-hidden flex flex-col 
          w-full max-w-lg max-h-[85vh]
          rounded-2xl
          border border-white/10 
          shadow-[0_10px_40px_rgba(0,0,0,0.3)]
        `}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(59, 73, 111, 0.85) 0%, rgba(45, 51, 77, 0.9) 100%)',
          backdropFilter: 'blur(12px)',
          transform: animationClass === 'modal-enter-active' 
            ? 'translateY(0) scale(1)' 
            : 'translateY(80px) scale(0.95)',
          opacity: animationClass === 'modal-enter-active' ? 1 : 0,
          transition: 'transform 700ms cubic-bezier(0.19, 1, 0.22, 1), opacity 700ms cubic-bezier(0.19, 1, 0.22, 1)',
        }}
      >
        {/* 装饰性光晕效果 */}
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl pointer-events-none"></div>
        
        {/* Modal 头部 */} 
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 relative z-10">
          <h2 className="text-lg font-medium text-white">{title}</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all duration-300"
            aria-label="关闭"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal 内容 (用户列表) */} 
        <div className="p-4 overflow-y-auto flex-grow relative z-10">
          {isLoading ? (
            // 加载状态 - 更精致的加载动画
            <div className="flex flex-col justify-center items-center h-40 text-white/80">
              <div className="relative w-12 h-12 mb-4">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-400/20 border-t-indigo-400 animate-spin"></div>
              </div>
              <p className="text-sm font-light">正在加载用户列表...</p>
            </div>
          ) : users.length > 0 ? (
            // 用户列表 - 现代卡片式设计
            <ul className="space-y-1.5">
              {users.map(user => (
                <li key={user.id} className="group rounded-xl overflow-hidden hover:bg-white/10 transition-all duration-300">
                  <Link to={`/profile/${user.id}`} className="p-3 flex items-center space-x-3" onClick={onClose}> 
                    {/* 用户头像 */}
                    <div className="relative flex-shrink-0">
                      {user.avatar ? (
                        <img 
                          src={user.avatar} 
                          alt={`${user.nickname}的头像`} 
                          className="w-10 h-10 rounded-full object-cover border-2 border-transparent group-hover:border-indigo-400/60 transition-all duration-300"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-lg font-medium border-2 border-transparent group-hover:border-indigo-400/60 transition-all duration-300 shadow-inner">
                          {user.nickname?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/10 transition-colors duration-300"></div>
                    </div>
                    
                    {/* 用户名称 */}
                    <div className="flex-grow overflow-hidden">
                      <p className="font-medium text-white truncate group-hover:text-indigo-300 transition-colors duration-300">
                        {user.nickname || '未设置昵称'}
                      </p>
                    </div>
                    
                    {/* 箭头指示器 */}
                    <div className="text-white/40 group-hover:text-indigo-300 transform translate-x-0 group-hover:translate-x-2 transition-all duration-500 ease-out">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            // 空状态 - 优雅的设计
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <p className="text-white/60 font-light">暂无用户</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserListModal; 