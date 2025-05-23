/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了用户登录页面的 React 组件。
 *
 * 主要功能:
 * - 提供邮箱和密码输入框。
 * - 调用后端登录 API 验证用户凭据。
 * - 处理登录成功 (如保存 token, 重定向) 或失败 (显示错误消息)。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

// 动画定义 (确保在 CSS 中已定义)
/*
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
*/

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false); // 单独处理游客登录loading
  const navigate = useNavigate();
  const location = useLocation();
  const { login, token } = useAuth();
  
  const fromPath = location.state?.from || '/';
  const registerSuccessMessage = location.state?.message; // 接收注册成功消息

  useEffect(() => {
    if (token) {
      console.log("用户已登录，返回页面:", fromPath);
      navigate(fromPath);
    }
  }, [token, navigate, fromPath]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setGuestLoading(false);

    try {
      const response = await axios({
        method: 'post',
        url: `${API_BASE_URL}/api/auth/login`,
        data: { email, password },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        maxRedirects: 0
      }).catch(redirectError => {
        if (redirectError.response && redirectError.response.status >= 300 && redirectError.response.status < 400) {
          console.error("后端返回了重定向，检查后端API路由和认证中间件是否正确处理AJAX请求。", redirectError.response.headers.location);
          throw new Error('服务器配置错误，无法完成登录。');
        }
        throw redirectError;
      });
      
      if (!response.data.token) {
        throw new Error(response.data.message || "服务器未返回有效令牌");
      }
      
      const result = await login(response.data.token, response.data.user);
      
      // 如果登录成功，短暂延迟确保状态更新后再跳转
      if (result.success) {
        setTimeout(() => navigate(fromPath), 100);
      }
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          err.message || 
                          '登录失败，请检查邮箱和密码';
        setError(errorMessage);
      console.error("登录失败详情:", err.response || err);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(false);
    setGuestLoading(true); // 启用游客按钮 loading
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/guest-login`);
      const guestUser = {
        id: 0, 
        email: 'guest@example.com',
        nickname: '游客',
        is_admin: false,
        avatar: null,
        bio: null,
        tags: []
      };
      const result = await login(response.data.token, guestUser);
      localStorage.setItem('isGuest', 'true');
      
      // 如果登录成功，延迟跳转
      if (result.success) {
        setTimeout(() => navigate(fromPath), 100);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || '游客登录失败，请重试');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-transparent p-4" 
    >
      {/* 添加动画效果 */}
      <div className="max-w-md w-full bg-black/30 backdrop-blur-xl p-8 rounded-xl shadow-2xl animate-fade-in-up border border-white/10">
        <h2 className="text-3xl font-bold text-center text-white mb-8 tracking-wide">欢迎回来</h2>
        
        {/* 显示注册成功消息 */}
        {registerSuccessMessage && (
          <div className="mb-6 p-3 bg-green-900/50 border border-green-700/50 text-green-100 rounded-md text-sm">
            {registerSuccessMessage}
          </div>
        )}
        
        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-3 bg-red-900/50 border border-red-700/50 text-red-100 rounded-md text-sm transition-opacity duration-300">
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <label htmlFor="email" className="block text-xs font-medium text-gray-300 absolute -top-2 left-3 bg-black/30 px-1 rounded">
              电子邮箱
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email" // 添加自动完成
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // 输入框新样式
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 focus:ring-0 text-white placeholder-gray-400 transition-colors duration-300 text-sm"
              placeholder="you@example.com"
            />
          </div>
          
          <div className="relative">
            <label htmlFor="password" className="block text-xs font-medium text-gray-300 absolute -top-2 left-3 bg-black/30 px-1 rounded">
              密码
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password" // 添加自动完成
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // 输入框新样式
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 focus:ring-0 text-white placeholder-gray-400 transition-colors duration-300 text-sm"
              placeholder="输入您的密码"
            />
          </div>
          
           {/* 忘记密码链接 (可选) */}
           {/* 
           <div className="text-right">
               <Link to="/forgot-password" className="text-xs text-gray-400 hover:text-white hover:underline">
                   忘记密码？
               </Link>
           </div>
           */}

          {/* 登录按钮 */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || guestLoading}
              // 主按钮新样式 (深灰/或其他深色)
              className={`w-full py-3 px-4 rounded-lg text-white font-semibold text-sm
                          transition-all duration-300 ease-in-out transform 
                          ${(loading || guestLoading) ? 'bg-gray-600 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-black/30 active:scale-95'}`}
            >
              {loading ? (
                 <div className="flex justify-center items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登录中...
                </div>
              ) : '立即登录'}
            </button>
          </div>
        </form>
        
        <div className="mt-6 flex flex-col space-y-4">
          {/* 游客登录按钮 */}
          <button
            onClick={handleGuestLogin}
            disabled={loading || guestLoading}
            // 次要按钮新样式 (透明边框)
            className={`w-full py-2.5 px-4 border border-white/40 rounded-lg text-white font-medium text-sm
                        transition-all duration-300 ease-in-out transform
                        ${(loading || guestLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 hover:border-white/60 hover:scale-[1.02] focus:outline-none focus:ring-1 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-black/30 active:scale-95'}`}
          >
             {guestLoading ? (
                 <div className="flex justify-center items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  处理中...
                </div>
              ) : '作为游客继续'}
          </button>
          
          {/* 切换到注册 */}
          <div className="text-center">
            <p className="text-sm text-gray-300">
              还没有账户？
          <Link
            to="/register"
                // 切换链接新样式
                className="ml-1 font-medium text-emerald-400 hover:text-emerald-300 hover:underline transition-colors duration-200"
          >
                免费注册
          </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 