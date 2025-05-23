import React, { useRef, useState, useEffect } from 'react';
import { queueImageForLazyLoad } from '../utils/lazyLoader';
import { fixImageUrl, handleImageLoadError } from '../utils/imageProxy';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  className?: string;
  placeholderSrc?: string;
  priority?: number;
  onLoad?: () => void;
  onError?: () => void;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  blur?: boolean;
  noCache?: boolean;
  isDynamicFeed?: boolean;
}

/**
 * 懒加载图片组件
 * 
 * 替代普通的img标签，自动应用懒加载功能
 * 支持模糊占位、加载状态和错误处理
 */
const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  className = '',
  placeholderSrc = '',
  priority = 3,
  onLoad,
  onError,
  wrapperClassName = '',
  wrapperStyle = {},
  blur = false,
  noCache = false,
  isDynamicFeed = false,
  ...props
}) => {
  // 图片引用
  const imgRef = useRef<HTMLImageElement>(null);
  // 是否已加载
  const [isLoaded, setIsLoaded] = useState(false);
  // 是否有错误
  const [hasError, setHasError] = useState(false);
  // 是否已初始化
  const [isInitialized, setIsInitialized] = useState(false);
  // 原始图片URL（非代理URL）
  const originalSrc = src;
  
  // 修复图片URL，处理跨域问题，并传递isDynamicFeed参数
  const proxiedSrc = fixImageUrl(src, noCache, isDynamicFeed);
  const proxiedPlaceholder = placeholderSrc ? fixImageUrl(placeholderSrc, noCache) : '';
  
  // 处理加载完成事件
  const handleImageLoaded = () => {
    setIsLoaded(true);
    setHasError(false);
    if (onLoad) onLoad();
  };
  
  // 处理加载错误事件
  const handleImageError = () => {
    setHasError(true);
    // 不立即重置isLoaded，让handleImageLoadError决定何时重试
    
    // 调用自定义错误处理
    if (onError) onError();
    
    // 使用重试逻辑，并传递isDynamicFeed参数
    handleImageLoadError(originalSrc, imgRef.current, 0, isDynamicFeed);
  };
  
  // 应用懒加载
  useEffect(() => {
    if (!imgRef.current || isInitialized || !proxiedSrc) return;
    
    setIsInitialized(true);
    
    // 优先检查该图片是否已经加载过并且已缓存在浏览器中
    const img = new Image();
    img.onload = () => {
      // 图片已缓存，直接设置
      if (imgRef.current) {
        imgRef.current.src = proxiedSrc;
        handleImageLoaded();
      }
    };
    img.onerror = () => {
      // 图片未缓存或加载失败，使用懒加载队列
      if (imgRef.current) {
        queueImageForLazyLoad(imgRef.current, proxiedSrc, {
          priority,
          onLoad: handleImageLoaded,
          onError: handleImageError
        });
      }
    };
    
    // 尝试从缓存加载
    img.src = proxiedSrc;
    
  }, [proxiedSrc, priority, isInitialized, originalSrc]);
  
  // 计算样式类名
  const imageClassName = `
    ${className}
    ${isLoaded ? 'lazy-loaded' : 'lazy-load'}
    ${blur && !isLoaded ? 'blur-effect' : ''}
  `.trim();
  
  // 渲染图片
  const renderImage = () => (
    <img
      ref={imgRef}
      alt={alt}
      className={imageClassName}
      // 如果有占位图片，先显示占位图片
      src={proxiedPlaceholder || ''}
      // 添加加载策略属性
      loading="lazy"
      decoding="async"
      // 移除跨域属性，因为我们通过代理解决了跨域问题
      // crossOrigin="anonymous"
      // 添加宽高比属性，避免布局偏移
      {...(props.width && props.height ? { 'data-aspect-ratio': Number(props.width) / Number(props.height) } : {})}
      {...props}
    />
  );
  
  // 如果需要包装元素
  if (wrapperClassName || Object.keys(wrapperStyle).length > 0) {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        {renderImage()}
        {hasError && (
          <div className="lazy-image-error">
            <span>图片加载失败</span>
          </div>
        )}
      </div>
    );
  }
  
  // 直接返回图片元素
  return renderImage();
};

export default LazyImage; 