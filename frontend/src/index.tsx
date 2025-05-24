/**
 * 应用入口文件
 * 
 * 主要职责:
 * 1. 初始化 React 应用根节点。
 * 2. 配置全局 Axios 实例 (请求拦截、基础 URL)。
 * 3. 设置 React Query (TanStack Query) 的 QueryClientProvider，提供全局数据缓存能力。
 *    - 配置默认的缓存策略 (staleTime, gcTime)。
 * 4. 包裹应用核心组件 App，并提供 AuthProvider 和 BrowserRouter。
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Tailwind styles are likely included here
import './styles/typography.css'; // 导入字体样式
import './assets/css/performance-modes.css'; // 导入性能模式CSS
import './components/FixHighContrastWarning.css'; // 导入修复高对比度警告的CSS
import 'antd/dist/reset.css'; // 引入 Ant Design v5 的重置样式
import 'react-toastify/dist/ReactToastify.css';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider } from './context/AuthContext';
import { API_BASE_URL } from './config';
// 导入 React Query 相关模块
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ToastContainer } from 'react-toastify';
import App from './App'; // Restore missing App import
import reportWebVitals from './reportWebVitals';
import { initializeLazyLoading } from './utils/lazyLoadInitializer';
// 导入认证工具函数
import { getStoredToken } from './utils/authUtils';
// 导入字体配置
import { fontConfig } from './styles/fontConfig';

// 导入并使用性能监控组件（仅在开发环境中可见）
import PerformanceMonitor from './components/common/PerformanceMonitor';

// 在DOM加载完成后应用字体配置
document.addEventListener('DOMContentLoaded', () => {
  // 动态加载字体
  fontConfig.loadFontInHead();
  console.log('字体配置已应用');
});

// 拦截广告相关请求，减少控制台错误
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' 
      ? input 
      : input instanceof URL 
        ? input.href 
        : input instanceof Request 
          ? input.url 
          : '';
    
    // 如果是广告相关请求，返回空响应
    if (url.includes('doubleclick.net') || url.includes('ad_status.js')) {
      console.debug('广告请求已拦截:', url);
      return Promise.resolve(new Response('', { status: 200 }));
    }
    
    return originalFetch.call(this, input, init);
  };
  
  // 添加动态栏点击监听器，点击动态栏时关闭所有评论组件
  document.addEventListener('DOMContentLoaded', () => {
    const handleDynamicFeedClick = () => {
      // 通知所有评论组件关闭
      const closeEvent = new CustomEvent('close-all-comments');
      window.dispatchEvent(closeEvent);
    };
    
    // 监听动态栏点击事件
    setTimeout(() => {
      const dynamicFeed = document.getElementById('dynamic-feed');
      if (dynamicFeed) {
        // 添加点击事件
        dynamicFeed.addEventListener('click', handleDynamicFeedClick);
        console.log('Dynamic feed click handler attached');
      }
    }, 1000); // 给DOM加载一些时间
  });
}

// 创建一个 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5分钟
    },
  },
});

// 设置axios全局默认值
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.withCredentials = true;
// console.log("API基础URL:", API_BASE_URL);

// 添加请求拦截器
axios.interceptors.request.use(
  config => {
    // 使用安全的token获取方法
    const token = getStoredToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
      // console.log(`AXIOS请求: ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  error => {
    // console.error("AXIOS请求错误:", error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器 - 处理401错误
axios.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    if (error.response && error.response.status === 401) {
      console.log("接收到401未授权响应，但保留token状态由AuthContext管理");
      // 移除自动清除token的代码，避免干扰AuthContext的状态管理
      // localStorage.removeItem('token');
      // localStorage.removeItem('user');
      
      // 在这里不重定向，让路由守卫或组件自己处理
    }
    return Promise.reject(error);
  }
);

// 在应用启动时初始化懒加载
initializeLazyLoading();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <QueryClientProvider client={queryClient}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
          <App />
        <ToastContainer position="bottom-right" autoClose={3000} />
      </AuthProvider>
    </BrowserRouter>
    {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    <PerformanceMonitor />
    </QueryClientProvider>
);

// 如果你想要测量应用性能，可以传递一个函数
// 结果将被发送到特定的端点，详见: https://bit.ly/CRA-vitals
reportWebVitals((metric: { name: string; value: number; [key: string]: any }) => {
  // 可以在这里发送到分析服务或控制台记录
  if (process.env.NODE_ENV === 'development') {
    console.debug(`性能指标 [${metric.name}]: `, metric);
  }
});