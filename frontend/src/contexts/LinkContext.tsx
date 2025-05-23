/**
 * LinkContext.tsx
 * 
 * 用于解决React Router的Link组件嵌套问题。
 * 提供一个上下文，让子组件知道它们是否已经在Link（<a>标签）内部，
 * 以避免HTML验证错误：<a>标签不能嵌套在另一个<a>标签内。
 */
import React, { createContext, useContext, ReactNode } from 'react';

// 创建上下文，默认值为false（不在Link内部）
export const LinkContext = createContext<boolean>(false);

// 提供一个hook以便组件使用这个上下文
export const useInsideLink = () => useContext(LinkContext);

// 提供一个Provider组件，用于设置上下文值
interface LinkProviderProps {
  children: ReactNode;
  isInsideLink: boolean;
}

export const LinkProvider: React.FC<LinkProviderProps> = ({ children, isInsideLink }) => (
  <LinkContext.Provider value={isInsideLink}>
    {children}
  </LinkContext.Provider>
);

export default LinkContext; 