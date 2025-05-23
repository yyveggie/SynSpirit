/**
 * LinkBehaviorContext.tsx
 *
 * 全局链接行为管理上下文，用于控制应用中所有链接的行为：
 * - 可以控制链接是在当前窗口还是在新窗口打开
 * - 为链接打开提供一致的体验，减少闪屏问题
 * - 提供集中管理链接行为的能力
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface LinkBehaviorContextType {
  // 是否默认在新窗口打开内部链接
  openInNewTab: boolean;
  // 切换是否在新窗口打开内部链接
  toggleOpenInNewTab: () => void;
  // 打开新窗口的通用函数
  handleOpenInNewTab: (url: string) => (e: React.MouseEvent) => void;
}

// 创建上下文
const LinkBehaviorContext = createContext<LinkBehaviorContextType>({
  openInNewTab: true, // 默认值设为true
  toggleOpenInNewTab: () => {},
  handleOpenInNewTab: () => () => {},
});

// 自定义Hook方便使用此上下文
export const useLinkBehavior = () => useContext(LinkBehaviorContext);

interface LinkBehaviorProviderProps {
  children: ReactNode;
  defaultOpenInNewTab?: boolean;
}

export const LinkBehaviorProvider: React.FC<LinkBehaviorProviderProps> = ({ 
  children, 
  defaultOpenInNewTab = true
}) => {
  const [openInNewTab, setOpenInNewTab] = useState<boolean>(defaultOpenInNewTab);

  // 切换是否在新窗口打开链接
  const toggleOpenInNewTab = useCallback(() => {
    setOpenInNewTab(prev => !prev);
  }, []);

  // 通用的新窗口打开函数
  const handleOpenInNewTab = useCallback((url: string) => (e: React.MouseEvent) => {
    if (openInNewTab) {
      e.preventDefault();
      const newWindow = window.open(url, '_blank');
      // 设置背景色，尝试减少闪屏问题
      if (newWindow) {
        newWindow.opener = null;
        // 如果需要，可以尝试设置新窗口的背景色
        // 但注意这可能受到浏览器安全策略限制
      }
    }
    // 如果openInNewTab为false，则不阻止默认行为，让链接在当前窗口打开
  }, [openInNewTab]);

  return (
    <LinkBehaviorContext.Provider 
      value={{ 
        openInNewTab, 
        toggleOpenInNewTab,
        handleOpenInNewTab
      }}
    >
      {children}
    </LinkBehaviorContext.Provider>
  );
};

export default LinkBehaviorContext; 