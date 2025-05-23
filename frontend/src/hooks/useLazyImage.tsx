import { useState, useEffect, useRef } from 'react';
import { queueImageForLazyLoad, preloadImage } from '../utils/lazyLoader';
import { fixImageUrl, handleImageLoadError } from '../utils/imageProxy';

/**
 * 图片懒加载Hook
 * 
 * 便于在React组件中使用图片懒加载功能
 * 
 * @param src 图片URL
 * @param options 配置选项
 * @returns {Object} 包含图片ref、加载状态和错误信息
 */
const useLazyImage = (
  src?: string, 
  options: {
    priority?: number;
    preload?: boolean;
    alt?: string;
    className?: string;
    noCache?: boolean;
  } = {}
) => {
  // 图片元素引用
  const imgRef = useRef<HTMLImageElement>(null);
  // 加载状态
  const [isLoaded, setIsLoaded] = useState(false);
  // 错误状态
  const [error, setError] = useState<Error | null>(null);
  // 是否已完成初始化
  const [isInitialized, setIsInitialized] = useState(false);
  // 保存原始URL
  const originalSrc = src;

  // 处理代理URL
  const proxiedSrc = src ? fixImageUrl(src, options.noCache) : undefined;

  // 图片加载成功处理函数
  const handleLoad = () => {
    setIsLoaded(true);
    setError(null);
  };

  // 图片加载失败处理函数
  const handleError = () => {
    setError(new Error(`Failed to load image: ${proxiedSrc}`));
    
    // 调用高级错误处理和重试机制
    if (originalSrc) {
      handleImageLoadError(originalSrc, imgRef.current, 0);
    }
  };

  // 应用懒加载
  useEffect(() => {
    // 如果没有src或元素引用不存在，则不执行
    if (!proxiedSrc || !imgRef.current) return;

    // 避免重复初始化
    if (isInitialized) return;
    setIsInitialized(true);

    if (options.preload) {
      // 只预加载不直接显示
      preloadImage(proxiedSrc, options.priority || 5);
    } else {
      // 添加到懒加载队列
      queueImageForLazyLoad(imgRef.current, proxiedSrc, {
        priority: options.priority || 3,
        onLoad: handleLoad,
        onError: handleError
      });
    }
  }, [proxiedSrc, isInitialized, options.preload, options.priority, originalSrc]);

  // 创建图片元素属性
  const imgProps = {
    ref: imgRef,
    alt: options.alt || '',
    className: `${options.className || ''} ${isLoaded ? 'lazy-loaded' : 'lazy-load'}`.trim(),
    // 初始不设置src，由懒加载管理器控制
    src: ''
  };

  return {
    imgRef,
    imgProps,
    isLoaded,
    error
  };
};

export default useLazyImage; 