/**
 * 滚动性能管理器
 * 
 * 提供高性能滚动事件处理、智能节流与性能监控
 * 使用单例模式确保全局只有一个滚动监听实例
 */

type ScrollCallback = (info: ScrollInfo) => void;

interface ScrollInfo {
  scrollY: number;
  scrollX: number;
  direction: 'up' | 'down' | 'none';
  speed: number;
  isRapidScroll: boolean;
  isScrolling: boolean;
}

interface ScrollListenerOptions {
  throttleMs?: number;        // 节流时间（毫秒）
  rapidScrollThreshold?: number; // 快速滚动阈值（像素/毫秒）
  cooldownTime?: number;      // 滚动停止冷却时间
  rapidScrollCooldownTime?: number; // 快速滚动停止冷却时间
  useRAF?: boolean;           // 是否使用requestAnimationFrame
  immediate?: boolean;        // 是否立即触发一次回调
}

class ScrollPerformanceManager {
  private static instance: ScrollPerformanceManager;
  
  // 滚动状态相关
  private lastScrollY: number = window.scrollY;
  private lastScrollX: number = window.scrollX;
  private lastScrollTime: number = performance.now();
  private scrollSpeed: number = 0;
  private isRapidScroll: boolean = false;
  private isScrolling: boolean = false;
  private scrollDirection: 'up' | 'down' | 'none' = 'none';
  
  // 节流控制
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private ticking: boolean = false;
  
  // 注册的回调
  private scrollCallbacks: ScrollCallback[] = [];
  
  // 性能监测
  private frameDrops: number = 0;
  private lastFrameTime: number = 0;
  private performanceMode: 'normal' | 'high-performance' | 'extreme' = 'normal';
  
  // 选项
  private options: Required<ScrollListenerOptions> = {
    throttleMs: 16, // 约60fps
    rapidScrollThreshold: 0.7,
    cooldownTime: 150,
    rapidScrollCooldownTime: 200,
    useRAF: true,
    immediate: true
  };

  private constructor() {
    // 私有构造器，防止外部直接创建实例
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ScrollPerformanceManager {
    if (!ScrollPerformanceManager.instance) {
      ScrollPerformanceManager.instance = new ScrollPerformanceManager();
    }
    return ScrollPerformanceManager.instance;
  }

  /**
   * 初始化滚动监听
   */
  public initialize(options?: ScrollListenerOptions): void {
    // 合并选项
    if (options) {
      this.options = { ...this.options, ...options };
    }
    
    // 清除之前可能存在的监听器
    this.cleanup();
    
    // 设置新的监听器
    if (this.options.useRAF) {
      // 使用 requestAnimationFrame 优化
      window.addEventListener('scroll', this.handleScrollRAF, { passive: true });
    } else {
      // 使用传统节流
      window.addEventListener('scroll', this.handleScrollThrottled, { passive: true });
    }
    
    // 监听调整大小事件
    window.addEventListener('resize', this.handleScrollThrottled, { passive: true });
    
    // 额外的性能监测
    this.startPerformanceMonitoring();
    
    // 立即执行一次以设置初始状态
    if (this.options.immediate) {
      this.updateScrollInfo();
      this.notifyCallbacks();
    }
    
    console.debug('[ScrollPerformanceManager] Initialized with options:', this.options);
  }

  /**
   * 注册滚动回调
   */
  public addScrollListener(callback: ScrollCallback): () => void {
    this.scrollCallbacks.push(callback);
    
    // 返回移除此监听器的函数
    return () => {
      this.scrollCallbacks = this.scrollCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * 清理所有资源
   */
  public cleanup(): void {
    // 清除所有事件监听器
    window.removeEventListener('scroll', this.handleScrollRAF);
    window.removeEventListener('scroll', this.handleScrollThrottled);
    window.removeEventListener('resize', this.handleScrollThrottled);
    
    // 清除定时器
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    // 清除RAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    // 停止性能监测
    this.stopPerformanceMonitoring();
    
    this.ticking = false;
    console.debug('[ScrollPerformanceManager] Cleanup complete');
  }

  /**
   * 使用requestAnimationFrame的滚动处理
   */
  private handleScrollRAF = (): void => {
    if (!this.ticking) {
      this.rafId = requestAnimationFrame(() => {
        this.updateScrollInfo();
        this.notifyCallbacks();
        this.ticking = false;
      });
      
      this.ticking = true;
    }
  };

  /**
   * 使用节流的滚动处理
   */
  private handleScrollThrottled = (): void => {
    const now = performance.now();
    if (now - this.lastScrollTime >= this.options.throttleMs) {
      this.updateScrollInfo();
      this.notifyCallbacks();
      this.lastScrollTime = now;
    }
  };

  /**
   * 更新滚动信息
   */
  private updateScrollInfo(): void {
    const currentTime = performance.now();
    const currentScrollY = window.scrollY;
    const currentScrollX = window.scrollX;
    const timeDiff = currentTime - this.lastScrollTime;
    
    // 设置为正在滚动状态
    this.isScrolling = true;
    
    // 确定滚动方向
    if (currentScrollY > this.lastScrollY) {
      this.scrollDirection = 'down';
    } else if (currentScrollY < this.lastScrollY) {
      this.scrollDirection = 'up';
    } else {
      this.scrollDirection = 'none';
    }
    
    // 计算滚动速度
    if (timeDiff > 0) {
      const yDiff = Math.abs(currentScrollY - this.lastScrollY);
      const xDiff = Math.abs(currentScrollX - this.lastScrollX);
      
      // 使用最大的位移差来计算速度
      const maxDiff = Math.max(yDiff, xDiff);
      this.scrollSpeed = maxDiff / timeDiff;
      
      // 检测是否是快速滚动
      this.isRapidScroll = this.scrollSpeed > this.options.rapidScrollThreshold;
      
      // 更新上一次的滚动位置和时间
      this.lastScrollY = currentScrollY;
      this.lastScrollX = currentScrollX;
      this.lastScrollTime = currentTime;
    }
    
    // 更新DOM类
    this.updateDOMClasses();
    
    // 设置滚动结束检测
    this.setupScrollEndDetection();
  }

  /**
   * 更新DOM类以反映滚动状态
   */
  private updateDOMClasses(): void {
    // 添加滚动类
    document.documentElement.classList.add('scrolling');
    document.body.classList.add('is-scrolling');
    
    // 根据速度添加快速滚动类
    if (this.isRapidScroll) {
      document.documentElement.classList.add('rapid-scroll');
    } else {
      document.documentElement.classList.remove('rapid-scroll');
    }
    
    // 根据性能模式添加类
    document.documentElement.classList.remove('perf-normal', 'perf-high', 'perf-extreme');
    document.documentElement.classList.add(`perf-${this.performanceMode.replace('-performance', '')}`);
  }

  /**
   * 设置滚动结束检测
   */
  private setupScrollEndDetection(): void {
    // 清除之前的定时器
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
    
    // 根据是否快速滚动选择不同的冷却时间
    const cooldownTime = this.isRapidScroll 
      ? this.options.rapidScrollCooldownTime 
      : this.options.cooldownTime;
    
    // 设置新的定时器
    this.scrollTimeout = setTimeout(() => {
      // 移除滚动类
      document.documentElement.classList.remove('scrolling', 'rapid-scroll');
      document.body.classList.remove('is-scrolling');
      
      // 更新状态
      this.isScrolling = false;
      this.isRapidScroll = false;
      this.scrollSpeed = 0;
      this.scrollDirection = 'none';
      
      // 通知回调
      this.notifyCallbacks();
    }, cooldownTime);
  }

  /**
   * 通知所有注册的回调
   */
  private notifyCallbacks(): void {
    if (this.scrollCallbacks.length === 0) return;
    
    const scrollInfo: ScrollInfo = {
      scrollY: this.lastScrollY,
      scrollX: this.lastScrollX,
      direction: this.scrollDirection,
      speed: this.scrollSpeed,
      isRapidScroll: this.isRapidScroll,
      isScrolling: this.isScrolling
    };
    
    // 调用所有回调
    for (const callback of this.scrollCallbacks) {
      try {
        callback(scrollInfo);
      } catch (err) {
        console.error('[ScrollPerformanceManager] Error in scroll callback:', err);
      }
    }
  }

  /**
   * 启动性能监控
   */
  private startPerformanceMonitoring(): void {
    // 初始设置
    this.lastFrameTime = performance.now();
    this.frameDrops = 0;
    
    // 使用RAF循环检测帧率
    const checkFrameRate = () => {
      const now = performance.now();
      const frameDelta = now - this.lastFrameTime;
      
      // 检测帧率下降 (16.67ms = 60fps)
      if (frameDelta > 33) { // 低于30fps
        this.frameDrops++;
        
        // 根据帧率下降次数调整性能模式
        if (this.frameDrops > 5 && this.performanceMode === 'normal') {
          this.performanceMode = 'high-performance';
          console.debug('[ScrollPerformanceManager] Switching to high-performance mode');
        } else if (this.frameDrops > 10 && this.performanceMode === 'high-performance') {
          this.performanceMode = 'extreme';
          console.debug('[ScrollPerformanceManager] Switching to extreme performance mode');
        }
      } else {
        // 逐渐恢复性能模式
        this.frameDrops = Math.max(0, this.frameDrops - 1);
        
        if (this.frameDrops < 3 && this.performanceMode === 'extreme') {
          this.performanceMode = 'high-performance';
        } else if (this.frameDrops < 2 && this.performanceMode === 'high-performance') {
          this.performanceMode = 'normal';
        }
      }
      
      this.lastFrameTime = now;
      this.rafId = requestAnimationFrame(checkFrameRate);
    };
    
    this.rafId = requestAnimationFrame(checkFrameRate);
  }

  /**
   * 停止性能监控
   */
  private stopPerformanceMonitoring(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * 获取当前滚动信息
   */
  public getScrollInfo(): ScrollInfo {
    return {
      scrollY: this.lastScrollY,
      scrollX: this.lastScrollX,
      direction: this.scrollDirection,
      speed: this.scrollSpeed,
      isRapidScroll: this.isRapidScroll,
      isScrolling: this.isScrolling
    };
  }

  /**
   * 获取当前性能模式
   */
  public getPerformanceMode(): string {
    return this.performanceMode;
  }
}

// 导出单例实例
export const scrollManager = ScrollPerformanceManager.getInstance();

// 为方便使用，导出一些常用函数
export const initializeScrollManager = (options?: ScrollListenerOptions): void => {
  scrollManager.initialize(options);
};

export const addScrollListener = (callback: ScrollCallback): () => void => {
  return scrollManager.addScrollListener(callback);
};

export const getScrollInfo = (): ScrollInfo => {
  return scrollManager.getScrollInfo();
};

export default scrollManager; 