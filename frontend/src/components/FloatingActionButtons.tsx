/**
 * 悬浮操作按钮组件
 * 
 * @deprecated 此组件已被废弃，请使用AICollapseChat组件替代
 * 该组件曾在网站右下角显示悬浮按钮，现已被AICollapseChat组件替代
 * 
 * 在当前可见区域的右下角显示悬浮按钮
 * 包含：撰写文章(全局)，AI聊天(全局)
 * 
 * 注意：z-index设置为50，低于模态窗口组件的z-index(100)，以确保不会遮挡模态窗口
 */
import React, { CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactDOM from 'react-dom';
import Chatbot from './Chatbot';

const FloatingActionButtons: React.FC = () => {
  // @deprecated 此组件已被废弃，请使用AICollapseChat组件替代
  
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // 初始化 portal 容器
  useEffect(() => {
    // 检查是否已存在按钮容器
    let container = document.getElementById('floating-buttons-portal');
    
    if (!container) {
      // 创建新的容器
      container = document.createElement('div');
      container.id = 'floating-buttons-portal';
      document.body.appendChild(container);
    }
    
    setPortalContainer(container);
    
    // 清理函数
    return () => {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
    };
  }, []);

  // 处理AI聊天按钮点击 - 打开聊天窗口而不是跳转
  const handleChatClick = () => {
    setIsChatOpen(true);
  };

  // 关闭AI聊天窗口
  const handleCloseChat = () => {
    setIsChatOpen(false);
  };

  // 按钮容器样式 - 降低z-index以避免与模态窗口冲突
  const containerStyle: CSSProperties = {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 50, // 降低z-index，确保不会高于模态窗口的z-index(100)
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  };

  const buttonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    borderRadius: '9999px',
    color: 'white',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    cursor: 'pointer'
  };

  // 当 portal 容器不可用时不渲染内容
  if (!portalContainer) return null;

  // 使用 ReactDOM.createPortal 将按钮渲染到 body 级别的容器中
  return portalContainer && ReactDOM.createPortal(
    <>
      {/* 按钮容器 */}
      <div style={containerStyle} id="floating-buttons">
        {/* AI 聊天按钮 (全局) */}
        <button
          style={buttonStyle}
          aria-label="AI 聊天"
          title="AI 聊天"
          onClick={handleChatClick}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* 星星/火花图标 SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width: '24px', height: '24px'}}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </button>
      </div>

      {/* AI Chatbot 窗口 (全局) */}
      <Chatbot isOpen={isChatOpen} onClose={handleCloseChat} />
    </>,
    portalContainer
  );
};

export default FloatingActionButtons; 