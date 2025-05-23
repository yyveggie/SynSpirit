/**
 * @file DynamicDetailPage.tsx
 * @description 动态详情页，用于直接通过URL访问特定动态
 * 支持通过URL参数获取动态ID，并展示该动态的完整详情
 * 复用TimelineProvider中的组件，确保视觉体验一致性
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTimeline } from '../contexts/TimelineContext';
import { DynamicItem } from '../components/DynamicFeed';
import { Spin } from 'antd';

const DynamicDetailPage: React.FC = () => {
  const { actionId } = useParams<{ actionId: string }>();
  const navigate = useNavigate();
  const { openTimeline } = useTimeline();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 当页面加载时获取动态详情
    const fetchDynamicDetail = async () => {
      if (!actionId) {
        setError('动态ID不存在');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await axios.get(`/api/dynamics/${actionId}`);
        if (response.data && response.data.action) {
          // 使用Timeline Context打开动态详情
          openTimeline(response.data.action as DynamicItem);
          setLoading(false);
        } else {
          setError('未找到该动态');
          setLoading(false);
        }
      } catch (err) {
        console.error('获取动态详情失败:', err);
        setError('加载动态详情失败');
        setLoading(false);
      }
    };

    fetchDynamicDetail();
  }, [actionId, openTimeline]);

  // 这个组件实际上不需要渲染任何内容
  // 它只负责获取动态并触发Timeline打开
  return (
    <div className="h-screen flex items-center justify-center">
      {loading ? (
        <Spin size="large" tip="加载动态中..." />
      ) : error ? (
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => navigate('/')}
          >
            返回主页
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default DynamicDetailPage; 