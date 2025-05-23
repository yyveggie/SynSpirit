import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// 定义 Context 的类型
interface SidebarContextType {
  isSidebarOpen: boolean;
  isCommentSectionOpen: boolean;
  toggleSidebar: () => void;
  toggleSidebarForComment: (isCommentOpen: boolean) => void;
  closeCommentSection: () => void;
}

// 创建 Context，并提供一个默认值（虽然通常不会直接使用）
const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// 创建 Provider 组件
interface SidebarProviderProps {
  children: ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({ children }) => {
  const location = useLocation();

  // 修改默认值，让侧边栏默认不显示
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isCommentSectionOpen, setIsCommentSectionOpen] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);

  // 监听窗口尺寸变化
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 路由变化时关闭评论区
  useEffect(() => {
    if (isCommentSectionOpen) {
      setIsCommentSectionOpen(false);
      document.body.classList.remove('comments-open');
    }
  }, [location.pathname]);

  // 使用 useCallback 优化 toggle 函数，防止不必要的重渲染
  // 保留toggleSidebar功能，但实际上不会被使用
  const toggleSidebar = useCallback(() => {
    // 如果评论区打开，先关闭评论区
    if (isCommentSectionOpen) {
      document.body.classList.remove('comments-open');
      setIsCommentSectionOpen(false);
    }
    setIsSidebarOpen(prev => !prev);
  }, [isCommentSectionOpen]);

  // 评论区显示/隐藏时调整侧边栏和动态栏
  // 这个功能需要保留以确保评论区正常工作
  const toggleSidebarForComment = useCallback((isCommentOpen: boolean) => {
    setIsCommentSectionOpen(isCommentOpen);
    
    // 动态栏始终需要右移，通过添加类名控制
    document.body.classList.toggle('comments-open', isCommentOpen);
    
    // 移动设备上，打开评论区时自动关闭侧边栏
    if (windowWidth < 768 && isCommentOpen) {
      setIsSidebarOpen(false);
    }
  }, [windowWidth]);

  // 关闭评论区的便捷方法
  const closeCommentSection = useCallback(() => {
    setIsCommentSectionOpen(false);
    document.body.classList.remove('comments-open');
  }, []);

  // Context 的值
  const value = { 
    isSidebarOpen, 
    isCommentSectionOpen,
    toggleSidebar,
    toggleSidebarForComment,
    closeCommentSection
  };

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};

// 创建自定义 Hook，方便消费 Context
export const useSidebar = (): SidebarContextType => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar 必须在 SidebarProvider 内部使用');
  }
  return context;
}; 