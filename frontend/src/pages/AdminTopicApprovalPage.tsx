import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { Link, Navigate } from 'react-router-dom';

interface Topic {
  id: number;
  name: string;
  description: string | null;
  slug: string | null;
  status: string;
  created_at: string;
  style?: any; // Assuming style might be included
  // Add other relevant topic fields if needed
}

const AdminTopicApprovalPage: React.FC = () => {
  const { user, token, isLoading: authLoading } = useAuth();
  const [pendingTopics, setPendingTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slugInput, setSlugInput] = useState<{ [key: number]: string }>({});
  const [actionError, setActionError] = useState<{ [key: number]: string | null }>({});

  const fetchPendingTopics = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get<Topic[]>(`${API_BASE_URL}/api/admin/topics/pending`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setPendingTopics(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '获取待审批主题失败');
    }
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    if (!authLoading && token) {
      if (user?.is_admin) {
        fetchPendingTopics();
      }
    }
  }, [authLoading, token, user, fetchPendingTopics]);

  const handleSlugChange = (topicId: number, value: string) => {
    setSlugInput(prev => ({ ...prev, [topicId]: value }));
  };

  const handleApprove = async (topicId: number) => {
    if (!token) return;
    const slugToSet = slugInput[topicId];
    if (!slugToSet || !slugToSet.trim()) {
      setActionError(prev => ({ ...prev, [topicId]: 'Slug 不能为空' }));
      return;
    }
    setActionError(prev => ({ ...prev, [topicId]: null }));

    try {
      await axios.post(`${API_BASE_URL}/api/admin/topics/${topicId}/approve`, 
        { slug: slugToSet.trim() }, 
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      // Refresh the list after approval
      fetchPendingTopics();
      setSlugInput(prev => ({ ...prev, [topicId]: '' })); // Clear input
    } catch (err: any) {
      setActionError(prev => ({ ...prev, [topicId]: err.response?.data?.error || '批准失败' }));
    }
  };

  const handleReject = async (topicId: number) => {
    if (!token) return;
    setActionError(prev => ({ ...prev, [topicId]: null }));
    try {
      await axios.post(`${API_BASE_URL}/api/admin/topics/${topicId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Refresh the list after rejection
      fetchPendingTopics();
    } catch (err: any) {
      setActionError(prev => ({ ...prev, [topicId]: err.response?.data?.error || '拒绝失败' }));
    }
  };

  if (authLoading) {
    return <div className="p-4">正在加载认证信息...</div>;
  }

  if (!user?.is_admin) {
    // If user is not an admin, redirect or show an unauthorized message.
    // For simplicity, redirecting to home. You might want a specific "Unauthorized" page.
    return <Navigate to="/" replace />;
  }

  if (isLoading && pendingTopics.length === 0) {
    return <div className="p-4">正在加载待审批主题...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">错误: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">管理员 - 主题审批</h1>
      
      {pendingTopics.length === 0 && !isLoading ? (
        <p className="text-gray-600 dark:text-gray-400">目前没有待审批的主题。</p>
      ) : (
        <div className="space-y-4">
          {pendingTopics.map((topic) => (
            <div key={topic.id} className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 md:p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-indigo-600 dark:text-indigo-400 mb-2">{topic.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">提交于: {new Date(topic.created_at).toLocaleString()}</p>
              {topic.description && <p className="text-gray-700 dark:text-gray-300 mb-3">描述: {topic.description}</p>}
              
              <div className="mt-4 space-y-3 md:space-y-0 md:flex md:items-center md:space-x-3">
                <div className="flex-grow">
                  <input 
                    type="text"
                    value={slugInput[topic.id] || ''}
                    onChange={(e) => handleSlugChange(topic.id, e.target.value)}
                    placeholder="输入 slug (例如: health-tips)"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>
                <button 
                  onClick={() => handleApprove(topic.id)}
                  className="w-full md:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75"
                >
                  批准
                </button>
                <button 
                  onClick={() => handleReject(topic.id)}
                  className="w-full md:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75"
                >
                  拒绝
                </button>
              </div>
              {actionError[topic.id] && <p className="text-red-500 text-sm mt-2">操作错误: {actionError[topic.id]}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminTopicApprovalPage; 