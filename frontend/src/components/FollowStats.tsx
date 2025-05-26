import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext'; // 用于获取当前用户信息和 token
import { toast } from 'react-toastify';
import UserListModal from './UserListModal'; // <-- 导入 Modal 组件

// 定义列表中的用户信息接口 (也可以单独放到 types 文件中)
interface UserInfo {
  id: number;
  nickname: string;
  avatar: string | null;
}

interface FollowStatsProps {
  targetUserId: number;   // 目标用户的 ID
  isOwnProfile: boolean; // 是否是当前登录用户自己的主页
}

/**
 * @component FollowStats
 * @description 显示用户的关注数、粉丝数，并提供关注/取消关注按钮（如果不是用户自己的主页）。
 */
const FollowStats: React.FC<FollowStatsProps> = ({ targetUserId, isOwnProfile }) => {
  const { user: currentUser, token } = useAuth(); // 获取当前登录用户和 token
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false); // 当前登录用户是否关注了目标用户
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true); // 加载关注状态
  const [isProcessingFollow, setIsProcessingFollow] = useState(false); // 正在处理关注/取关请求

  // --- 新增 Modal 相关状态 ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState(''); // Modal 标题
  const [userList, setUserList] = useState<UserInfo[]>([]); // 存储从 API 获取的用户列表
  const [isLoadingList, setIsLoadingList] = useState(false); // 列表加载状态
  const [listType, setListType] = useState<'following' | 'followers' | null>(null); // 当前加载的列表类型
  // 可选：添加分页状态
  // const [currentPage, setCurrentPage] = useState(1);
  // const [totalPages, setTotalPages] = useState(1);
  // const [hasMore, setHasMore] = useState(true);
  // --- 结束新增 --- 

  // 获取关注数和粉丝数
  const fetchCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      const [followersRes, followingRes] = await Promise.all([
        axios.get<{ count: number }>(`${API_BASE_URL}/api/users/${targetUserId}/followers/count`),
        axios.get<{ count: number }>(`${API_BASE_URL}/api/users/${targetUserId}/following/count`),
      ]);
      setFollowerCount(followersRes.data.count);
      setFollowingCount(followingRes.data.count);
    } catch (error) {
      // 可以选择设置错误状态或显示默认值
      setFollowerCount(0);
      setFollowingCount(0);
    } finally {
      setIsLoadingCounts(false);
    }
  }, [targetUserId]);

  // 获取当前用户的关注状态
  const fetchFollowStatus = useCallback(async () => {
    // 只有登录用户才能检查关注状态，且目标不是自己
    if (!token || isOwnProfile) {
      setIsLoadingStatus(false);
      setIsFollowing(false); // 未登录或看自己主页，肯定没关注
      return;
    }
    setIsLoadingStatus(true);
    try {
      const response = await axios.get<{ isFollowing: boolean }>(
        `${API_BASE_URL}/api/users/${targetUserId}/follow-status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsFollowing(response.data.isFollowing);
    } catch (error) {
      setIsFollowing(false); // 出错时默认为未关注
    } finally {
      setIsLoadingStatus(false);
    }
  }, [targetUserId, token, isOwnProfile]);

  // 首次加载或 targetUserId 变化时，获取数据
  useEffect(() => {
    fetchCounts();
    fetchFollowStatus();
  }, [targetUserId, fetchCounts, fetchFollowStatus]); // 依赖 targetUserId 和回调函数

  // 处理关注操作
  const handleFollow = async () => {
    if (!token || isProcessingFollow || isOwnProfile) return;
    setIsProcessingFollow(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/users/${targetUserId}/follow`,
        {}, // POST 请求体为空
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 201 || response.status === 200) {
        setIsFollowing(true);
        // 关注成功后，粉丝数+1
        setFollowerCount(prev => (prev !== null ? prev + 1 : 1));
        toast.success('关注成功！');
      } else {
          throw new Error(response.data?.error || '关注失败');
      }
    } catch (error: any) {
      toast.error(`关注失败: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsProcessingFollow(false);
    }
  };

  // 处理取消关注操作
  const handleUnfollow = async () => {
    if (!token || isProcessingFollow || isOwnProfile) return;
    setIsProcessingFollow(true);
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/api/users/${targetUserId}/follow`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 200) {
        setIsFollowing(false);
        // 取关成功后，粉丝数-1
        setFollowerCount(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
        toast.info('已取消关注');
      } else {
         throw new Error(response.data?.error || '取消关注失败');
      }
    } catch (error: any) {
       toast.error(`取消关注失败: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsProcessingFollow(false);
    }
  };

  /**
   * @function fetchUserList
   * @description 获取关注列表或粉丝列表
   * @param type {'following' | 'followers'} 要获取的列表类型
   */
  const fetchUserList = useCallback(async (type: 'following' | 'followers') => {
    if (!targetUserId) return;
    setIsLoadingList(true);
    setUserList([]); // 清空旧列表
    setListType(type);
    setModalTitle(type === 'following' ? '关注列表' : '粉丝列表');
    setIsModalOpen(true);
    // setCurrentPage(1); // 重置分页

    try {
      const response = await axios.get<{users: UserInfo[], total: number, page: number, pages: number}>(
        `${API_BASE_URL}/api/users/${targetUserId}/${type}`,
        { params: { page: 1, limit: 50 } } // 暂时一次加载较多，后续可实现分页
      );
      if (response.data && response.data.users) {
        setUserList(response.data.users);
        // setTotalPages(response.data.pages);
        // setHasMore(response.data.page < response.data.pages);
      } else {
        setUserList([]);
        // setTotalPages(1);
        // setHasMore(false);
      }
    } catch (error) {
      toast.error(`加载${type === 'following' ? '关注' : '粉丝'}列表失败`);
      setUserList([]);
      // setTotalPages(1);
      // setHasMore(false);
      setIsModalOpen(false); // 出错时关闭 Modal
    } finally {
      setIsLoadingList(false);
    }
  }, [targetUserId]);

  // 打开 Modal 的辅助函数
  const openFollowingList = () => fetchUserList('following');
  const openFollowersList = () => fetchUserList('followers');
  const closeModal = () => setIsModalOpen(false);

  // 渲染加载状态或数字的函数
  const renderCount = (count: number | null, label: string, onClickHandler: () => void) => {
    const isLoading = isLoadingCounts; // 使用关注/粉丝总数的加载状态
    const numberToShow = count ?? 0;

    return (
      <button 
        className="text-center cursor-pointer group disabled:cursor-default" 
        onClick={onClickHandler} 
        disabled={isLoading || numberToShow === 0} // 加载中或数量为0时不可点击
        title={isLoading ? '加载中' : (numberToShow > 0 ? `查看${label}列表` : `暂无${label}`)}
      >
        <span className={`block text-base font-semibold text-black group-hover:text-indigo-600 transition-colors ${isLoading || numberToShow === 0 ? 'text-gray-500 group-hover:text-gray-500' : ''}`}>
          {isLoading ? '...' : numberToShow}
        </span>
        <span className={`block text-xs group-hover:text-gray-700 transition-colors ${isLoading || numberToShow === 0 ? 'text-gray-600 group-hover:text-gray-600' : 'text-black'}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* 关注/粉丝显示区域 */} 
      <div className="mt-2 flex items-center justify-center space-x-3 py-1">
        {/* 关注数 - 可点击 */}
        {renderCount(followingCount, '关注', openFollowingList)}

        {/* 分隔线 */}
        <div className="h-5 w-px bg-gray-400"></div>

        {/* 粉丝数 - 可点击 */}
        {renderCount(followerCount, '粉丝', openFollowersList)}

        {/* 关注/取消关注按钮 */}
        {!isOwnProfile && currentUser && (
          <>
            <div className="h-5 w-px bg-gray-400"></div>
            <button
              onClick={isFollowing ? handleUnfollow : handleFollow}
              disabled={isLoadingStatus || isProcessingFollow}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-200 flex items-center justify-center min-w-[70px] ${ 
                isProcessingFollow ? 'opacity-50 cursor-not-allowed' : ''
              } ${ 
                isFollowing
                  ? 'bg-gray-600/70 text-gray-300 hover:bg-gray-500/70' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isLoadingStatus ? (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : isProcessingFollow ? (
                   isFollowing ? '取消中...' : '关注中...'
              ) : (
                isFollowing ? '已关注' : '+ 关注'
              )}
            </button>
          </>
        )}
      </div>

      {/* 用户列表 Modal */}
      <UserListModal 
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalTitle}
        users={userList}
        isLoading={isLoadingList}
      />
    </>
  );
};

export default FollowStats; 