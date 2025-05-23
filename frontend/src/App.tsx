import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  Routes,
  Route,
  useLocation
} from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { TimelineProvider } from './contexts/TimelineContext';
import { LinkBehaviorProvider } from './contexts/LinkBehaviorContext';
import HomePage from './pages/HomePage';
// 移除图片导入
import './assets/css/article-card.css'; // 添加文章卡片相关的CSS
// 导入图片处理工具
import { handleImageLoadError } from './utils/imageProxy';
import AuthGuard from './components/AuthGuard'; // 导入AuthGuard组件

// 使用React.lazy进行组件懒加载
const Community = lazy(() => import('./pages/Community'));
const CommunityTopicPage = lazy(() => import('./pages/CommunityTopicPage'));
const CategoryToolsPage = lazy(() => import('./pages/CategoryToolsPage'));
const ToolDetailPage = lazy(() => import('./pages/ToolDetailPage'));
const ToolGeneratorPage = lazy(() => import('./pages/ToolGeneratorPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
// const ChatPage = lazy(() => import('./pages/ChatPage'));
const ArticleListPage = lazy(() => import('./pages/ArticleListPage'));
const PostsListPage = lazy(() => import('./pages/PostsListPage'));
const ArticlePage = lazy(() => import('./pages/ArticlePage'));
const NewArticlePageToast = lazy(() => import('./pages/NewArticlePageToast'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const NewCommunityPostPageToast = lazy(() => import('./pages/NewCommunityPostPageToast'));
const EditPostPageToast = lazy(() => import('./pages/EditPostPageToast'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const UserActivitiesPage = lazy(() => import('./pages/UserActivitiesPage'));
const MainLayout = lazy(() => import('./layouts/MainLayout'));
const RelationshipTopicPage = lazy(() => import('./pages/RelationshipTopicPage'));
const DynamicDetailPage = lazy(() => import('./pages/DynamicDetailPage'));
const UserSpacePage = lazy(() => import('./pages/UserSpacePage'));

const ProtectRoute = ({ children }: { children: React.ReactElement }) => {
  return <AuthGuard requireAuth={true}>{children}</AuthGuard>;
};

/**
 * 加载中组件，显示在懒加载过程中
 * 使用固定的背景渐变样式，防止白屏闪烁
 */
const LoadingFallback = () => (
  <div 
    className="fixed inset-0 w-full h-full"
    style={{ 
      zIndex: 999
    }}
  >
    {/* 此处不再渲染 "加载中..." 文本或任何旋转动画，
        因为 preload.html 和页面级骨架屏会处理加载状态的视觉反馈。
        这个 fallback 现在主要用于占位并保持背景色一致，防止在懒加载完成前出现短暂的空白或不一致的背景。
    */}
  </div>
);

/**
 * 全局页面预加载容器
 * 保持与MainLayout相同的背景样式，确保页面跳转时背景一致
 */
const PageContainer = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 移除图片预加载，直接设置加载状态为false
    // 减少延迟时间，加快页面加载
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {children}
    </Suspense>
  );
};

// 让handleImageLoadError成为全局函数，以便内联onerror处理器可以调用它
declare global {
  interface Window {
    handleImageLoadError: typeof handleImageLoadError;
  }
}

const App: React.FC = () => {
  const location = useLocation(); // 获取 location 对象

  // 添加防止视频自动播放的全局脚本
  useEffect(() => {
    // 创建一个函数处理所有iframe
    const handleIframes = () => {
      // 查找所有iframe
      const iframes = document.querySelectorAll('iframe');
      
      iframes.forEach(iframe => {
        try {
          // 检查是否为B站或YouTube iframe
          if (iframe.src && (iframe.src.includes('bilibili.com') || iframe.src.includes('youtube.com'))) {
            const url = new URL(iframe.src);
            
            // 确保使用HTTPS
            if (url.protocol === 'http:') {
              url.protocol = 'https:';
            }
            
            // 强制设置不自动播放
            url.searchParams.set('autoplay', '0');
            
            // B站特殊处理
            if (iframe.src.includes('bilibili.com')) {
              url.searchParams.set('danmaku', '0');
              url.searchParams.set('as_wide', '0');
              url.searchParams.set('high_quality', '0');
            }
            
            // 仅当参数变更时才更新，避免无限刷新
            if (iframe.src !== url.toString()) {
              iframe.src = url.toString();
            }
            
            // 移除可能导致自动播放的属性
            iframe.removeAttribute('autoplay');
            iframe.allow = iframe.allow.replace(/autoplay/g, '');
          }

          // 处理所有iframe的src，确保使用HTTPS
          if (iframe.src && iframe.src.startsWith('http:')) {
            iframe.src = iframe.src.replace('http:', 'https:');
          }
        } catch (error) {
          console.warn('处理iframe防自动播放失败:', error);
        }
      });
    };
    
    // 页面加载时执行一次
    handleIframes();
    
    // 使用MutationObserver监控DOM变化
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      
      // 检查是否有新增iframe
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'IFRAME' || 
                (node instanceof Element && node.querySelector('iframe'))) {
              shouldProcess = true;
            }
          });
        }
      });
      
      if (shouldProcess) {
        handleIframes();
      }
    });
    
    // 开始监控整个文档
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 清理函数
    return () => {
      observer.disconnect();
    };
  }, []);

  // 设置全局图片错误处理函数
  useEffect(() => {
    window.handleImageLoadError = handleImageLoadError;
    
    return () => {
      // 清理全局函数 - 修复linter错误
      window.handleImageLoadError = undefined as any;
    };
  }, []);

  return (
    <AuthProvider>
      <TimelineProvider>
        <SidebarProvider>
          <LinkBehaviorProvider defaultOpenInNewTab={true}>
          <PageContainer>
            <Routes>
              {/* 登录和注册页面，独立于 MainLayout */} 
              <Route path="/login" element={<AuthPage />} />
              <Route path="/register" element={<AuthPage />} />

              {/* 使用 MainLayout 作为其余所有路由的容器 */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/community" element={<Community />} />
                <Route path="/community/topic/:topicSlug" element={<CommunityTopicPage />} />
                <Route path="/community/topic/:topicSlug/posts/:postSlug" element={<PostDetailPage />} />
                <Route path="/community/relationship-topic/:slug" element={<RelationshipTopicPage />} />
                <Route path="/community/relationship-topic/:relationshipSlug/posts/:postSlug" element={<PostDetailPage />} />
                <Route path="/community/:community_slug/new-post" element={<ProtectRoute><NewCommunityPostPageToast /></ProtectRoute>} />
                <Route path="/posts/:postSlug" element={<PostDetailPage />} />
                <Route path="/dynamic/:actionId" element={<DynamicDetailPage />} />
                <Route path="/tools/category/:categorySlug" element={<CategoryToolsPage />} />
                <Route path="/tools/:slug" element={<ToolDetailPage />} />
                <Route path="/tools" element={<ProtectRoute><ToolsPage /></ProtectRoute>} />
                <Route path="/tool-generator" element={<ProtectRoute><ToolGeneratorPage /></ProtectRoute>} />
                {/* <Route path="/chat" element={<ProtectRoute><ChatPage /></ProtectRoute>} /> */}
                <Route path="/articles" element={<ArticleListPage />} />
                <Route path="/posts" element={<PostsListPage />} />
                <Route path="/article/:slug" element={<ArticlePage />} />
                <Route path="/new-article" element={<ProtectRoute><NewArticlePageToast /></ProtectRoute>} />
                <Route path="/edit-article/:slug" element={<ProtectRoute><NewArticlePageToast /></ProtectRoute>} />
                <Route 
                  path="/profile/me" 
                  element={<ProtectRoute><ProfilePage isMe={true} /></ProtectRoute>} 
                /> 
                <Route 
                  path="/profile/:userId" 
                  element={<ProtectRoute><ProfilePage isMe={false} /></ProtectRoute>} 
                /> 
                <Route path="/users/:userId/activities" element={<UserActivitiesPage />} />
                <Route path="/edit-post/:post_slug" element={<ProtectRoute><EditPostPageToast /></ProtectRoute>} />
                <Route path="/space" element={<ProtectRoute><UserSpacePage /></ProtectRoute>} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </PageContainer>
          </LinkBehaviorProvider>
        </SidebarProvider>
      </TimelineProvider>
    </AuthProvider>
  );
};

export default App;
