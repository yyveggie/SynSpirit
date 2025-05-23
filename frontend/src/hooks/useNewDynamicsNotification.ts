import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext'; // 使用 useAuth Hook
import { API_BASE_URL } from '../config'; // API 基础 URL

// 定义 Hook 返回值的类型
interface UseNewDynamicsNotificationReturn {
  latestFeedNewCount: number;
  followingFeedNewCount: number;
  updateLastSeenLatestFeedId: (latestId: number | null) => void;
  updateLastSeenFollowingFeedId: (latestId: number | null) => void;
  forceRefreshCounts: () => void; // 手动触发一次刷新
  incrementLatestCount: () => void; // 增加推荐动态计数
  incrementFollowingCount: () => void; // 增加关注动态计数
}

// 定义存储在 localStorage 中的数据的类型
interface StoredNotificationStatus {
  latestFeedLastSeenId: number | null;
  followingFeedLastSeenId: number | null;
}

const POLLING_INTERVAL = 30000; // 30秒轮询一次

export const useNewDynamicsNotification = (): UseNewDynamicsNotificationReturn => {
  const { user, token } = useAuth(); // 直接使用 useAuth Hook 获取 user 和 token

  // 从 localStorage 初始化 lastSeenId，如果不存在则为 null
  const getInitialStoredStatus = (): StoredNotificationStatus => {
    const stored = localStorage.getItem('dynamicsNotificationStatus');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          latestFeedLastSeenId: parsed.latestFeedLastSeenId || null,
          followingFeedLastSeenId: parsed.followingFeedLastSeenId || null,
        };
      } catch (error) {
        console.error("Failed to parse dynamicsNotificationStatus from localStorage", error);
      }
    }
    return {
      latestFeedLastSeenId: null,
      followingFeedLastSeenId: null,
    };
  };

  const [latestFeedLastSeenId, setLatestFeedLastSeenId] = useState<number | null>(getInitialStoredStatus().latestFeedLastSeenId);
  const [followingFeedLastSeenId, setFollowingFeedLastSeenId] = useState<number | null>(getInitialStoredStatus().followingFeedLastSeenId);

  const [latestFeedNewCount, setLatestFeedNewCount] = useState<number>(0);
  const [followingFeedNewCount, setFollowingFeedNewCount] = useState<number>(0);

  const saveStatusToLocalStorage = useCallback(() => {
    const status: StoredNotificationStatus = {
      latestFeedLastSeenId,
      followingFeedLastSeenId,
    };
    localStorage.setItem('dynamicsNotificationStatus', JSON.stringify(status));
  }, [latestFeedLastSeenId, followingFeedLastSeenId]);

  useEffect(() => {
    saveStatusToLocalStorage();
  }, [saveStatusToLocalStorage]);


  const fetchCounts = useCallback(async () => {
    if (!user) { // 如果用户未登录，则不进行查询
      setLatestFeedNewCount(0);
      setFollowingFeedNewCount(0);
      return;
    }

    try {
      // 获取推荐动态新数量
      const latestParams: { since_id?: number } = {};
      if (latestFeedLastSeenId !== null) {
        latestParams.since_id = latestFeedLastSeenId;
      }
      const latestResponse = await axios.get(`${API_BASE_URL}/api/dynamics/feed/status`, {
        params: latestParams,
        // 推荐动态通常不需要token，如果API设计为公开，可以去掉headers
        // headers: token ? { Authorization: `Bearer ${token}` } : {}, 
      });
      if (latestResponse.data && typeof latestResponse.data.new_count === 'number') {
        setLatestFeedNewCount(latestResponse.data.new_count);
      }

      // 获取关注动态新数量 (需要token)
      if (token) {
        const followingParams: { since_id?: number } = {};
        if (followingFeedLastSeenId !== null) {
          followingParams.since_id = followingFeedLastSeenId;
        }
        const followingResponse = await axios.get(`${API_BASE_URL}/api/following/dynamics/status`, {
          params: followingParams,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (followingResponse.data && typeof followingResponse.data.new_count === 'number') {
          setFollowingFeedNewCount(followingResponse.data.new_count);
        }
      } else {
        setFollowingFeedNewCount(0); // 未登录则关注动态为0
      }
    } catch (error) {
      console.error('Error fetching new dynamics counts:', error);
      // 可以选择在这里设置 count 为 0 或保持不变，避免UI因错误跳动
    }
  }, [user, token, latestFeedLastSeenId, followingFeedLastSeenId]);

  // 定时轮询
  useEffect(() => {
    fetchCounts(); // 组件加载时立即获取一次
    const intervalId = setInterval(fetchCounts, POLLING_INTERVAL);
    return () => clearInterval(intervalId); // 组件卸载时清除定时器
  }, [fetchCounts]);

  // 更新已看到的最新动态ID (推荐)
  const updateLastSeenLatestFeedId = useCallback((latestId: number | null) => {
    console.log(`[useNewDynamicsNotification] 更新最新动态最后查看ID: ${latestId}, 之前的值: ${latestFeedLastSeenId}`);
    
    // 无论提供的latestId是什么，都将计数归零，确保红点消失
    setLatestFeedNewCount(0);
    
    // 只有当提供了有效的ID时才更新最后查看ID
    if (latestId !== null) {
      setLatestFeedLastSeenId(prev => {
        // 如果新ID大于之前保存的ID或者之前没有ID，则更新
        if (prev === null || latestId > prev) {
          return latestId;
        }
        return prev; // 否则保持不变
      });
    }
  }, [latestFeedLastSeenId]);

  // 更新已看到的最新动态ID (关注)
  const updateLastSeenFollowingFeedId = useCallback((latestId: number | null) => {
    console.log(`[useNewDynamicsNotification] 更新关注动态最后查看ID: ${latestId}, 之前的值: ${followingFeedLastSeenId}`);
    
    // 无论提供的latestId是什么，都将计数归零，确保红点消失
    setFollowingFeedNewCount(0);
    
    // 只有当提供了有效的ID时才更新最后查看ID
    if (latestId !== null) {
      setFollowingFeedLastSeenId(prev => {
        // 如果新ID大于之前保存的ID或者之前没有ID，则更新
        if (prev === null || latestId > prev) {
          return latestId;
        }
        return prev; // 否则保持不变
      });
    }
  }, [followingFeedLastSeenId]);
  
  // 手动触发一次刷新
  const forceRefreshCounts = useCallback(() => {
    console.log('[useNewDynamicsNotification] 强制刷新计数');
    // 先重置计数，确保红点立即消失
    setLatestFeedNewCount(0);
    setFollowingFeedNewCount(0);
    // 然后重新获取数据
    fetchCounts();
  }, [fetchCounts]);

  // 手动增加推荐动态计数
  const incrementLatestCount = useCallback(() => {
    console.log('[useNewDynamicsNotification] 手动增加推荐动态计数');
    setLatestFeedNewCount(prev => prev + 1);
  }, []);

  // 手动增加关注动态计数
  const incrementFollowingCount = useCallback(() => {
    console.log('[useNewDynamicsNotification] 手动增加关注动态计数');
    setFollowingFeedNewCount(prev => prev + 1);
  }, []);

  return {
    latestFeedNewCount,
    followingFeedNewCount,
    updateLastSeenLatestFeedId,
    updateLastSeenFollowingFeedId,
    forceRefreshCounts,
    incrementLatestCount,
    incrementFollowingCount,
  };
}; 