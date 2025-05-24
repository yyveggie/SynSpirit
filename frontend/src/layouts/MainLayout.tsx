import React, { useEffect, lazy, Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTimeline } from '../contexts/TimelineContext';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Navbar from '../components/Navbar';

/**
 * 主布局组件
 * 
 * 功能：
 * - 提供全站统一的渐变背景色
 * - 显示顶部导航栏，包含所有导航功能
 * - 允许页面内容自然流动，确保子页面可以独立滚动
 * - 内容区域居中显示，左右边距相等
 * - 集成动态时间栏，支持流畅的展开和收起动画
 * - 时间栏展开时不锁定原动态栏，保持上下滚动功能
 * - 使用硬件加速和高性能动画配置
 * - 减少时间栏右侧边距，增加内容显示宽度
 * - 彻底解决左侧动态栏滚动问题
 * - 确保顶部导航栏始终位于时间栏上方，不会被遮挡
 * 
 * 布局结构：
 * 1. 背景层：固定定位(fixed)，不随页面滚动
 * 2. 内容层：相对定位(relative)，完全流式布局，不控制滚动
 * 3. 子页面可以实现自己的独立滚动区域
 * 4. 时间栏层：右侧滑入滑出，带有丰富的动画效果，位于导航栏下方
 * 
 * 注意：此组件是整个站点唯一的背景色来源，其他组件不应设置全局背景
 */
const DynamicTimelineView = lazy(() => import('../components/DynamicTimelineView'));

// 主内容位移动画配置 - 使用transform替代位移
const contentVariants = {
  open: { 
    x: '-70%',
    transition: {
      type: 'tween', 
      ease: 'easeInOut',
      duration: 0.3,
    }
  },
  closed: { 
    x: '0%',
    transition: {
      type: 'tween',
      ease: 'easeInOut',
      duration: 0.3,
    }
  }
};

// 时间栏动画配置 - 简化动画
const timelineVariants = {
  hidden: { 
    x: '100%', 
    opacity: 0.3 
  },
  visible: { 
    x: 0, 
    opacity: 1,
    transition: { 
      type: 'tween',
      ease: 'easeInOut',
      duration: 0.3,
      when: "beforeChildren",
      staggerChildren: 0.05
    }
  },
  exit: { 
    x: '100%', 
    opacity: 0,
    transition: { 
      type: 'tween',
      ease: 'easeInOut',
      duration: 0.3, 
    }
  }
};

// 时间栏内部元素动画
const childVariants = {
  hidden: { opacity: 0, x: 10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { 
      type: 'tween',
      ease: 'easeInOut',
      duration: 0.3
    }
  }
};

// 毛玻璃背景
const glassVariants = {
  hidden: { backdropFilter: 'blur(0px)', backgroundColor: 'rgba(0, 0, 0, 0)' },
  visible: { 
    backdropFilter: 'blur(0px)', 
    backgroundColor: 'rgba(0, 0, 0, 0)',
    transition: { duration: 0.2 }
  },
  exit: { 
    backdropFilter: 'blur(0px)', 
    backgroundColor: 'rgba(0, 0, 0, 0)',
    transition: { duration: 0.2 }
  }
};

const MainLayout: React.FC = () => {
  const { isTimelineOpen, closeTimeline } = useTimeline();
  const prefersReducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(false);
  const [navbarHeight, setNavbarHeight] = useState(0);

  // 确保只在客户端渲染后才应用动画
  useEffect(() => {
    setRendered(true);
    
    // 获取导航栏高度，用于定位时间栏
    const updateNavbarHeight = () => {
      const navbar = document.querySelector('nav');
      if (navbar) {
        const height = navbar.offsetHeight;
        // 只有当高度确实变化时才更新
        if (height !== navbarHeight && height > 0) {
          setNavbarHeight(height);
          // 设置CSS变量以便CSS样式使用
          document.documentElement.style.setProperty('--navbar-height', `${height}px`);
        }
      }
    };
    
    // 初始计算
    updateNavbarHeight();
    
    // 使用ResizeObserver代替resize事件，更精确地监听导航栏大小变化
    const resizeObserver = new ResizeObserver(updateNavbarHeight);
    const navbar = document.querySelector('nav');
    if (navbar) {
      resizeObserver.observe(navbar);
    }
    
    // 添加一个延迟检查，确保在DOM完全渲染后再次更新高度
    const timeout = setTimeout(updateNavbarHeight, 100);
    
    return () => {
      if (navbar) {
        resizeObserver.unobserve(navbar);
      }
      resizeObserver.disconnect();
      clearTimeout(timeout);
      // 清除CSS变量
      document.documentElement.style.removeProperty('--navbar-height');
    };
  }, [navbarHeight]);

  // 处理页面滚动问题的核心函数 - 大幅简化或移除
  useEffect(() => {
    // 此useEffect的目的是管理滚动。TimelineContext已经通过添加/移除 'timeline-view-active' 类到body来做这件事。
    // 我们应该在全局CSS中定义 .timeline-view-active 如何影响body的滚动。
    // 例如:
    // body.timeline-view-active { overflow: hidden; /* 或者其他需要的样式 */ }
    // framer-motion的AnimatePresence和motion组件会处理时间栏自身的出现和消失动画。
    // 主内容区的位移 (contentVariants) 也会由framer-motion处理。
  }, [isTimelineOpen]);

  // 监听时间栏状态变化
  useEffect(() => {
    // 监听时间栏关闭
    if (!isTimelineOpen && rendered) {
      // 检查URL是否为动态详情页，如果是则强制恢复
      if (window.location.pathname.startsWith('/dynamic/')) {
        const previousUrl = sessionStorage.getItem('previousUrl') || '/';
        console.log('[MainLayout] 检测到时间栏关闭，强制恢复URL到:', previousUrl);
        sessionStorage.removeItem('previousUrl');
        window.history.replaceState(null, '', previousUrl);
      }
    }
  }, [isTimelineOpen, rendered]);

  return (
    <>
      {/* 固定背景层 */}
      <div 
        className="fixed inset-0 w-full h-full overflow-hidden"
        style={{ 
          background: '#ffffff', /* 修改为纯白色背景 */
          zIndex: -10,
          opacity: 1
        }}
      />
      
      {/* 顶部导航栏 - 提高z-index确保最顶层 */}
      <Navbar className="relative z-50" />
      
      {/* 居中容器 - 添加最大宽度和居中对齐 */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full min-h-screen overflow-visible"> 
        
        {/* 主内容层 - 使用transform:translateX而非定位 */}
        <motion.div 
          className="w-full"
          animate={isTimelineOpen && rendered ? 'open' : 'closed'}
          initial={false}
          variants={contentVariants}
          style={{
            willChange: 'transform',
            // 使用transform而非定位，避免影响滚动
            position: 'static',
            zIndex: 1
          }}
        >
          <Outlet />
        </motion.div>

        {/* 背景遮罩层已移除 */}

        {/* 时间栏容器 - 修改定位，确保位于导航栏下方 */}
        <AnimatePresence>
          {isTimelineOpen && rendered && (
            <motion.div 
              className="fixed right-0 z-40 overflow-y-auto flex justify-center items-start"
              style={{ 
                width: '70%',
                willChange: 'transform, opacity',
                pointerEvents: 'auto',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
                top: `${navbarHeight}px`, // 根据导航栏高度动态设置顶部偏移
                height: `calc(100vh - ${navbarHeight}px)`, // 调整高度，避免与导航栏重叠
              }}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={timelineVariants}
            >
              <motion.div 
                variants={childVariants} 
              >
                <Suspense fallback={<div className="text-center text-white/50 mt-10">加载中...</div>}>
                  <DynamicTimelineView />
                </Suspense>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default MainLayout; 