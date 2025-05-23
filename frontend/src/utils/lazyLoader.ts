/**
 * 图片懒加载管理工具
 * 
 * 用于优化图片加载性能，提供以下功能：
 * - 使用IntersectionObserver实现图片懒加载
 * - 控制并发加载数量，防止大量图片同时加载导致性能问题
 * - 优先加载视窗内图片，延迟加载视窗外图片
 * - 支持加载优先级设置
 * - 支持加载成功/失败回调
 */

// 图片加载队列
const loadQueue: QueueItem[] = [];
// 正在加载的图片数量
let activeLoads = 0;
// 最大并发加载数
const MAX_CONCURRENT_LOADS = 3;
// 已加载的图片URL集合，避免重复加载
const loadedImages = new Set<string>();
// IntersectionObserver实例
let observer: IntersectionObserver | null = null;

// 队列项接口
interface QueueItem {
  imgElement: HTMLImageElement;
  src: string;
  priority: number; // 优先级: 1(最高) - 5(最低)
  onLoad?: () => void;
  onError?: () => void;
  observed: boolean;
}

/**
 * 初始化懒加载观察者
 * 使用IntersectionObserver API监视图片元素是否进入视口
 */
const initializeObserver = () => {
  if (!observer && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const imgElement = entry.target as HTMLImageElement;
            const queueItemIndex = loadQueue.findIndex(item => item.imgElement === imgElement);
            
            if (queueItemIndex !== -1) {
              // 提高进入视口的图片优先级
              loadQueue[queueItemIndex].priority = 1; 
              // 标记为已观察到进入视口
              loadQueue[queueItemIndex].observed = true;
              // 排序队列，确保视口内的图片优先加载
              sortQueue();
              // 尝试加载队列中的图片
              processQueue();
              
              // 已进入视口的图片不再需要观察
              observer?.unobserve(imgElement);
            }
          }
        });
      },
      {
        rootMargin: '200px 0px', // 提前200px开始加载，平滑过渡
        threshold: 0.01 // 只要有1%进入视口就触发
      }
    );
  }
};

/**
 * 根据优先级对队列排序
 */
const sortQueue = () => {
  loadQueue.sort((a, b) => {
    // 首先按观察状态排序（已观察到的优先）
    if (a.observed && !b.observed) return -1;
    if (!a.observed && b.observed) return 1;
    // 然后按优先级排序（数字越小优先级越高）
    return a.priority - b.priority;
  });
};

/**
 * 处理加载队列
 */
const processQueue = () => {
  // 如果没有正在等待的加载任务或已达到最大并发数，则退出
  if (loadQueue.length === 0 || activeLoads >= MAX_CONCURRENT_LOADS) {
    return;
  }

  // 从队列中取出优先级最高的项
  const item = loadQueue.shift();
  if (!item) return;

  // 增加活跃加载计数
  activeLoads++;

  // 设置图片src开始加载
  const img = item.imgElement;
  
  // 添加加载事件监听器
  const handleLoad = () => {
    activeLoads--;
    loadedImages.add(item.src);
    img.classList.add('lazy-loaded');
    
    // 清理事件监听器
    img.removeEventListener('load', handleLoad);
    img.removeEventListener('error', handleError);
    
    // 调用加载成功回调
    if (item.onLoad) item.onLoad();
    
    // 继续处理队列
    setTimeout(processQueue, 50); // 短暂延迟，避免密集加载
  };

  const handleError = () => {
    activeLoads--;
    
    // 清理事件监听器
    img.removeEventListener('load', handleLoad);
    img.removeEventListener('error', handleError);
    
    // 调用加载失败回调
    if (item.onError) item.onError();
    
    // 继续处理队列
    setTimeout(processQueue, 50);
  };

  img.addEventListener('load', handleLoad);
  img.addEventListener('error', handleError);

  // 添加loading属性和lazy-load类
  img.loading = 'lazy';
  img.classList.add('lazy-load');
  
  // 设置图片源，开始加载
  img.src = item.src;
};

/**
 * 将图片添加到懒加载队列
 * @param imgElement 图片元素
 * @param src 图片URL
 * @param options 配置选项
 */
export const queueImageForLazyLoad = (
  imgElement: HTMLImageElement,
  src: string,
  options: {
    priority?: number;
    onLoad?: () => void;
    onError?: () => void;
  } = {}
) => {
  // 如果图片已经加载过，直接设置src并返回
  if (loadedImages.has(src)) {
    imgElement.src = src;
    imgElement.classList.add('lazy-loaded');
    if (options.onLoad) options.onLoad();
    return;
  }

  // 如果图片已经有相同src且正在显示，无需重复加载
  if (imgElement.src === src && !imgElement.classList.contains('lazy-load')) {
    if (options.onLoad) options.onLoad();
    return;
  }

  // 检查当前队列中是否已经有相同元素的请求
  const existingQueueItem = loadQueue.find(item => item.imgElement === imgElement);
  if (existingQueueItem) {
    // 如果队列中存在相同元素且src相同，无需重复添加
    if (existingQueueItem.src === src) {
      return;
    }
    // 如果src不同，移除旧的请求
    const index = loadQueue.indexOf(existingQueueItem);
    if (index > -1) {
      loadQueue.splice(index, 1);
    }
  }

  // 确保初始化观察者
  initializeObserver();

  // 将图片添加到队列
  loadQueue.push({
    imgElement,
    src,
    priority: options.priority || 3, // 默认中等优先级
    onLoad: options.onLoad,
    onError: options.onError,
    observed: false
  });

  // 开始观察图片元素
  if (observer) {
    observer.observe(imgElement);
  }

  // 尝试处理队列
  sortQueue();
  processQueue();
};

/**
 * 对一组图片应用懒加载
 * @param containerSelector 包含图片的容器选择器
 * @param options 配置选项
 */
export const applyLazyLoadToImages = (
  containerSelector: string,
  options: {
    imageSelector?: string;
    priority?: number;
  } = {}
) => {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const imageSelector = options.imageSelector || 'img:not(.lazy-loaded):not(.lazy-ignored)';
  const images = container.querySelectorAll(imageSelector);

  images.forEach((img) => {
    const imgElement = img as HTMLImageElement;
    // 跳过已经处理过的图片
    if (imgElement.classList.contains('lazy-load') || imgElement.classList.contains('lazy-loaded')) {
      return;
    }

    // 保存原始 src
    const originalSrc = imgElement.src;
    if (originalSrc && !originalSrc.startsWith('data:')) {
      // 清除原始src，阻止立即加载
      imgElement.removeAttribute('src');
      
      // 将图片添加到懒加载队列
      queueImageForLazyLoad(imgElement, originalSrc, {
        priority: options.priority || 3
      });
    }
  });
};

/**
 * 预加载图片，但不立即显示
 * @param src 图片URL
 * @param priority 优先级
 */
export const preloadImage = (src: string, priority: number = 5) => {
  // 如果已经加载过，不再重复加载
  if (loadedImages.has(src)) return;

  const imgElement = new Image();
  queueImageForLazyLoad(imgElement, src, { priority });
};

/**
 * 获取当前队列状态信息
 * 用于调试和分析
 */
export const getQueueStatus = () => {
  return {
    queueLength: loadQueue.length,
    activeLoads,
    loadedImagesCount: loadedImages.size
  };
};

/**
 * 针对React组件的图片引用懒加载
 * @param imgRef React的ref引用
 * @param src 图片URL
 * @param options 配置选项
 */
export const lazyLoadImageRef = (
  imgRef: React.RefObject<HTMLImageElement>,
  src: string,
  options: {
    priority?: number;
    onLoad?: () => void;
    onError?: () => void;
  } = {}
) => {
  if (imgRef.current) {
    queueImageForLazyLoad(imgRef.current, src, options);
  }
};

// 暴露方法
export default {
  queueImageForLazyLoad,
  applyLazyLoadToImages,
  preloadImage,
  getQueueStatus,
  lazyLoadImageRef
}; 