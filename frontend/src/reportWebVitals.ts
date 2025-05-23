// 简化版性能报告函数，禁用类型检查以解决API兼容性问题
// @ts-nocheck
const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && typeof onPerfEntry === 'function') {
    // 延迟导入web-vitals
    import('web-vitals').then((webVitals) => {
      try {
        // 在调用API前检查每个方法是否存在
        if (typeof webVitals.onCLS === 'function') webVitals.onCLS(onPerfEntry);
        if (typeof webVitals.onFID === 'function') webVitals.onFID(onPerfEntry);
        if (typeof webVitals.onFCP === 'function') webVitals.onFCP(onPerfEntry);
        if (typeof webVitals.onLCP === 'function') webVitals.onLCP(onPerfEntry);
        if (typeof webVitals.onTTFB === 'function') webVitals.onTTFB(onPerfEntry);
        if (typeof webVitals.onINP === 'function') webVitals.onINP(onPerfEntry);
        
        // 兼容旧版本API
        if (typeof webVitals.getCLS === 'function') webVitals.getCLS(onPerfEntry);
        if (typeof webVitals.getFID === 'function') webVitals.getFID(onPerfEntry);
        if (typeof webVitals.getFCP === 'function') webVitals.getFCP(onPerfEntry);
        if (typeof webVitals.getLCP === 'function') webVitals.getLCP(onPerfEntry);
        if (typeof webVitals.getTTFB === 'function') webVitals.getTTFB(onPerfEntry);
      } catch (error) {
        console.warn('Web性能指标报告出错:', error);
      }
    });
  }
};

export default reportWebVitals; 