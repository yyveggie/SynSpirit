import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ImageViewerProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  isOpen: boolean;
}

/**
 * 图片查看器组件
 * 
 * 功能：
 * - 在当前视野中间显示图片，而非页面顶部
 * - 支持多图切换、放大缩小
 * - 严格限制图片大小，没有多余黑色边框
 * - 响应键盘操作
 */
const ImageViewer: React.FC<ImageViewerProps> = ({ images, initialIndex = 0, onClose, isOpen }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  // 重置索引
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);
  
  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') nextImage();
      else if (e.key === 'ArrowLeft') prevImage();
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // 导航函数
  const nextImage = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length);
  }, [images.length]);
  
  const prevImage = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
  }, [images.length]);
  
  if (!isOpen || !images.length) return null;
  
  // 卡片宽度 - 限制小一些
  const cardWidth = 500; // 像素
  
  const viewerContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75"
      onClick={onClose}
    >
      {/* 内容容器 */}
      <div
        className="relative bg-black p-1 sm:p-2 rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 图片容器 */}
        <div
          className="flex items-center justify-center"
        >
          <img
            src={images[currentIndex]}
            alt={`View ${currentIndex + 1} of ${images.length}`}
            style={{
              maxWidth: 'calc(100vw - 40px)',
              maxHeight: 'calc(100vh - 80px)',
              objectFit: 'contain',
              borderRadius: '4px'
            }}
          />
        </div>
        
        {images.length > 1 && (
          <>
            <button
              aria-label="Previous image"
              className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white text-3xl rounded-full bg-black/40 hover:bg-black/60 transition-all"
              onClick={e => { e.stopPropagation(); prevImage(); }}
            >
              &#8249;
            </button>
            
            <button
              aria-label="Next image"
              className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white text-3xl rounded-full bg-black/40 hover:bg-black/60 transition-all"
              onClick={e => { e.stopPropagation(); nextImage(); }}
            >
              &#8250;
            </button>
            
            <div
              className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 text-sm text-white bg-black/50 rounded-md"
            >
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(viewerContent, document.body);
};

export default ImageViewer; 