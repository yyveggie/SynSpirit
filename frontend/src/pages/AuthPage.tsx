import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import '../assets/css/AuthPage.css'; // 我们将在这里编写新的CSS

const AuthPage: React.FC = () => {
  const location = useLocation(); // 在这里获取 location
  // 根据路径设置 isSignUpActive 的初始值
  const [isSignUpActive, setIsSignUpActive] = useState(location.pathname === '/register');
  const navigate = useNavigate();
  const { login, token } = useAuth();

  // --- 登录表单状态 ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // --- 注册表单状态 (稍后从 RegisterPage.tsx 迁移) ---
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  
  // --- 游客登录状态 ---
  const [guestLoading, setGuestLoading] = useState(false);

  // 清除所有提示消息的辅助函数
  const clearAllMessages = () => {
    setLoginError('');
    setLoginSuccessMessage('');
    setRegisterError('');
  };

  const fromPath = location.state?.from || '/';

  useEffect(() => {
    // 组件挂载时添加 class 到 body
    document.body.classList.add('auth-active');
    // 组件卸载时移除 class
    return () => {
      document.body.classList.remove('auth-active');
    };
  }, []); // 空依赖数组，确保只在挂载和卸载时运行

  useEffect(() => {
    if (token) {
      navigate(fromPath);
    }
  }, [token, navigate, fromPath]);

  // 新增 useEffect 以响应路径变化，确保直接访问 /register 时激活注册面板
  useEffect(() => {
    if (location.pathname === '/register') {
      setIsSignUpActive(true);
      clearAllMessages(); // 路径切换时清除消息
    } else if (location.pathname === '/login') {
      setIsSignUpActive(false);
      clearAllMessages(); // 路径切换时清除消息
    }
  }, [location.pathname]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAllMessages(); // 尝试登录时清除所有消息
    setLoginLoading(true);
    // ... (登录逻辑，从 LoginPage.tsx 迁移)
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { email: loginEmail, password: loginPassword });
      const result = await login(response.data.token, response.data.user);
      if (result.success) {
        navigate(fromPath);
      }
    } catch (err: any) {
      setLoginError(err.response?.data?.message || err.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAllMessages(); // 尝试注册时清除所有消息
    setRegisterError('');
    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('两次输入的密码不一致');
      return;
    }
    setRegisterLoading(true);
    // ... (注册逻辑，从 RegisterPage.tsx 迁移)
    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, { email: registerEmail, password: registerPassword });
      // 注册成功后，通常建议用户登录，或者也可以直接切换到登录面板并填充邮箱
      setIsSignUpActive(false); // 切换到登录面板
      setLoginEmail(registerEmail); // 预填邮箱
      // 清空注册表单和错误
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setRegisterError('');
      // 可以给一个提示，比如 "注册成功，请输入密码登录"
      setLoginSuccessMessage('注册成功！请使用上面预填的邮箱登录。');
    } catch (err: any) {
      setRegisterError(err.response?.data?.message || err.message || '注册失败');
    } finally {
      setRegisterLoading(false);
    }
  };
  
  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setLoginError(''); // 清除之前的登录错误
    setRegisterError(''); // 清除之前的注册错误

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
      await login(response.data.token, guestUser);
      localStorage.setItem('isGuest', 'true');
      navigate(fromPath);
    } catch (err: any) {
      // 根据当前活动的面板显示错误，或者一个通用的地方
      if (isSignUpActive) {
        setRegisterError(err.response?.data?.message || '游客登录失败，请重试');
      } else {
        setLoginError(err.response?.data?.message || '游客登录失败，请重试');
      }
    } finally {
      setGuestLoading(false);
    }
  };


  return (
    <div className="auth-page-container"> {/* 全屏背景容器 */}
      <div className={`container ${isSignUpActive ? 'right-panel-active' : ''}`} id="auth-container">
        {/* Sign Up Container (注册表单) */}
        <div className="form-container sign-up-container">
          <form onSubmit={handleRegisterSubmit}>
            <h1>创建账户</h1>
            {/* <div className="social-container">
              <a href="#" className="social"><i className="fab fa-facebook-f"></i></a>
              <a href="#" className="social"><i className="fab fa-google-plus-g"></i></a>
              <a href="#" className="social"><i className="fab fa-linkedin-in"></i></a>
            </div>
            <span>或使用您的邮箱注册</span> */}
            {/* 注册字段，稍后从 RegisterPage.tsx 详细填充 */}
            <input type="email" placeholder="邮箱" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} required />
            <input type="password" placeholder="密码" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} required />
            <input type="password" placeholder="确认密码" value={registerConfirmPassword} onChange={(e) => setRegisterConfirmPassword(e.target.value)} required />
            {registerError && <p className="error-message">{registerError}</p>}
            <button type="submit" disabled={registerLoading || guestLoading}>
              {registerLoading ? '注册中...' : '立即注册'}
            </button>
          </form>
        </div>

        {/* Sign In Container (登录表单) */}
        <div className="form-container sign-in-container">
          <form onSubmit={handleLoginSubmit}>
            <h1>登录</h1>
            {/* <div className="social-container">
              <a href="#" className="social"><i className="fab fa-facebook-f"></i></a>
              <a href="#" className="social"><i className="fab fa-google-plus-g"></i></a>
              <a href="#" className="social"><i className="fab fa-linkedin-in"></i></a>
            </div>
            <span>或使用您的账户</span> */}
            {/* 登录字段，已初步填充 */}
            <input 
              type="email" 
              placeholder="邮箱" 
              value={loginEmail} 
              onChange={(e) => {
                setLoginEmail(e.target.value);
                setLoginSuccessMessage('');
                setLoginError('');
              }} 
              required 
            />
            <input 
              type="password" 
              placeholder="密码" 
              value={loginPassword} 
              onChange={(e) => {
                setLoginPassword(e.target.value);
                setLoginSuccessMessage('');
                setLoginError('');
              }} 
              required 
            />
            {/* <Link to="/forgot-password" className="forgot-password-link">忘记密码？</Link> */}
            {loginError && <p className="error-message">{loginError}</p>}
            {loginSuccessMessage && <p className="success-message">{loginSuccessMessage}</p>}
            <button type="submit" disabled={loginLoading || guestLoading}>
              {loginLoading ? '登录中...' : '立即登录'}
            </button>
            
            {/* 游客登录按钮 - 放置在登录表单内部或外部，取决于设计 */}
            <button 
              type="button" 
              onClick={handleGuestLogin} 
              disabled={loginLoading || registerLoading || guestLoading} 
              className="ghost guest-login-button" // 稍后添加样式
            >
              {guestLoading ? '处理中...' : '作为游客继续'}
            </button>
          </form>
        </div>

        {/* Overlay Container (覆盖层) */}
        <div className="overlay-container">
          <div className="overlay">
            {/* Left Overlay Panel (当注册激活时，在左侧显示，提示去登录) */}
            <div className="overlay-panel overlay-left">
              <h1>欢迎回来！</h1>
              <p>要与我们保持联系，请使用您的个人信息登录</p>
              <button className="ghost" id="signInButton" onClick={() => {
                setIsSignUpActive(false);
                clearAllMessages(); // 点击按钮切换时清除消息
              }}>
                登录
              </button>
            </div>
            {/* Right Overlay Panel (当登录激活时，在右侧显示，提示去注册) */}
            <div className="overlay-panel overlay-right">
              <h1>你好，朋友！</h1>
              <p>输入您的个人详细信息，与我们一起开始旅程</p>
              <button className="ghost" id="signUpButton" onClick={() => {
                setIsSignUpActive(true);
                clearAllMessages(); // 点击按钮切换时清除消息
              }}>
                注册
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage; 