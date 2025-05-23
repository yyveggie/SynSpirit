import axios from 'axios';
import { API_BASE_URL } from '../config';

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器 - 添加认证令牌
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    // 只有当令牌存在且不是'undefined'字符串时才添加
    if (token && token !== 'undefined') {
      config.headers['Authorization'] = `Bearer ${token}`;
      console.log(`API请求: ${config.method?.toUpperCase()} ${config.url} (带令牌)`);
    } else {
      // 如果发现无效令牌，清除它
      if (token === 'undefined') {
        console.log("发现无效令牌'undefined'，从localStorage中清除");
        localStorage.removeItem('token');
      }
      console.log(`API请求: ${config.method?.toUpperCase()} ${config.url} (无令牌)`);
    }
    return config;
  },
  (error) => {
    console.error('请求拦截器错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理常见错误
api.interceptors.response.use(
  (response) => {
    console.log(`API响应: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.log('API错误:', error.response);
    
    // 处理常见的错误情况
    if (error.response) {
      console.error(`API错误: ${error.response.status} ${error.config?.url || '未知URL'}`);
      
      // 未认证或令牌无效 - 对通知API的401错误做特殊处理
      if (error.response.status === 401 || error.response.status === 422) {
        const url = error.config?.url || '';
        // 如果是通知API，不要触发登出行为
        if (url.includes('/api/notifications/')) {
          console.log('通知API认证失败，但不触发登出');
        } else {
          console.log('认证失败，可能需要重新登录');
          // 注意：不要在这里自动清除用户登录状态
          // window.location.href = '/login';
        }
      }
      
      // 服务器错误
      if (error.response.status >= 500) {
        console.error('服务器错误:', error.response.data);
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error('未收到服务器响应:', error.request);
      console.error('请求的URL:', error.config?.url);
      console.error('服务器可能未启动或网络问题');
    } else {
      // 请求配置出错
      console.error('请求配置错误:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default api; 