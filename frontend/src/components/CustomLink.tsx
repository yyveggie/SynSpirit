/**
 * CustomLink.tsx
 * 
 * 自定义链接组件，替代React Router的Link组件。
 * 使用LinkBehaviorContext控制链接行为，实现全局一致的链接打开方式：
 * - 根据上下文决定是在当前窗口还是新窗口打开链接
 * - 提供更一致的用户体验
 * - 减少页面切换时的闪屏问题
 */
import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { useLinkBehavior } from '../contexts/LinkBehaviorContext';
import { useInsideLink } from '../contexts/LinkContext';

interface CustomLinkProps extends LinkProps {
  // 是否覆盖全局设置，强制在新窗口打开
  forceNewTab?: boolean;
  // 是否覆盖全局设置，强制在当前窗口打开
  forceSameTab?: boolean;
  children: React.ReactNode;
}

/**
 * 自定义链接组件 - 全局控制链接行为
 */
const CustomLink: React.FC<CustomLinkProps> = ({ 
  children, 
  to,
  forceNewTab,
  forceSameTab,
  onClick,
  ...restProps 
}) => {
  const { openInNewTab, handleOpenInNewTab } = useLinkBehavior();
  const isInsideLink = useInsideLink();
  
  // 如果在Link内部嵌套，则转为span避免HTML错误
  if (isInsideLink) {
    return <span className="nested-link">{children}</span>;
  }

  // 根据props或全局设置决定是否在新窗口打开
  const shouldOpenInNewTab = forceNewTab || (openInNewTab && !forceSameTab);
  
  // 处理点击事件，修复类型
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      // 类型断言，保证类型兼容性
      onClick(e as any);  
    }
    
    if (shouldOpenInNewTab && !e.defaultPrevented) {
      return handleOpenInNewTab(to.toString())(e);
    }
  };

  return (
    <Link
      to={to}
      onClick={handleClick}
      {...restProps}
    >
      {children}
    </Link>
  );
};

export default CustomLink; 