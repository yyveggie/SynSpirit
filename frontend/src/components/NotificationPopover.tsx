import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Check, CheckCheck, RefreshCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Notification } from '../api/notificationApi';
import { 
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../api/notificationApi';

interface NotificationPopoverProps {
  onClose: () => void;
  onUpdateUnreadCount: (count: number) => void;
}

const NotificationPopover: React.FC<NotificationPopoverProps> = ({ 
  onClose, 
  onUpdateUnreadCount 
}) => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [unreadFilter, setUnreadFilter] = useState<boolean>(false);
  const retryCount = useRef<number>(0);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  
  // 基于所有通知和过滤条件计算出当前要显示的通知
  const filteredNotifications = useMemo(() => {
    return unreadFilter
      ? allNotifications.filter(n => !n.is_read)
      : allNotifications;
  }, [allNotifications, unreadFilter]);
  
  // 验证是否有有效的登录状态
  const hasValidAuth = (): boolean => {
    // 从localStorage直接获取token，而不是依赖AuthContext中的token状态
    // 这样可以避免在重新渲染或状态同步中出现延迟的问题
    const localStorageToken = localStorage.getItem('token');
    const contextToken = token;
    
    // 调试输出
    console.log('[通知] 验证认证状态:', { 
      hasContextToken: !!contextToken, 
      hasLocalToken: !!localStorageToken,
      hasUser: !!user
    });
    
    // 同时检查localStorage和Context中的token
    return !!(localStorageToken || contextToken) && !!user;
  };

  // 加载通知
  const loadNotifications = async (silent: boolean = false) => {
    if (!hasValidAuth()) {
      setError('未登录或会话已过期');
      return;
    }
    
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    
    try {
      // 添加额外的调试日志
      const token = localStorage.getItem('token');
      console.log('[通知] 开始获取通知列表...', {
        使用的令牌前10位: token ? `${token.substring(0, 10)}...` : '无',
        页码: page,
        每页数量: 10,
        仅未读: false // 始终获取所有通知
      });
      
      // 始终获取全部通知（不传过滤器），在前端进行过滤
      const result = await fetchNotifications(page, 10, false);
      console.log('[通知] 获取到通知列表:', result);
      setAllNotifications(result.notifications);
      setTotalPages(result.pages);
      
      // 重置重试计数
      retryCount.current = 0;
      
      // 更新未读数
      const unreadCount = result.notifications.filter((n: Notification) => !n.is_read).length;
      onUpdateUnreadCount(unreadCount);
    } catch (error: any) {
      console.error('[通知] 获取通知失败', error);
      
      // 更详细地记录错误信息
      console.error('[通知] 错误详情:', {
        状态码: error.response?.status,
        错误消息: error.response?.data?.message || error.message,
        错误类型: error.name,
        请求URL: error.config?.url
      });
      
      // 检查是否是401错误（未授权）
      const isAuthError = error && (error.response?.status === 401 || error.status === 401);
      
      if (isAuthError) {
        setError('认证失败，请重新登录');
        
        // 认证错误时，可以尝试将错误信息发送到上层组件
        // 例如可以调用onAuthError函数（如果有的话）
        console.warn('[通知] 检测到认证错误，请检查登录状态');
      } else {
        setError('获取通知失败，请稍后再试');
      }
      
      // 如果首次加载失败且尝试次数少于3次，自动重试
      if (retryCount.current < 3 && !isAuthError) {
        retryCount.current += 1;
        console.log(`[通知] 将在2秒后进行第${retryCount.current}次重试`);
        setTimeout(() => loadNotifications(true), 2000);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };
  
  // 初始化加载
  useEffect(() => {
    loadNotifications();
  }, [page]); // 只依赖于页码，不依赖于过滤器

  // 处理通知点击
  const handleNotificationClick = async (notification: Notification) => {
    if (!hasValidAuth()) return;
    
    try {
      // 如果未读，标记为已读
      if (!notification.is_read) {
        await markNotificationAsRead(notification.id);
        
        // 更新本地状态
        setAllNotifications(prev => 
          prev.map(n => 
            n.id === notification.id ? { ...n, is_read: true } : n
          )
        );
        
        // 更新未读数
        onUpdateUnreadCount(allNotifications.filter(n => !n.is_read && n.id !== notification.id).length);
      }
      
      // 关闭弹窗
      onClose();
      
      // 导航到相关链接
      if (notification.related_url) {
        // 检查是否需要在新窗口打开链接
        if (notification.related_url.includes('/profile/')) {
          window.open(notification.related_url, '_blank');
        } else {
          navigate(notification.related_url);
        }
      }
    } catch (error: any) {
      console.error('[通知] 标记通知已读失败', error);
      // 即使标记失败也允许导航
      if (notification.related_url) {
        onClose();
        if (notification.related_url.includes('/profile/')) {
          window.open(notification.related_url, '_blank');
        } else {
          navigate(notification.related_url);
        }
      }
    }
  };

  // 标记所有为已读
  const handleMarkAllAsRead = async () => {
    if (!hasValidAuth()) return;
    
    // 如果没有通知或全部已读，无需操作
    if (allNotifications.length === 0 || allNotifications.every(n => n.is_read)) {
      return;
    }
    
    try {
      await markAllNotificationsAsRead();
      
      // 更新本地状态
      setAllNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      
      // 更新未读数
      onUpdateUnreadCount(0);
    } catch (error) {
      console.error('[通知] 标记全部已读失败', error);
    }
  };

  // 格式化时间
  const formatTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
    } catch (error) {
      console.error('[通知] 时间格式化失败', error);
      return timeString;
    }
  };

  // 处理图片加载错误
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = 'https://via.placeholder.com/32x32?text=?';
  };

  // 尝试重新加载
  const handleRetry = () => {
    setError(null);
    loadNotifications();
  };

  // 切换过滤器的处理函数
  const handleFilterChange = (showUnreadOnly: boolean) => {
    setUnreadFilter(showUnreadOnly);
  };

  return (
    <div className="flex flex-col w-full">
      {/* 顶部过滤器和操作栏 */}
      <div className="flex justify-between items-center py-2 px-3 border-b border-gray-200/50">
        <div className="flex space-x-2">
          <button
            className={`text-xs py-1 px-2 rounded text-black ${
              !unreadFilter 
                ? 'bg-gray-200/70 font-medium' 
                : 'hover:bg-gray-100/70'
            }`}
            onClick={() => handleFilterChange(false)}
          >
            全部
          </button>
          <button
            className={`text-xs py-1 px-2 rounded text-black ${
              unreadFilter 
                ? 'bg-gray-200/70 font-medium' 
                : 'hover:bg-gray-100/70'
            }`}
            onClick={() => handleFilterChange(true)}
          >
            未读
          </button>
        </div>
        <button
          className="text-xs text-black py-1 px-2 rounded flex items-center space-x-1 hover:bg-gray-100/70"
          onClick={handleMarkAllAsRead}
          disabled={allNotifications.length === 0 || allNotifications.every(n => n.is_read)}
        >
          <CheckCheck className="h-3 w-3" />
          <span>全部已读</span>
        </button>
      </div>

      {/* 通知列表 */}
      <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
        {loading ? (
          <div className="py-8 flex justify-center items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-gray-600"></div>
          </div>
        ) : error ? (
          <div className="py-8 px-4 text-center">
            <p className="text-sm text-gray-600 mb-2">{error}</p>
            <button
              className="text-xs bg-gray-200 text-gray-700 py-1 px-3 rounded-full flex items-center mx-auto space-x-1 hover:bg-gray-300"
              onClick={handleRetry}
            >
              <RefreshCcw className="h-3 w-3" />
              <span>重试</span>
            </button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 px-4 text-center text-gray-600">
            <p className="text-sm">{unreadFilter ? '没有未读通知' : '暂无通知'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredNotifications.map((notification) => (
              <li 
                key={notification.id}
                className={`p-3 hover:bg-gray-100 cursor-pointer transition-colors duration-200 flex items-start space-x-3 ${
                  !notification.is_read ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                {notification.actor && notification.actor.avatar && (
                  <img 
                    src={notification.actor.avatar} 
                    alt={notification.actor.nickname || '用户头像'} 
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                    onError={handleImageError}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-black truncate">
                      {notification.actor?.nickname || '系统通知'}
                    </span>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatTime(notification.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2">
                    {notification.content}
                  </p>
                  {!notification.is_read && (
                    <div className="mt-1 flex justify-end">
                      <span className="inline-flex items-center bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-[10px]">
                        <span className="h-1.5 w-1.5 bg-green-500 rounded-full mr-1"></span>
                        新消息
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 分页控制 */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex justify-between items-center px-3 py-2 border-t border-gray-200">
          <button
            className="text-xs text-gray-600 hover:text-black disabled:text-gray-400 disabled:cursor-not-allowed"
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            上一页
          </button>
          <span className="text-xs text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            className="text-xs text-gray-600 hover:text-black disabled:text-gray-400 disabled:cursor-not-allowed"
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationPopover; 