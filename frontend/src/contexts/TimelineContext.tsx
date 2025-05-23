import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { DynamicItem } from '../components/DynamicFeed';
import { useLocation, useNavigate } from 'react-router-dom';

interface TimelineContextProps {
  isTimelineOpen: boolean;
  selectedDynamicId: number | null;
  selectedDynamicData: DynamicItem | null;
  openTimeline: (dynamic: DynamicItem) => void;
  closeTimeline: () => void;
}

const TimelineContext = createContext<TimelineContextProps | undefined>(undefined);

export const TimelineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [selectedDynamicId, setSelectedDynamicId] = useState<number | null>(null);
  const [selectedDynamicData, setSelectedDynamicData] = useState<DynamicItem | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // URL同步功能：当打开时间线时，更新URL为可共享链接
  const updateUrlWithDynamicId = useCallback((dynamicId: number | null) => {
    // 处理打开时间线的情况
    if (dynamicId) {
      const dynamicPath = `/dynamic/${dynamicId}`;
      // 只有当URL与动态路径不同时才更新
      if (location.pathname !== dynamicPath) {
        // 存储当前URL路径，以便在关闭时恢复
        if (!sessionStorage.getItem('previousUrl')) {
          sessionStorage.setItem('previousUrl', location.pathname + location.search);
        }
        
        // 使用history.pushState更新URL，不会导致页面刷新
        window.history.pushState(
          { dynamicId, previousUrl: location.pathname + location.search }, 
          '', 
          dynamicPath
        );
      }
    } 
    // 处理关闭时间线的情况（但这个分支现在主要由closeTimeline直接处理）
    else if (!dynamicId && location.pathname.startsWith('/dynamic/')) {
      const previousUrl = sessionStorage.getItem('previousUrl') || '/';
      sessionStorage.removeItem('previousUrl');
      window.history.replaceState(null, '', previousUrl);
    }
  }, [location.pathname, location.search]);

  const openTimeline = useCallback((dynamic: DynamicItem) => {
    console.log('Opening timeline for dynamic:', dynamic);
    setSelectedDynamicId(dynamic.action_id);
    setSelectedDynamicData(dynamic);
    setIsTimelineOpen(true);
    document.body.classList.add('timeline-view-active'); 
    
    // 更新URL为可分享链接
    updateUrlWithDynamicId(dynamic.action_id);
  }, [updateUrlWithDynamicId]);

  const closeTimeline = useCallback(() => {
    console.log('Closing timeline');
    setIsTimelineOpen(false);
    setSelectedDynamicId(null);
    setSelectedDynamicData(null);
    document.body.classList.remove('timeline-view-active');
    
    // 恢复URL（无论当前是否是动态详情URL）
    if (location.pathname.startsWith('/dynamic/')) {
      // 强制恢复URL到之前存储的URL或首页
      const previousUrl = sessionStorage.getItem('previousUrl') || '/';
      sessionStorage.removeItem('previousUrl');
      window.history.replaceState(null, '', previousUrl);
    }
  }, [location.pathname]);

  // 监听浏览器前进/后退事件
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.dynamicId) {
        // 用户点击了后退，但我们仍在动态详情URL上
        // 这种情况下不做处理，保持时间线打开
      } else if (isTimelineOpen) {
        // 用户在时间线打开状态下点击后退，关闭时间线
        // 此时浏览器已经将URL恢复为之前的URL，所以不需要额外处理URL更改
        setIsTimelineOpen(false);
        setSelectedDynamicId(null);
        setSelectedDynamicData(null);
        document.body.classList.remove('timeline-view-active');
        // 确保清除sessionStorage中的previousUrl
        sessionStorage.removeItem('previousUrl');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isTimelineOpen, setIsTimelineOpen, setSelectedDynamicId, setSelectedDynamicData]);

  // 检测直接访问动态详情URL的情况
  useEffect(() => {
    // 仅在组件挂载时执行一次
    const dynamicMatch = location.pathname.match(/^\/dynamic\/(\d+)$/);
    if (dynamicMatch && !isTimelineOpen) {
      const dynamicId = parseInt(dynamicMatch[1], 10);
      if (!isNaN(dynamicId)) {
        console.log('Direct navigation to dynamic page detected:', dynamicId);
        // 直接从详情页URL访问，需要异步获取动态数据
        // 这里只设置ID并打开面板，实际数据会由DynamicTimelineView从API获取
        setSelectedDynamicId(dynamicId);
        setIsTimelineOpen(true);
        document.body.classList.add('timeline-view-active');
      }
    }
  }, [location.pathname, isTimelineOpen]);

  return (
    <TimelineContext.Provider value={{ 
      isTimelineOpen, 
      selectedDynamicId, 
      selectedDynamicData,
      openTimeline, 
      closeTimeline 
    }}>
      {children}
    </TimelineContext.Provider>
  );
};

export const useTimeline = () => {
  const context = useContext(TimelineContext);
  if (context === undefined) {
    throw new Error('useTimeline must be used within a TimelineProvider');
  }
  return context;
}; 