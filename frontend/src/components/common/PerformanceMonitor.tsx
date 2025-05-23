import React, { useState, useEffect, useRef } from 'react';
import { scrollManager } from '../../utils/scrollPerformanceManager';

interface PerformanceMetrics {
  fps: number;
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  scrollSpeed: number;
  performanceMode: string;
}

// 仅在开发环境中显示
const isDev = process.env.NODE_ENV === 'development';

// 主性能监控组件 - 确保所有Hook在顶层无条件调用
const PerformanceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    scrollSpeed: 0,
    performanceMode: 'normal'
  });
  const [visible, setVisible] = useState(false);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // 初始化性能监控
    const measurePerformance = () => {
      const now = performance.now();
      frameCountRef.current++;

      // 每秒更新一次性能指标
      if (now - lastTimeRef.current >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current));
        
        // 获取内存使用情况 (仅Chrome浏览器支持)
        const memory = (performance as any).memory ? {
          usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / (1024 * 1024)),
          totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / (1024 * 1024)),
          jsHeapSizeLimit: Math.round((performance as any).memory.jsHeapSizeLimit / (1024 * 1024))
        } : undefined;

        // 获取滚动速度和性能模式
        const scrollInfo = scrollManager.getScrollInfo();
        const performanceMode = scrollManager.getPerformanceMode();

        setMetrics({
          fps,
          memory,
          scrollSpeed: Math.round(scrollInfo.speed * 1000) / 1000,
          performanceMode
        });

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(measurePerformance);
    };

    // 监听快捷键切换显示状态
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+P 切换性能面板
      if (e.altKey && e.key === 'p') {
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    rafRef.current = requestAnimationFrame(measurePerformance);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // 如果不可见，渲染null而不是提前返回
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/70 backdrop-blur-md p-3 rounded-lg text-white text-xs z-[9999] select-none pointer-events-none">
      <div className="font-mono">
        <div className="flex justify-between">
          <span>FPS:</span>
          <span className={`${metrics.fps < 30 ? 'text-red-400' : metrics.fps < 50 ? 'text-yellow-400' : 'text-green-400'}`}>
            {metrics.fps}
          </span>
        </div>

        {metrics.memory && (
          <div className="flex justify-between">
            <span>内存:</span>
            <span className={`${metrics.memory.usedJSHeapSize > metrics.memory.totalJSHeapSize * 0.8 ? 'text-red-400' : 'text-green-400'}`}>
              {metrics.memory.usedJSHeapSize}MB / {metrics.memory.totalJSHeapSize}MB
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span>滚动速度:</span>
          <span className={`${metrics.scrollSpeed > 0.7 ? 'text-red-400' : metrics.scrollSpeed > 0.3 ? 'text-yellow-400' : 'text-green-400'}`}>
            {metrics.scrollSpeed.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between">
          <span>性能模式:</span>
          <span className={`${
            metrics.performanceMode === 'normal' 
              ? 'text-green-400' 
              : metrics.performanceMode === 'high-performance' 
                ? 'text-yellow-400' 
                : 'text-red-400'
          }`}>
            {metrics.performanceMode}
          </span>
        </div>
      </div>
    </div>
  );
};

// 导出包装组件，用于处理开发环境检查
// 这样可以避免在PerformanceMonitor内部进行条件判断
export default function PerformanceMonitorWrapper() {
  // 在组件外部判断环境，避免在内部组件使用条件渲染
  if (!isDev) {
    return null;
  }
  
  return <PerformanceMonitor />;
} 