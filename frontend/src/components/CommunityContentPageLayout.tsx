/**
 * CommunityContentPageLayout.tsx
 * 
 * 功能注释：
 * 定义社区内容页面（例如主题 Topic 或关系主题 Relationship Topic 页面）的通用布局结构。
 * 负责组织页面的主要组成部分，包括：
 *   - 主要内容区域，包含：
 *     - 左侧（或主要区域）的帖子列表：
 *       - 使用网格布局 (grid) 排列帖子卡片。
 *       - 调用 FrostedPostCard 组件来渲染每个帖子。
 *       - 处理帖子加载状态 (isLoadingPosts) 和空列表情况。
 *     - 右侧（或侧边栏区域）的信息与操作区：
 *       - 显示社区信息卡片 (CommunityInfoCard)。
 *       - 提供创建新帖子、收藏（可选）、社区讨论（可选）等操作按钮。
 * 处理整个页面的加载状态 (isLoading) 和错误状态 (error)。
 * 管理 Chatbot 的打开/关闭状态。
 * 接收页面所需的数据作为 props，例如主题详情 (topicDetails)、帖子列表 (posts) 等。
 * 允许通过 children prop 插入特定于页面的额外内容。
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不在此组件中引入
 */
import React, { ReactNode, useState } from 'react';
import CommunityInfoCard from './CommunityInfoCard';
import FrostedPostCard from './FrostedPostCard';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext'; // 引入 useSidebar
import CommunityChatPanel from './CommunityChatPanel'; // 引入 CommunityChatPanel

// 定义帖子类型 (与页面组件一致)
interface Post {
  id: number;
  title: string;
  author: any;
  summary?: string;
  excerpt?: string;
  upvotes?: number;
  comments?: number;
  created_at?: string;
  timestamp?: string;
  cover_image?: string;
  imageUrl?: string;
  slug: string;
}

// 定义通用的主题信息类型 (包含 Topic 和 RelationshipTopic 的共同字段)
interface CommonTopicInfo {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  // participant_topics?: any[]; // 如果需要特殊处理关系主题的参与者
}

// --- 新增：定义父主题类型 ---
type ParentTopicType = 'topic' | 'relationship';
// --- 结束新增 ---

// 定义 Props 接口
interface CommunityContentPageLayoutProps {
  isLoading: boolean; // 页面主要内容是否加载中
  error: string | null; // 加载错误信息
  topicDetails: CommonTopicInfo | null; // 主题或关系主题的详情
  posts: Post[]; // 帖子列表
  isLoadingPosts: boolean; // 帖子是否加载中
  
  parentType: ParentTopicType;
  parentSlug: string | undefined;
  
  showFavoriteButton?: boolean; 
  isFavorited?: boolean;
  isLoadingFavorite?: boolean;
  onToggleFavorite?: () => void;

  onCreatePost?: () => void; 

  showChatButton?: boolean; 
  isChatAvailable?: boolean; 

  children?: ReactNode;
}

const CommunityContentPageLayout: React.FC<CommunityContentPageLayoutProps> = ({
  isLoading,
  error,
  topicDetails,
  posts,
  isLoadingPosts,
  parentType,
  parentSlug,
  showFavoriteButton = false,
  isFavorited = false,
  isLoadingFavorite = false,
  onToggleFavorite = () => {},
  onCreatePost = () => {},
  showChatButton = false,
  isChatAvailable = false,
  children
}) => {
  const { isSidebarOpen } = useSidebar(); // 使用 Context 获取状态
  const [isChatVisible, setIsChatVisible] = useState(false); // 添加状态控制聊天面板显隐

  return (
    <div className="flex-1 overflow-y-auto transition-all duration-300 ease-in-out">
          {isLoading && (
         <div className="flex justify-center items-center py-10">
               <p className="text-gray-400">正在加载内容...</p>
             </div>
          )}
          {error && !isLoading && (
         <div className="flex justify-center items-center py-10">
               <p className="text-red-400">错误: {error}</p>
            </div>
          )}

          {!isLoading && !error && topicDetails && (
            <div className="container mx-auto px-4 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                
                <div className="lg:col-span-3">
                  <div className="grid grid-cols-1 gap-5">
                    {isLoadingPosts ? (
                      <p className="text-center text-gray-400 py-10">正在加载帖子...</p>
                    ) : posts.length > 0 ? (
                      posts.map(post => (
                        <FrostedPostCard 
                          key={post.id} 
                          post={post} 
                          parentType={parentType}
                          parentSlug={parentSlug}
                        />
                      ))
                    ) : (
                      <p className="text-center text-gray-400 py-10">这里还没有帖子。</p>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-5">
                  <CommunityInfoCard 
                    name={topicDetails.name}
                    description={topicDetails.description}
                    slug={topicDetails.slug}
                    id={topicDetails.id}
                    isFavorited={isFavorited}
                    onToggleFavorite={onToggleFavorite}
                    isLoadingFavorite={isLoadingFavorite}
                  />
                    
                  <div className="flex flex-row justify-start gap-2 flex-wrap">
                    <button
                      onClick={onCreatePost}
                      className={`flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 \
                                  bg-gray-700/50 text-gray-300 hover:bg-gray-600/70 \
                                  backdrop-blur-sm border border-gray-600/50`}
                      title="发布新帖子"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      新帖子
                    </button>
                    
                    {showFavoriteButton && (
                      <button 
                        onClick={onToggleFavorite} 
                        disabled={isLoadingFavorite}
                        className={`flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 backdrop-blur-sm border border-gray-600/50 \
                                    ${isLoadingFavorite 
                                      ? 'opacity-50 cursor-not-allowed bg-gray-600/50 text-gray-400'
                                      : isFavorited 
                                        ? 'bg-yellow-500/60 text-yellow-100 hover:bg-yellow-600/70'
                                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/70'
                                    }`
                                  }
                      >
                          {isLoadingFavorite ? (
                            <>
                            <svg className="animate-spin h-3.5 w-3.5 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                              <span>加载</span>
                            </>
                          ) : (
                            <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                              {isFavorited ? '已收藏' : '收藏'}
                            </>
                        )}
                      </button>
                    )}
                    
                    {showChatButton && (
                      <button 
                        onClick={() => setIsChatVisible(!isChatVisible)}
                        disabled={!isChatAvailable}
                        className={`flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 \
                                    bg-[#CD5C5C]/50 text-gray-200 hover:bg-[#CD5C5C]/70 \
                                    backdrop-blur-sm border border-gray-600/50 \
                                    ${!isChatAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        讨论
                      </button>
                    )}
                  </div>

                  {isChatVisible && topicDetails && (
                    <CommunityChatPanel
                      isOpen={isChatVisible}
                      onClose={() => setIsChatVisible(false)}
                      communityId={topicDetails.id}
                      communityType={parentType === 'topic' ? 'topic' : 'relationship_topic'}
                      communityName={topicDetails.name}
                    />
                  )}

                </div>
              </div>
            </div>
          )}

          {children}
    </div>
  );
};

export default CommunityContentPageLayout; 