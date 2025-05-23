/**
 * 认证工具函数
 * 
 * 提供用于处理登录状态、Token刷新等功能的实用函数
 */

import axios from 'axios';
import { API_BASE_URL } from '../config';

/**
 * 检查本地存储的token是否有效
 * 向服务器发送验证请求
 */
export const validateToken = async (): Promise<boolean> => {
  const token = localStorage.getItem('token');
  
  if (!token || token === 'undefined') {
    console.log('[authUtils] 本地没有token，无需验证');
    return false;
  }
  
  try {
    // 使用单独的axios实例，避免触发全局拦截器
    const response = await axios.post(
      `${API_BASE_URL}/api/auth/verify-token`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.data.valid) {
      console.log('[authUtils] 令牌有效');
      return true;
    }
    console.log('[authUtils] 令牌无效');
    return false;
  } catch (error) {
    console.error('[authUtils] 验证令牌时出错:', error);
    return false;
  }
};

/**
 * 清除所有认证状态
 * 通常用于登出或会话过期
 */
export const clearAuthState = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('authUser');
  localStorage.removeItem('isGuest');
  console.log('[authUtils] 已清除所有认证状态');
};

/**
 * 检测是否为游客登录
 */
export const isGuestUser = (): boolean => {
  return localStorage.getItem('isGuest') === 'true';
};

/**
 * 从localStorage中获取token
 * 包含基本的有效性检查
 */
export const getStoredToken = (): string | null => {
  const token = localStorage.getItem('token');
  if (!token || token === 'undefined' || token === 'null') {
    return null;
  }
  return token;
};

/**
 * 安全地解析存储的用户数据
 */
export const getStoredUser = () => {
  const userJson = localStorage.getItem('authUser');
  if (!userJson) return null;
  
  try {
    return JSON.parse(userJson);
  } catch (error) {
    console.error('[authUtils] 解析用户数据失败:', error);
    return null;
  }
};

/**
 * 检查用户是否已登录
 * 仅检查本地存储状态，不发送网络请求
 */
export const isLoggedIn = (): boolean => {
  return !!getStoredToken() && !!getStoredUser();
}; 