/**
 * 此文件定义了 Navbar 组件，即应用程序的顶部导航栏。
 *
 * 主要功能:
 * - 显示网站 Logo 或名称。
 * - 提供主要的导航链接 (如文章、工具、社区等)，可在新窗口中打开。
 * - 可能包含用户状态显示 (登录/注册按钮或用户头像/菜单)。
 * - 整合了原侧边栏的导航功能，顶部水平显示
 * - 在不同屏幕尺寸下可能具有响应式布局。
 * - 导航内容居中显示，与页面主内容对齐
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useUserFavorites, FavoriteItem } from '../hooks/useFavoriteQueries';
import { useQueryClient } from '@tanstack/react-query';
import CustomLink from './CustomLink';
import { useLinkBehavior } from '../contexts/LinkBehaviorContext';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationIcon from './NotificationIcon';

// 简易的工具提示组件
const SimpleTooltip = ({ text, isVisible }: { text: string, isVisible: boolean }) => {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  // 初始化Portal节点
  useEffect(() => {
    let node = document.getElementById('simple-tooltip-portal');
    if (!node) {
      node = document.createElement('div');
      node.id = 'simple-tooltip-portal';
      document.body.appendChild(node);
    }
    setPortalNode(node);
  }, []);
  
  // 计算位置
  useEffect(() => {
    if (isVisible) {
      const handleMouseMove = (e: MouseEvent) => {
        setPosition({
          left: e.clientX - 50,
          top: e.clientY + 20
        });
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      
      if (window.event instanceof MouseEvent) {
        handleMouseMove(window.event);
      }
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [isVisible]);
  
  if (!portalNode || !isVisible) return null;
  
  return ReactDOM.createPortal(
    <motion.div 
      className="fixed z-[9999] bg-gray-800 text-white rounded-md shadow-lg px-3 py-2 text-sm"
      style={{ 
        top: `${position.top}px`, 
        left: `${position.left}px`,
        pointerEvents: 'none'
      }}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={{ duration: 0.2 }}
    >
      {text}
    </motion.div>,
    portalNode
  );
};

// 通用导航链接组件，确保所有顶部链接行为一致
const NavLink = ({ to, children, title }: { to: string; children: React.ReactNode; title?: string }) => {
  const location = useLocation();
  
  // 检查链接是否处于活动状态
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };
  
  // 复用Navbar组件中的openInNewTabWithPreload方法
  const openInNewTabWithPreload = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const preloadUrl = `/preload.html?redirect=${encodeURIComponent(url)}`;
    const newWindow = window.open(preloadUrl, '_blank');
    if (newWindow) {
      newWindow.opener = null;
    }
  };
  
  return (
    <Link
      to={to}
      onClick={openInNewTabWithPreload(to)}
      title={title || String(children)}
      className={`flex items-center px-2 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        isActive(to)
          ? 'text-black bg-gradient-to-r from-green-200/30 to-blue-200/30 opacity-100 shadow-inner'
          : 'text-black hover:bg-gradient-to-r hover:from-green-200/10 hover:to-blue-200/10 hover:opacity-90 hover:shadow-sm'
      }`}
    >
      {children}
    </Link>
  );
};

const Navbar: React.FC<{ className?: string }> = ({ className }) => {
  const { token, user, logout, isLoading } = useAuth();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { openInNewTab, toggleOpenInNewTab } = useLinkBehavior();
  const menuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

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

  const handleLogout = () => {
    logout();
  };

  // 辅助函数：在新窗口中使用预加载页面打开链接
  const openInNewTabWithPreload = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const preloadUrl = `/preload.html?redirect=${encodeURIComponent(url)}`;
    const newWindow = window.open(preloadUrl, '_blank');
    if (newWindow) {
      newWindow.opener = null;
    }
  };

  const [writeTooltip, setWriteTooltip] = useState(false);
  const [shareTooltip, setShareTooltip] = useState(false);
  const [profileTooltip, setProfileTooltip] = useState(false);
  const [isWriteMenuOpen, setIsWriteMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // 处理点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsWriteMenuOpen(false);
      }
      
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    // 只有当菜单打开时，才添加点击事件监听器
    if (isWriteMenuOpen || isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isWriteMenuOpen, isProfileMenuOpen]);

  // 在新窗口打开个人主页
  const goToProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
    setIsProfileMenuOpen(false);
    
    // 检查用户是否已登录
    if (token && user) {
      // 构建URL，添加时间戳参数防止缓存问题
      const profileUrl = `/profile/me?t=${Date.now()}`;
      
      // 创建新的a标签并模拟点击
      const a = document.createElement('a');
      a.href = profileUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 0);
    } else {
      // 如果用户未登录，则在当前窗口导航到登录页
      navigate('/login', { state: { from: '/profile/me' } });
    }
  };

  // 处理退出登录
  const handleLogoutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProfileMenuOpen(false);
    logout();
    navigate('/login');
  };

  if (isLoading) {
    return null;
  }

  return (
    <nav className={`py-4 z-40 bg-transparent ${className || ''}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <CustomLink 
              to="/" 
              forceSameTab={true}
              className="flex items-center text-xl font-serif font-semibold text-black hover:text-gray-700 transition-colors duration-200"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
            >
              SynSpirit
            </CustomLink>
          </div>

          {/* 中间的导航链接区域 */}
          <div className="hidden md:flex items-center space-x-6">
            <NavLink to="/articles" title="文章">文章</NavLink>
            <NavLink to="/tools" title="工具">工具</NavLink>
            
            {user && (
              <>
                <NavLink to="/community" title="社区">社区</NavLink>
                <NavLink to="/space" title="空间">空间</NavLink>
              </>
            )}
          </div>
          
          <div className="flex space-x-8 items-center">
            {/* 右侧操作区域 */}
            <div className="flex items-center space-x-4">
              {!token ? (
                <>
                  <CustomLink
                    to="/login"
                    className="text-gray-300 hover:text-white transition-colors duration-200 text-sm"
                  >
                    登录
                  </CustomLink>
                  <CustomLink
                    to="/register"
                    className="bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white px-4 py-1.5 rounded-full text-sm transition-all duration-300 shadow hover:shadow-lg"
                  >
                    注册
                  </CustomLink>
                </>
              ) : (
                <>
                  {/* 写文章/动态按钮 - 修改为动画下拉菜单 */}
                  <div className="relative" ref={menuRef}>
                    <motion.button
                      onClick={() => setIsWriteMenuOpen(!isWriteMenuOpen)}
                      className="z-50 flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 hover:bg-white/10"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-label="创建新内容"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M12 4V20" stroke="black" strokeWidth="2.2" strokeLinecap="round" />
                        <path d="M4 12H20" stroke="black" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </motion.button>
                    
                    {/* 动画下拉菜单 */}
                    <AnimatePresence>
                      {isWriteMenuOpen && (
                        <motion.div 
                          className="absolute right-0 top-full mt-1 w-28 z-50 flex flex-col items-start"
                          initial={{ opacity: 0, y: -5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -5, scale: 0.95 }}
                          transition={{ 
                            duration: 0.15,
                            ease: [0.4, 0, 0.2, 1]
                          }}
                        >
                          <motion.div 
                            className="w-full bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden"
                            variants={{
                              hidden: { opacity: 0 },
                              show: { opacity: 1 }
                            }}
                          >
                            <motion.div
                              initial={{ x: -5, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: 0.05, duration: 0.12 }}
                              className="w-full"
                            >
                              <CustomLink
                                to="/new-article"
                                className="block px-3 py-1.5 text-xs text-black font-medium hover:bg-gray-100 transition-colors duration-150 w-full text-left"
                                onClick={() => setIsWriteMenuOpen(false)}
                              >
                                写文章
                              </CustomLink>
                            </motion.div>
                            
                            <motion.div
                              initial={{ x: -5, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: 0.08, duration: 0.12 }}
                              className="w-full"
                            >
                              <button
                                className="block px-3 py-1.5 text-xs text-black font-medium hover:bg-gray-100 transition-colors duration-150 w-full text-left"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setIsWriteMenuOpen(false);
                                  // 分发自定义事件，主页组件监听此事件以打开动态发布窗口
                                  const event = new CustomEvent('openCreateDynamicModal');
                                  window.dispatchEvent(event);
                                }}
                              >
                                发动态
                              </button>
                            </motion.div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* 通知图标 */}
                  <div className="relative hidden md:block">
                    <NotificationIcon key={`notification-${user?.id || 'guest'}`} />
                  </div>
                  
                  {/* 个人资料图标 - 修改为带有菜单的按钮 */}
                  <div className="relative" ref={profileMenuRef}>
                    <button
                      onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                      className="border border-gray-600 rounded-full overflow-hidden hover:border-gray-400 transition-colors duration-200 flex items-center justify-center w-8 h-8"
                    >
                      {user && user.avatar ? (
                        <img 
                          src={user.avatar} 
                          alt={user.nickname || user.email || 'User avatar'} 
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://synspirit-test-131313901.cos.ap-shanghai.myqcloud.com/system/default_avatar.png';
                          }}
                        />
                      ) : (
                        <span className="text-white text-xs">
                          {user && user.nickname ? user.nickname.charAt(0).toUpperCase() : user && user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                        </span>
                      )}
                    </button>
                    
                    {/* 个人资料下拉菜单 */}
                    <AnimatePresence>
                      {isProfileMenuOpen && (
                        <motion.div 
                          className="absolute right-0 top-full mt-1 w-28 z-50 flex flex-col items-start"
                          initial={{ opacity: 0, y: -5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -5, scale: 0.95 }}
                          transition={{ 
                            duration: 0.15,
                            ease: [0.4, 0, 0.2, 1]
                          }}
                        >
                          <motion.div 
                            className="w-full bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden"
                            variants={{
                              hidden: { opacity: 0 },
                              show: { opacity: 1 }
                            }}
                          >
                            <motion.div
                              initial={{ x: -5, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: 0.05, duration: 0.12 }}
                              className="w-full"
                            >
                              <button
                                onClick={goToProfile}
                                className="block px-3 py-1.5 text-xs text-black font-medium hover:bg-gray-100 transition-colors duration-150 w-full text-left"
                              >
                                个人主页
                              </button>
                            </motion.div>
                            
                            <motion.div
                              initial={{ x: -5, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: 0.08, duration: 0.12 }}
                              className="w-full"
                            >
                              <button
                                onClick={handleLogoutClick}
                                className="block px-3 py-1.5 text-xs text-black font-medium hover:bg-gray-100 transition-colors duration-150 w-full text-left"
                              >
                                退出登录
                              </button>
                            </motion.div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
