import React, { createContext, useState, useContext, useEffect, ReactNode, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export interface User {
  id: number;
  email: string;
  nickname: string;
  is_admin: boolean;
  avatar: string | null;
  bio: string | null;
  tags: string[];
  // ... 可根据需要添加更多字段
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (
    credentialsOrToken: string | { username: string; password: string }, 
    userData?: User
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<void>;
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  updateUser: (updatedFields: Partial<User>) => void;
}

// 创建上下文
const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // 使用 useRef 存储标志，指示是否已尝试从 localStorage 恢复认证状态
  const initialLoadAttempted = useRef(false);
  
  // 使用 useRef 存储真实的 token 值，确保在组件生命周期内引用稳定
  const stableTokenRef = useRef<string | null>(null);
  
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true); // Start loading until checked localStorage
  const [error, setError] = useState<string | null>(null);

  // 创建稳定的 setToken 函数，同时更新 state 和 ref
  const setStableToken = (newToken: string | null) => {
    stableTokenRef.current = newToken;
    setToken(newToken);
  };

  // 增强版本的localStorage读取函数，增加重试和错误处理
  const getFromLocalStorage = (key: string, retries = 3): string | null => {
    let attempt = 0;
    let value = null;
    
    while (attempt < retries && value === null) {
      try {
        value = localStorage.getItem(key);
        if (value === "undefined") {
          console.warn(`[AuthContext] localStorage中的${key}值为"undefined"字符串，视为无效`);
          value = null;
        }
      } catch (error) {
        console.error(`[AuthContext] 读取localStorage[${key}]失败，尝试第${attempt+1}次`, error);
      }
      attempt++;
    }
    
    return value;
  };

  // 增强版本的localStorage写入函数
  const setToLocalStorage = (key: string, value: string | null): boolean => {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
      return true;
    } catch (error) {
      console.error(`[AuthContext] 写入localStorage[${key}]失败`, error);
      return false;
    }
  };

  // 在组件挂载时检查本地存储中的用户凭证
  useEffect(() => {
    // 防止多次尝试加载
    if (initialLoadAttempted.current) {
      return;
    }
    initialLoadAttempted.current = true;
    
    // 延迟一点点执行，确保localStorage已完全初始化
    const timer = setTimeout(() => {
      // 首先尝试从localStorage恢复用户状态
      try {
        const storedToken = getFromLocalStorage('token');
        const storedUser = getFromLocalStorage('authUser');
        
        console.log("[AuthContext] 初始化认证状态:", { token: storedToken ? "有token" : "无token" });
        
        // 确保token不是字符串"undefined"且不为null
        if (storedToken && storedUser) {
          stableTokenRef.current = storedToken; // 首先更新 ref
          setToken(storedToken); // 然后更新 state
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            setIsAuthenticated(true);
            console.log("[AuthContext] 从localStorage恢复用户登录状态:", parsedUser.email);
          } catch (parseError) {
            console.error("[AuthContext] 用户数据解析错误，自动登出", parseError);
            setToLocalStorage('token', null);
            setToLocalStorage('authUser', null);
            stableTokenRef.current = null;
            setToken(null);
            setUser(null);
            setIsAuthenticated(false);
          }
        } else {
          // 如果token是undefined字符串或null，清除localStorage并尝试cookie认证
          if (storedToken === "undefined" || !storedToken) {
            console.log("[AuthContext] 无本地token，尝试通过cookie获取用户信息");
            fetchUserInfo();
          }
        }
      } catch (error) {
        console.error("[AuthContext] 从localStorage加载认证状态失败", error);
        // 清除可能损坏的存储并尝试cookie认证
        setToLocalStorage('token', null);
        setToLocalStorage('authUser', null);
        fetchUserInfo();
      } finally {
        setIsLoading(false); // 完成加载状态
      }
    }, 100); // 短暂延迟确保DOM和localStorage完全就绪
    
    return () => clearTimeout(timer);
  }, []);

  // 获取用户信息
  const fetchUserInfo = async () => {
    setIsLoading(true);
    try {
      // 检查本地存储中的token
      const storedToken = localStorage.getItem('token');
      
      if (storedToken) {
        // 如果存在token，尝试获取用户信息
        const response = await axios.get(`${API_BASE_URL}/api/users/profile`, {
          headers: {
            Authorization: `Bearer ${storedToken}`
          },
          withCredentials: true // 同时发送cookie，支持会话认证
        });
        
        setUser(response.data.user);
        setIsAuthenticated(true);
        setToken(storedToken);
      } else {
        // 即使没有JWT，也尝试通过cookie获取用户信息（处理Flask-Login认证）
        try {
          const response = await axios.get(`${API_BASE_URL}/api/users/profile`, {
            withCredentials: true
          });
          
          // 如果请求成功但没有JWT，使用会话中的用户信息
          setUser(response.data.user);
          setIsAuthenticated(true);
          // 如果API返回了token，保存它
          if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            setToken(response.data.token);
          }
        } catch (error) {
          // 如果cookie认证也失败，则确认用户未登录
          setUser(null);
          setIsAuthenticated(false);
          setToken(null);
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      // 认证失败时清除本地存储的token
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 登录功能 - 重新实现使其同时兼容新旧API
  const login = async (credentialsOrToken: string | { username: string; password: string }, userData?: User) => {
    setIsLoading(true);
    try {
      // 处理兼容模式：直接传入token和user的情况
      if (typeof credentialsOrToken === 'string' && userData) {
        const token = credentialsOrToken;
        // 直接设置用户状态
        setToLocalStorage('token', token);
        setToLocalStorage('authUser', JSON.stringify(userData));
        stableTokenRef.current = token;
        setToken(token);
        setUser(userData);
        setIsAuthenticated(true);
        setError(null);
        return { success: true, user: userData };
      }
      
      // 处理新API：传入凭证对象的情况
      const credentials = typeof credentialsOrToken === 'object' 
        ? credentialsOrToken 
        : { username: '', password: '' };
        
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, credentials, {
        withCredentials: true // 确保接收服务器设置的cookie
      });
      
      const { token, user } = response.data;
      
      // 保存token到本地存储
      if (token) {
        setToLocalStorage('token', token);
        setToLocalStorage('authUser', JSON.stringify(user));
        stableTokenRef.current = token;
      }
      
      setUser(user);
      setIsAuthenticated(true);
      setError(null);
      
      return { success: true, user };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || '登录失败，请检查用户名和密码';
      setError(errorMessage);
      setIsAuthenticated(false);
      setUser(null);
      stableTokenRef.current = null;
      setToken(null);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  // 注销功能
  const logout = async () => {
    setIsLoading(true);
    try {
      // 调用登出API端点（如果后端有提供）
      await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
        withCredentials: true // 确保发送cookie以便服务器可以清除会话
      });
    } catch (error) {
      console.error('登出API调用失败，继续前端登出:', error);
    } finally {
      // 无论API调用成功与否，都清除前端状态
      setToLocalStorage('token', null);
      setToLocalStorage('authUser', null);
      setToLocalStorage('isGuest', null); // 确保移除游客标记（如果有）
      stableTokenRef.current = null; // 更新 ref
      setToken(null); // 更新 state
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const updateUser = (updatedFields: Partial<User>) => {
    setUser(prevUser => {
      if (prevUser) {
        const newUser = { ...prevUser, ...updatedFields };
        try {
          // 更新 localStorage
          setToLocalStorage('authUser', JSON.stringify(newUser));
          console.log("[AuthContext] 更新用户信息:", newUser);
        } catch (error) {
          console.error("[AuthContext] 更新 localStorage 用户数据失败:", error);
        }
        return newUser;
      } 
      return null; // 如果 prevUser 不存在，则不更新
    });
  };

  // 使用 useRef 中的值，确保在路由变化引起的重渲染过程中，token 保持稳定
  const getStableToken = () => {
    // 在罕见情况下，如果组件树更新过程中 token 状态与 ref 不同，
    // 优先使用 ref 中的值，因为它更稳定
    if (token !== stableTokenRef.current) {
      console.log(`[AuthContext] 检测到 token 不稳定: state(${token}) !== ref(${stableTokenRef.current}), 使用 ref 值`);
      
      // 如果 ref 有值但 state 没有，同步更新 state
      // 这可以解决在路由切换时 token 短暂丢失的问题
      if (stableTokenRef.current && !token) {
        console.log("[AuthContext] 从 ref 恢复 token 到 state");
        setToken(stableTokenRef.current);
      }
      
      return stableTokenRef.current;
    }
    return token;
  };

  // 增加一个同步方法，用于在需要时手动触发localStorage同步
  const syncWithLocalStorage = () => {
    const storedToken = getFromLocalStorage('token');
    const storedUser = getFromLocalStorage('authUser');
    
    if (storedToken && !token) {
      stableTokenRef.current = storedToken;
      setToken(storedToken);
      console.log("[AuthContext] 手动同步: 从localStorage恢复token");
    }
    
    if (storedUser && !user) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        console.log("[AuthContext] 手动同步: 从localStorage恢复用户数据");
      } catch (error) {
        console.error("[AuthContext] 手动同步: 用户数据解析失败", error);
      }
    }
  };

  // 每次路由变化时检查token状态
  useEffect(() => {
    const pathname = window.location.pathname;
    if (!token && !isLoading) {
      syncWithLocalStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.pathname]); // 仅在路径变化时运行

  const value = {
    token: getStableToken(), // 使用稳定的 token 值
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    setToken,
    setUser,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 