import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateToken, getStoredToken, getStoredUser } from '../utils/authUtils';

interface AuthGuardProps {
  children: React.ReactElement;
  requireAuth?: boolean; // 是否需要登录才能访问
  adminOnly?: boolean;   // 是否只允许管理员访问
  guestAllowed?: boolean; // 是否允许游客访问
  redirectTo?: string;    // 重定向路径
}

/**
 * 认证守卫组件
 * 用于保护路由、验证登录状态，并在刷新时确保身份验证持久性
 */
const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = false,
  adminOnly = false,
  guestAllowed = true,
  redirectTo = '/login'
}) => {
  const { token, user, isLoading } = useAuth();
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState(false);

  // 增强的认证状态检查
  useEffect(() => {
    // 如果需要认证而且没有token或在加载中，验证token
    if (requireAuth && !isLoading && !token) {
      const checkToken = async () => {
        setIsValidating(true);
        
        // 1. 先检查localStorage中是否有token和user
        const storedToken = getStoredToken();
        const storedUser = getStoredUser();
        
        if (storedToken && storedUser) {
          // 如果localStorage中有token和user但上下文中没有，可能是新窗口未同步，先标记为有效
          console.log('[AuthGuard] 在localStorage中发现有效的token和user，但上下文中未同步');
          setIsValid(true);
        } else {
          // 2. 如果localStorage没有，再尝试与服务器验证
          const valid = await validateToken();
          setIsValid(valid);
        }
        
        setIsValidating(false);
      };
      
      checkToken();
    }
  }, [requireAuth, token, isLoading]);

  // 处理加载状态
  if (isLoading || isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-center">
          <div className="text-lg text-gray-300">验证登录状态中...</div>
        </div>
      </div>
    );
  }

  // 需要认证但无有效token
  if (requireAuth && !token && !isValid) {
    // 记住当前路径，登录后可以回来
    console.log('[AuthGuard] 认证失败，重定向到:', redirectTo);
    return <Navigate to={redirectTo} state={{ from: location.pathname }} replace />;
  }

  // 管理员检查
  if (adminOnly && (!user?.is_admin)) {
    console.log('[AuthGuard] 需要管理员权限，重定向到首页');
    return <Navigate to="/" replace />;
  }

  // 游客检查
  if (!guestAllowed && localStorage.getItem('isGuest') === 'true') {
    console.log('[AuthGuard] 不允许游客访问，重定向到首页');
    return <Navigate to="/" replace />;
  }

  // 通过所有检查，渲染子组件
  return children;
};

export default AuthGuard; 