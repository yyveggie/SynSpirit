/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此组件用于展示指定用户的所有动态活动。
 * 
 * 主要功能:
 * - 通过URL参数获取用户ID，加载并显示该用户的所有动态
 * - 支持无限滚动加载更多动态
 * - 显示动态的详细信息，包括点赞、收藏、评论和转发
 * - 提供动态详情模态框查看和交互功能
 * - 展示用户基本信息
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
// 已移除: import Navbar from "../components/Navbar";
import DynamicCard from '../components/DynamicCard';
import DynamicDetailView from '../components/DynamicDetailView';
import UserAvatarWithImage from '../components/UserAvatarWithImage';
import Modal from '../components/Modal';
import { DynamicDetails } from '../components/QuotedDynamicView';
import { FaCalendarAlt } from 'react-icons/fa';

// 动态项接口定义与HomePage中保持一致
interface DynamicItem {
  action_id: number; 
  share_comment: string | null;
  shared_at: string;
  sharer_id?: number | null;
  sharer_username: string;
  sharer_avatar_url?: string | null;
  is_repost: boolean; 
  original_action: DynamicDetails | null;

  target_type: 'article' | 'post' | 'action' | 'tool' | 'user' | 'deleted' | string; 
  target_title: string | null;
  target_slug: string | null; 
  target_id: number | null;

  likes_count?: number;      
  collects_count?: number;
  reposts_count?: number;
  is_liked_by_current_user?: boolean;
  is_collected_by_current_user?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
  images?: string[];
  
  is_deleted?: boolean; // 添加is_deleted属性
}

// 用户信息接口定义
interface UserInfo {
  id: number;
  email: string;
  nickname: string | null;
  avatar_url: string | null;
  joined_at: string;
  bio: string | null;
  article_count: number;
  post_count: number;
  follower_count: number;
  following_count: number;
  is_followed_by_current_user: boolean;
}

// DynamicCard 组件所需的接口
interface Dynamic {
  id: number;
  created_at: string;
  // 其他所需属性
  target_type: 'article' | 'post' | 'tool' | 'action' | 'user';
  target_id: number;
  content?: string;
  author?: any;
  like_count?: number;
  collect_count?: number;
  repost_count?: number;
  comment_count?: number;
  current_user_like_action_id?: number | null;
  current_user_collect_action_id?: number | null;
  target_article?: any;
  target_post?: any;
  target_tool?: any;
  images?: string[];
}

const UserActivitiesPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  
  // 状态管理
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [dynamics, setDynamics] = useState<DynamicItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedDynamic, setSelectedDynamic] = useState<DynamicDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // 格式化日期函数
  const formatJoinDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  // 加载用户信息
  const fetchUserInfo = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      if (response.data) {
        console.log('获取到的用户信息:', response.data);
        console.log('用户头像URL:', response.data.avatar_url);
        setUserInfo(response.data);
      }
    } catch (err: any) {
      console.error('获取用户信息失败:', err);
      setError('无法加载用户信息');
    }
  }, [userId, token]);

  // 加载用户动态
  const fetchUserDynamics = useCallback(async (pageNum: number) => {
    if (!userId) return;
    
    try {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}/dynamics`, {
        params: { page: pageNum, limit: 10 },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      
      if (response.data && Array.isArray(response.data.dynamics)) {
        console.log('获取到的用户动态:', response.data.dynamics);
        
        // 过滤掉已删除的动态
        const filteredDynamics = response.data.dynamics.filter((dynamic: DynamicItem) => !dynamic.is_deleted);
        console.log('过滤后的动态数量:', filteredDynamics.length);
        
        if (pageNum === 1) {
          setDynamics(filteredDynamics);
        } else {
          setDynamics(prev => [...prev, ...filteredDynamics]);
        }
        
        setHasMore(filteredDynamics.length === 10);
      } else {
        setHasMore(false);
      }
    } catch (err: any) {
      console.error('获取用户动态失败:', err);
      setError('无法加载用户动态');
    } finally {
      if (pageNum === 1) {
        setIsLoading(false);
      } else {
        setIsLoadingMore(false);
      }
    }
  }, [userId, token]);

  // 初始加载
  useEffect(() => {
    if (userId) {
      setPage(1);
      fetchUserInfo();
      fetchUserDynamics(1);
    }
  }, [userId, fetchUserInfo, fetchUserDynamics]);

  // 设置无限滚动
  useEffect(() => {
    if (isLoading || !hasMore) return;
    
    const handleObserver = (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && !isLoadingMore) {
        setPage(prev => prev + 1);
      }
    };
    
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '0px 0px 100px 0px'
    });
    
    observerRef.current = observer;
    
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoading, hasMore, isLoadingMore]);

  // 加载更多数据
  useEffect(() => {
    if (page > 1) {
      fetchUserDynamics(page);
    }
  }, [page, fetchUserDynamics]);

  // 打开动态详情模态框
  const openDynamicModal = (item: DynamicItem) => {
    // 将DynamicItem转换为DynamicDetails格式
    
    // 更精确地推断 action_type
    // action_type 的可能值为: 'share', 'create_status' (在此上下文中，'like' 和 'collect' 通常不作为独立的动态卡片展示)
    let determined_action_type: 'share' | 'create_status';
    if (item.is_repost) { 
      // 转发的动态 (target_type 应该是 'action')，其本身行为是 'share'
      determined_action_type = 'share';
    } else if (item.target_type === 'user') {
      // 非转发，且目标是用户自身，这代表一个原创的状态/动态
      determined_action_type = 'create_status';
    } else {
      // 非转发，且目标是其他类型 (如 article, post)，这代表分享了一个已存在的外部内容
      determined_action_type = 'share';
    }

    const dynamicDetails: DynamicDetails = {
      action_id: item.action_id,
      share_comment: item.share_comment,
      action_type: determined_action_type,
      shared_at: item.shared_at,
      sharer_id: item.sharer_id ?? null,
      sharer_username: item.sharer_username,
      sharer_avatar_url: item.sharer_avatar_url,
      is_repost: item.is_repost,
      original_action: item.original_action,
      target_type: item.target_type,
      target_title: item.target_title,
      target_slug: item.target_slug,
      target_id: item.target_id,
      likes_count: item.likes_count || 0,
      collects_count: item.collects_count || 0,
      reposts_count: item.reposts_count || 0,
      is_liked_by_current_user: item.is_liked_by_current_user || false,
      is_collected_by_current_user: item.is_collected_by_current_user || false,
      like_action_id: item.like_action_id || null,
      collect_action_id: item.collect_action_id || null
    };
    
    setSelectedDynamic(dynamicDetails);
    setIsModalOpen(true);
  };

  // 关闭动态详情模态框
  const closeDynamicModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedDynamic(null);
    }, 300);
  };

  // 处理转发成功
  const handleRepostSuccess = () => {
    // 刷新动态列表
    setPage(1);
    fetchUserDynamics(1);
  };

  // 处理交互状态变化 (点赞、收藏)
  const handleInteractionChange = (updatedDynamic: DynamicDetails) => {
    setDynamics(prevDynamics => prevDynamics.map(dynamic => {
      if (dynamic.action_id === updatedDynamic.action_id) {
        return {
          ...dynamic,
          likes_count: updatedDynamic.likes_count,
          collects_count: updatedDynamic.collects_count,
          reposts_count: updatedDynamic.reposts_count,
          is_liked_by_current_user: updatedDynamic.is_liked_by_current_user,
          is_collected_by_current_user: updatedDynamic.is_collected_by_current_user,
          like_action_id: updatedDynamic.like_action_id,
          collect_action_id: updatedDynamic.collect_action_id
        };
      }
      return dynamic;
    }));
    
    // 如果当前选中的动态与更新的动态相同，也更新它
    if (selectedDynamic?.action_id === updatedDynamic.action_id) {
      setSelectedDynamic(updatedDynamic);
    }
  };

  // 动态项完成更新回调
  const handleDynamicActionComplete = () => {
    // 可以添加额外的处理逻辑，如显示通知或更新UI
  };

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-white">
      {/* 移除Navbar组件 */}
      
      <div className="container mx-auto p-4 flex-grow">
        {error ? (
          <div className="text-center py-8">
            <p className="text-xl text-red-400">{error}</p>
            <button 
              onClick={() => navigate('/')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition"
            >
              返回首页
            </button>
          </div>
        ) : isLoading && !userInfo ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* 用户信息卡片 */}
            {userInfo && (
              <div className="bg-gray-800/70 rounded-lg p-5 mb-6 shadow-lg">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
                  <div className="relative">
                    <UserAvatarWithImage 
                      userId={userInfo.id} 
                      username={userInfo.nickname || userInfo.email.split('@')[0]}
                      avatarUrl={userInfo.avatar_url}
                      size="lg"
                      showName={false}
                    />
                  </div>
                  
                  <div className="flex-grow text-center md:text-left">
                    <h2 className="text-2xl font-bold">
                      {userInfo.nickname || userInfo.email.split('@')[0]}
                    </h2>
                    
                    <div className="flex items-center justify-center md:justify-start text-gray-400 mt-1">
                      <FaCalendarAlt className="mr-1" />
                      <span className="text-sm">加入于 {formatJoinDate(userInfo.joined_at)}</span>
                    </div>
                    
                    {userInfo.bio && (
                      <p className="mt-3 text-gray-300">{userInfo.bio}</p>
                    )}
                    
                    <div className="mt-4 flex flex-wrap gap-6 justify-center md:justify-start">
                      <div className="text-center">
                        <div className="text-xl font-semibold">{userInfo.article_count}</div>
                        <div className="text-sm text-gray-400">文章</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-semibold">{userInfo.post_count}</div>
                        <div className="text-sm text-gray-400">帖子</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-semibold">{userInfo.follower_count}</div>
                        <div className="text-sm text-gray-400">粉丝</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-semibold">{userInfo.following_count}</div>
                        <div className="text-sm text-gray-400">关注</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* 动态列表 */}
            <h2 className="text-xl font-bold mb-4">用户动态</h2>
            
            {isLoading && dynamics.length === 0 ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : dynamics.length === 0 ? (
              <div className="text-center py-8 bg-gray-800/30 rounded-lg">
                <p className="text-lg text-gray-400">该用户还没有任何动态</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dynamics.map(dynamic => {
                  // 添加调试输出
                  console.log('渲染动态信息:', dynamic);
                  console.log('传递给动态卡片的头像URL:', userInfo?.avatar_url);
                  
                  // 构建传递给DynamicCard的数据
                  const dynamicCardData = {
                    id: dynamic.action_id,
                    target_type: (
                      dynamic.target_type === 'article' ? 'article' :
                      dynamic.target_type === 'post' ? 'post' :
                      dynamic.target_type === 'tool' ? 'tool' :
                      dynamic.target_type === 'action' ? 'action' : 
                      dynamic.target_type === 'user' ? 'user' : 'article'
                    ) as 'article' | 'post' | 'tool' | 'action' | 'user',
                    target_id: dynamic.target_id || 0,
                    created_at: dynamic.shared_at,
                    content: dynamic.share_comment || '',
                    like_count: dynamic.likes_count,
                    collect_count: dynamic.collects_count,
                    repost_count: dynamic.reposts_count,
                    current_user_like_action_id: dynamic.like_action_id,
                    current_user_collect_action_id: dynamic.collect_action_id,
                    // 确保图片能够传递
                    images: dynamic.images || [],
                    // 将DynamicDetails转换为Dynamic接口所需的格式
                    original_action: dynamic.original_action ? {
                      id: dynamic.original_action.action_id,
                      created_at: dynamic.original_action.shared_at,
                      content: dynamic.original_action.share_comment || '',
                      target_type: (
                        dynamic.original_action.target_type === 'article' ? 'article' :
                        dynamic.original_action.target_type === 'post' ? 'post' :
                        dynamic.original_action.target_type === 'tool' ? 'tool' :
                        dynamic.original_action.target_type === 'action' ? 'action' : 
                        dynamic.original_action.target_type === 'user' ? 'user' : 'article'
                      ) as 'article' | 'post' | 'tool' | 'action' | 'user',
                      target_id: dynamic.original_action.target_id || 0,
                    } : null,
                    // 其他必要的属性，确保传递正确的头像URL
                    author: {
                      id: Number(userId),
                      nickname: dynamic.sharer_username,
                      avatar: userInfo?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(dynamic.sharer_username)}&background=0D8ABC&color=fff`, // 明确传递头像URL
                      email: userInfo?.email // 提供email作为备用名称来源
                    },
                    target_article: dynamic.target_type === 'article' ? {
                      id: dynamic.target_id || 0,
                      title: dynamic.target_title || '',
                      slug: dynamic.target_slug || '',
                    } : null,
                    target_post: dynamic.target_type === 'post' ? {
                      id: dynamic.target_id || 0,
                      title: dynamic.target_title || '',
                      slug: dynamic.target_slug || '',
                    } : null,
                    target_tool: dynamic.target_type === 'tool' ? {
                      id: dynamic.target_id || 0,
                      name: dynamic.target_title || '',
                      slug: dynamic.target_slug || '',
                    } : null,
                  };
                  
                  console.log('传递给DynamicCard的数据:', dynamicCardData);
                  
                  return (
                    <div 
                      key={dynamic.action_id} 
                      className="cursor-pointer"
                      onClick={() => openDynamicModal(dynamic)}
                    >
                      <DynamicCard 
                        dynamic={dynamicCardData}
                        onActionComplete={handleDynamicActionComplete}
                      />
                    </div>
                  );
                })}
                
                {/* 加载更多参考点 */}
                {hasMore && (
                  <div ref={loadMoreRef} className="py-4 text-center">
                    {isLoadingMore && (
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 动态详情模态框 */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeDynamicModal}
      >
        <DynamicDetailView 
          dynamic={selectedDynamic}
          onClose={closeDynamicModal}
          onRepostSuccess={handleRepostSuccess}
          onInteractionChange={handleInteractionChange}
        />
      </Modal>
    </div>
  );
};

export default UserActivitiesPage; 