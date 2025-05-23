/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了用户注册页面的 React 组件。
 *
 * 主要功能:
 * - 提供邮箱和密码输入框供用户注册。
 * - 调用后端注册 API 创建新用户。
 * - 处理注册成功 (如自动登录, 重定向) 或失败 (显示错误消息)。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config'; // 确保导入 API_BASE_URL

// 简单的淡入动画 (可以在 index.css 或全局 css 中定义)
/*
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
*/

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    // 基本邮箱格式验证 (可以考虑更严格的正则)
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    // 密码强度验证 (可选)
    if (password.length < 6) {
        setError('密码长度至少需要6位');
      return;
    }
    
    setLoading(true);

    try {
      // 使用 API_BASE_URL 构建完整路径
      const response = await axios.post(`${API_BASE_URL}/api/auth/register`, { email, password });
      
      // 注册成功后通常不需要立即保存 token 和 user，而是引导用户去登录
      // 如果您的后端注册后直接返回 token 表示自动登录，则取消下面注释
      // localStorage.setItem('token', response.data.token);
      // localStorage.setItem('user', JSON.stringify(response.data.user));
      
      // 注册成功，可以跳转到登录页并带上提示
      navigate('/login', { state: { message: '注册成功，请登录' } }); 
      
    } catch (err: any) {
      setError(err.response?.data?.message || '注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-transparent p-4" 
    >
      {/* 添加动画效果 */}
      <div className="max-w-md w-full bg-black/30 backdrop-blur-xl p-8 rounded-xl shadow-2xl animate-fade-in-up border border-white/10">
        <h2 className="text-3xl font-bold text-center text-white mb-8 tracking-wide">创建您的账户</h2>
        
        {/* 错误提示样式优化 */}
        {error && (
          <div className="mb-6 p-3 bg-red-900/50 border border-red-700/50 text-red-100 rounded-md text-sm transition-opacity duration-300">
            {error}
          </div>
        )}
        
        <form onSubmit={handleRegister} className="space-y-6">
          {/* 输入框组 */}
          <div className="relative">
            <label htmlFor="email" className="block text-xs font-medium text-gray-300 absolute -top-2 left-3 bg-black/30 px-1 rounded">
              电子邮箱
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // 输入框新样式
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 focus:ring-0 text-white placeholder-gray-400 transition-colors duration-300 text-sm"
              placeholder="you@example.com"
            />
          </div>
          
          <div className="relative">
            <label htmlFor="password" className="block text-xs font-medium text-gray-300 absolute -top-2 left-3 bg-black/30 px-1 rounded">
              设置密码
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // 输入框新样式
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 focus:ring-0 text-white placeholder-gray-400 transition-colors duration-300 text-sm"
              placeholder="至少6位字符"
            />
          </div>
          
          <div className="relative">
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-gray-300 absolute -top-2 left-3 bg-black/30 px-1 rounded">
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              // 输入框新样式
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 focus:ring-0 text-white placeholder-gray-400 transition-colors duration-300 text-sm"
              placeholder="再次输入密码"
            />
          </div>
          
          {/* 注册按钮 */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              // 主按钮新样式 (深灰绿/或其他深色)
              className={`w-full py-3 px-4 rounded-lg text-white font-semibold text-sm
                          transition-all duration-300 ease-in-out transform 
                          ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-600 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black/30 active:scale-95'}`}
            >
              {loading ? (
                <div className="flex justify-center items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  注册中...
                </div>
              ) : '立即注册'}
            </button>
          </div>
        </form>
        
        {/* 切换到登录 */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-300">
            已经拥有账户？
            <Link 
              to="/login" 
              // 切换链接新样式
              className="ml-1 font-medium text-emerald-400 hover:text-emerald-300 hover:underline transition-colors duration-200"
            >
              前往登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage; 