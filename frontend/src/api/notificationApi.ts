import axios from 'axios';
import { API_BASE_URL } from '../config';

// 通知类型定义
export interface Notification {
  id: number;
  recipient_user_id: number;
  actor_user_id: number | null;
  actor: {
    id: number;
    nickname: string;
    avatar: string;
  } | null;
  action_type: string;
  target_type: string;
  target_id: number | null;
  content: string;
  is_read: boolean;
  created_at: string;
  related_url: string | null;
}

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  pages: number;
}

// 辅助函数：支持多种认证方式（Cookie & JWT）
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// 创建带凭证的axios实例，确保既发送JWT也发送Cookies
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 启用跨域请求发送cookies
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器添加认证头
apiClient.interceptors.request.use(config => {
  // 每次请求时动态获取最新的token，而不是使用缓存
  const token = localStorage.getItem('token');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
  }
  return config;
});

// 获取通知列表
export const fetchNotifications = async (
  page: number = 1, 
  pageSize: number = 10, 
  onlyUnread: boolean = false
): Promise<NotificationsResponse> => {
  try {
    const response = await apiClient.get('/api/notifications', {
      params: { 
        page, 
        per_page: pageSize,
        unread_only: onlyUnread
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 标记单个通知为已读
export const markNotificationAsRead = async (notificationId: number): Promise<void> => {
  try {
    await apiClient.put(`/api/notifications/${notificationId}/read`, {});
  } catch (error) {
    throw error;
  }
};

// 标记所有通知为已读
export const markAllNotificationsAsRead = async (): Promise<void> => {
  try {
    await apiClient.post('/api/notifications/mark-all-read', {});
  } catch (error) {
    throw error;
  }
};

// 获取未读通知数量
export const fetchUnreadNotificationCount = async (): Promise<number> => {
  try {
    const response = await apiClient.get('/api/notifications/unread-count');
    return response.data.unread_count;
  } catch (error) {
    return 0; // 出错时返回0，避免UI崩溃
  }
}; 