/**
 * 此文件定义了一个通用的 Modal (模态框/弹窗) 组件。
 *
 * 主要功能:
 * - 提供一个覆盖在主内容之上的弹窗容器。
 * - 根据 isOpen prop 控制模态框的显示和隐藏。
 * - 包含一个关闭按钮或点击遮罩层关闭模态框的功能 (通过 onClose prop)。
 * - 接收子组件 (children) 作为模态框的内容。
 * - 支持基础的显示隐藏过渡效果。
 * - 模态框始终相对于当前视口居中显示。
 * - 支持键盘 ESC 键关闭模态窗口。
 * - 使用更稳定的挂载方式，避免闪烁消失问题。
 * - 支持通过maxWidthClass属性自定义宽度，确保宽度固定不变。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
  title?: string;
  altText?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

// 创建并获取模态容器的函数
const getOrCreateModalContainer = (): HTMLElement => {
  let container = document.getElementById('modal-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'modal-root';
    document.body.appendChild(container);
  }
  return container;
};

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, maxWidthClass = 'max-w-lg' }) => {
  // 使用state来跟踪模态窗口的可见性
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // 当isOpen变化时，更新可见性状态
    // 添加一个小延迟来触发CSS过渡效果
    if (isOpen) {
      // 先确保渲染DOM，然后触发过渡效果
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // 处理ESC键关闭
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  // 如果模态窗口未打开，不渲染任何内容
  if (!isOpen) return null;

  // 遮罩层样式
  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    opacity: isVisible ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out'
  };

  // 模态容器样式 (移除 width 和 maxWidth style, 依赖 className)
  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: `translate(-50%, -50%) scale(${isVisible ? 1 : 0.95})`,
    zIndex: 1001,
    maxHeight: '90vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'transform 0.3s ease-in-out',
    width: 'auto' // <-- 添加 width: auto 让内容决定宽度，受 maxWidthClass 限制
  };

  // 内容样式
  const contentStyle: React.CSSProperties = {
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
    borderRadius: '0.5rem',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative'
  };

  // 使用createPortal直接挂载到固定容器
  return createPortal(
    <div className="modal-container">
      {/* 背景遮罩 */}
      <div 
        style={backdropStyle} 
      onClick={onClose} 
        className="modal-backdrop"
      />

      {/* 模态内容 - 仅依赖 maxWidthClass 来控制最大宽度 */}
      <div 
        style={modalStyle} 
        className={`modal-wrapper ${maxWidthClass}`}
      >
        <div
          style={contentStyle}
        onClick={(e) => e.stopPropagation()} 
          className="modal-content"
      >
        {children}
      </div>
    </div>
    </div>,
    getOrCreateModalContainer()
  );
};

export default Modal; 