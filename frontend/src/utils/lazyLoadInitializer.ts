/**
 * 图片懒加载初始化器
 * 
 * 用于在应用启动时初始化懒加载功能，并监听DOM变化自动应用懒加载
 * 增强了滚动性能优化，包括快速滚动检测和动态性能调整
 */

import { applyLazyLoadToImages } from './lazyLoader';
import { scrollManager, addScrollListener, initializeScrollManager } from './scrollPerformanceManager';

/**
 * 初始化全局图片懒加载
 */
export const initializeLazyLoading = () => {
  // 确保DOM已加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }
};

/**
 * DOM加载完成后执行初始化
 */
const onDOMReady = () => {
  // 初始化当前页面中的所有图片
  setupInitialLazyLoading();
  
  // 设置MutationObserver监听DOM变化
  setupMutationObserver();
  
  // 初始化滚动性能管理器
  setupScrollPerformanceManager();
  
  // 设置IntersectionObserver以预加载即将进入视口的图片
  setupIntersectionObserver();
};

/**
 * 为当前页面所有图片设置懒加载
 */
const setupInitialLazyLoading = () => {
  // 应用到页面主要区域
  applyLazyLoadToImages('body', { 
    imageSelector: 'img:not(.lazy-loaded):not(.lazy-load):not(.lazy-ignored)'
  });
  
  // 针对特定区域使用不同优先级
  // 首屏内容优先级高
  applyLazyLoadToImages('.article-card', { 
    priority: 2 
  });
  
  applyLazyLoadToImages('.media-carousel-container', { 
    priority: 2 
  });
  
  // 首页内容优先级
  applyLazyLoadToImages('.home-content', { 
    priority: 2 
  });
  
  // 社区内容
  applyLazyLoadToImages('.community-content', { 
    priority: 3 
  });
};

/**
 * 设置MutationObserver监听DOM变化
 * 当新内容添加到页面时，自动应用懒加载
 */
const setupMutationObserver = () => {
  // 如果浏览器不支持MutationObserver，则退出
  if (!window.MutationObserver) return;
  
  // 创建观察者实例
  const observer = new MutationObserver((mutations) => {
    let shouldApplyLazyLoad = false;
    
    // 检查是否有新增节点
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // 检查是否添加了图片元素
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === 'IMG' || element.querySelector('img')) {
              shouldApplyLazyLoad = true;
            }
          }
        });
      }
    });
    
    // 如果有新增图片，应用懒加载
    if (shouldApplyLazyLoad) {
      setupInitialLazyLoading();
    }
  });
  
  // 开始观察document.body的子节点变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};

/**
 * 设置滚动性能管理器
 */
const setupScrollPerformanceManager = () => {
  // 初始化滚动管理器，使用优化的配置
  initializeScrollManager({
    throttleMs: 16, // 约60fps
    rapidScrollThreshold: 0.7, // 超过0.7像素/毫秒视为快速滚动
    cooldownTime: 150, // 普通滚动冷却时间
    rapidScrollCooldownTime: 200, // 快速滚动冷却时间
    useRAF: true, // 使用requestAnimationFrame优化
    immediate: true // 立即执行一次
  });

  // 注册滚动回调处理懒加载图片
  addScrollListener((info) => {
    if (info.isScrolling) {
      // 当用户快速滚动时，暂停所有动画并优化渲染
      if (info.isRapidScroll) {
        document.documentElement.classList.add('rapid-scroll');
      } else {
        document.documentElement.classList.remove('rapid-scroll');
      }

      // 可以在这里添加基于滚动方向的预加载逻辑
      if (info.direction === 'down') {
        // 向下滚动时可以预加载更多内容
      }
    }
  });
};

/**
 * 设置 IntersectionObserver 预加载即将进入视口的图片
 * 这个优化可以让滚动时的图片加载更平滑
 */
const setupIntersectionObserver = () => {
  // 如果浏览器不支持 IntersectionObserver，则退出
  if (!('IntersectionObserver' in window)) return;
  
  // 创建一个 IntersectionObserver 实例
  const preloadObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        // 当元素接近视口时
        if (entry.isIntersecting) {
          const container = entry.target as HTMLElement;
          
          // 查找容器内的懒加载图片
          const lazyImages = container.querySelectorAll('img[data-src]:not(.lazy-loaded)');
          
          // 如果找到图片，则预加载它们
          if (lazyImages.length > 0) {
            // 应用更优先的懒加载
            lazyImages.forEach(img => {
              const imgEl = img as HTMLImageElement;
              if (imgEl.dataset.src && !imgEl.src.includes('data:')) {
                // 设置src开始加载
                imgEl.src = imgEl.dataset.src;
                imgEl.classList.add('lazy-load');
              }
            });
          }
          
          // 停止观察已经预加载的容器
          preloadObserver.unobserve(container);
        }
      });
    },
    {
      // 提前200px检测
      rootMargin: '200px 0px',
      threshold: 0
    }
  );
  
  // 开始观察文章卡片和媒体容器
  document.querySelectorAll('.article-card, .media-carousel-container').forEach(container => {
    preloadObserver.observe(container);
  });
};

export default {
  initializeLazyLoading
}; 