import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchUnreadNotificationCount } from '../api/notificationApi';
import NotificationPopover from './NotificationPopover';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationIcon: React.FC = () => {
  const { user, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [shouldShow, setShouldShow] = useState<boolean>(true);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loadingRef = useRef<boolean>(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  
  // 验证是否有有效的登录状态
  const hasValidAuth = (): boolean => {
    return !!(token && user && localStorage.getItem('token'));
  };
  
  // 加载未读通知数量
  useEffect(() => {
    const loadUnreadCount = async () => {
      // 验证登录状态
      if (!hasValidAuth() || loadingRef.current) return;
      
      loadingRef.current = true;
      
      try {
        console.log('[通知] 开始获取未读通知数量...');
        const count = await fetchUnreadNotificationCount();
        console.log(`[通知] 获取到未读通知数量: ${count}`);
        setUnreadCount(count);
        setHasError(false);
        setErrorCount(0);
        setShouldShow(true);
      } catch (error) {
        console.error('[通知] 获取未读通知数量失败', error);
        // 检查是否是401错误（未授权）
        const isAuthError = error && (
          (error as any).response?.status === 401 || 
          (error as any).status === 401
        );
        
        if (isAuthError) {
          console.log('[通知] 认证错误，可能需要重新登录');
          setShouldShow(false); // 认证错误时隐藏通知图标
          return;
        }
        
        setHasError(true);
        setErrorCount(prev => prev + 1);
        
        if (errorCount >= 3) {
          console.log('[通知] 连续错误超过3次，暂时隐藏通知图标');
          setShouldShow(false);
          
          if (errorTimerRef.current) {
            clearTimeout(errorTimerRef.current);
          }
          
          errorTimerRef.current = setTimeout(() => {
            console.log('[通知] 尝试恢复显示通知图标');
            setShouldShow(true);
            setErrorCount(0);
            loadUnreadCount();
          }, 30000);
        }
      } finally {
        loadingRef.current = false;
      }
    };
    
    // 初始加载
    if (hasValidAuth()) {
      loadUnreadCount();
    }
    
    // 设置轮询
    const intervalId = setInterval(() => {
      if (hasValidAuth()) {
        loadUnreadCount();
      }
    }, 60000);
    
    return () => {
      clearInterval(intervalId);
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, [user, token, errorCount]);

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 打开/关闭通知面板
  const toggleNotifications = () => {
    if (hasError) {
      setHasError(false);
      if (!loadingRef.current && hasValidAuth()) {
        fetchUnreadNotificationCount()
          .then(count => {
            setUnreadCount(count);
            setIsOpen(true);
          })
          .catch(error => {
            console.error('[通知] 重试获取未读通知数量失败', error);
            setHasError(true);
          });
      }
      return;
    }
    setIsOpen(!isOpen);
  };

  // 手动更新未读数
  const updateUnreadCount = (newCount: number) => {
    setUnreadCount(newCount);
  };

  // 未登录或不应显示时不显示通知图标
  if (!hasValidAuth() || !shouldShow) return null;

  return (
    <div className="relative" ref={popoverRef}>
      <motion.button
        onClick={toggleNotifications}
        className={`z-50 flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 hover:bg-white/10 ${hasError ? 'opacity-50' : ''}`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={hasError ? "通知加载失败，点击重试" : "通知"}
      >
        <Bell className="h-5 w-5 text-[rgba(180,230,230,0.9)]" strokeWidth={2} />
        {!hasError && unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-4 w-4 flex items-center justify-center text-[9px] text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </motion.button>
      
      <AnimatePresence>
        {isOpen && !hasError && (
          <motion.div
            className="absolute right-0 top-full mt-1 w-80 z-50 flex flex-col items-start"
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ 
              duration: 0.15,
              ease: [0.4, 0, 0.2, 1]
            }}
          >
            <motion.div 
              className="w-full bg-gray-800/75 backdrop-blur-md border border-gray-700/30 shadow-xl rounded-lg overflow-hidden"
            >
              <div className="p-2">
                <NotificationPopover
                  onClose={() => setIsOpen(false)}
                  onUpdateUnreadCount={updateUnreadCount}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationIcon; 