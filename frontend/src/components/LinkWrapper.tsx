/**
 * LinkWrapper.tsx
 * 
 * 这个组件包装了React Router的Link组件，
 * 使用LinkContext来避免<a>标签嵌套问题。
 */
import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { LinkProvider } from '../contexts/LinkContext';

interface LinkWrapperProps extends LinkProps {
  children: React.ReactNode;
}

/**
 * LinkWrapper组件 - 解决嵌套Link问题的包装器
 * 
 * 使用LinkContext标记其子组件在Link内部，
 * 这样子组件可以根据此信息避免再次渲染Link。
 */
const LinkWrapper: React.FC<LinkWrapperProps> = ({ children, ...linkProps }) => {
  return (
    <LinkProvider isInsideLink={true}>
      <Link {...linkProps}>
        {children}
      </Link>
    </LinkProvider>
  );
};

export default LinkWrapper; 