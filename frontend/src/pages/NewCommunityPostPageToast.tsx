import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import ToastEditorWrapper from '../components/ToastEditorWrapper';
import axios from 'axios';
import { useSidebar } from '../contexts/SidebarContext';
import { useQueryClient } from '@tanstack/react-query';

// Interface for Community data
interface Community {
    id: number;
    name: string;
    slug: string;
    description?: string;
    // Add other relevant fields if needed
}

const NewCommunityPostPageToast: React.FC = () => {
  const { community_slug } = useParams<{ community_slug: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [communityName, setCommunityName] = useState<string>(''); // State to hold community name
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isSidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  // 添加状态记录社区类型和ID
  const [communityType, setCommunityType] = useState<'topic' | 'relationship_topic' | null>(null);
  const [communityId, setCommunityId] = useState<number | null>(null);

  // Fetch community details based on slug
  useEffect(() => {
    const fetchCommunityDetails = async () => {
      // console.log('[Debug] community_slug from URL params:', community_slug);
      if (!community_slug) {
        // console.error('[Debug] community_slug is missing!');
        setError("无效的社区标识符");
        return;
      }
      try {
        // 首先尝试获取普通主题
        const topicResponse = await axios.get(`${API_BASE_URL}/api/slug/${community_slug}`);
        // 如果成功获取到主题数据
        if (topicResponse.data && topicResponse.data.name) {
          setCommunityName(topicResponse.data.name);
          setCommunityType('topic');
          setCommunityId(topicResponse.data.id);
          console.log('获取到主题数据:', topicResponse.data);
        }
      } catch (topicErr) {
        console.log('主题获取失败，尝试获取关系主题');
        // 如果普通主题获取失败，尝试关系主题
        try {
          const relationshipResponse = await axios.get(`${API_BASE_URL}/api/relationship-topics/slug/${community_slug}`);
          if (relationshipResponse.data && relationshipResponse.data.name) {
            setCommunityName(relationshipResponse.data.name);
            setCommunityType('relationship_topic');
            setCommunityId(relationshipResponse.data.id);
            console.log('获取到关系主题数据:', relationshipResponse.data);
          } else {
            setError("无法从服务器获取社区名称");
          }
        } catch (relationshipErr) {
          console.error("无法获取社区信息:", relationshipErr);
          setError("无法加载社区信息");
        }
      }
    };
    fetchCommunityDetails();
  }, [community_slug]);

  useEffect(() => {
    if (!token) {
      console.log("No token found, redirecting to login");
      navigate('/login', { state: { from: `/community/${community_slug}/new-post-toast` } });
    }
  }, [token, navigate, community_slug]);

  const handleEditorChange = (value: string) => {
    setContent(value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError('需要登录才能发帖。');
      return;
    }
    if (!community_slug) {
        setError('无效的社区标识。');
        return;
    }
    
    // 检查必要的社区信息
    if (!communityId || !communityType) {
      setError('无法确定社区信息，请刷新页面重试。');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    
    // 根据社区类型添加对应的参数
    if (communityType === 'topic') {
      formData.append('topic_id', communityId.toString());
    } else if (communityType === 'relationship_topic') {
      formData.append('relationship_topic_id', communityId.toString());
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/posts/`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          // Content-Type is set automatically for FormData by axios
        },
      });
      setSuccess('帖子创建成功!');
      setTitle('');
      setContent('');
      
      // --- 在导航前使缓存失效 ---
      const queryKey = communityType === 'topic' 
        ? ['topicPosts', community_slug] 
        : ['relationshipTopicPosts', community_slug]; // 假设关系社区的 key
      if (community_slug) {
          console.log(`[NewCommunityPostPageToast] Invalidating query cache for key:`, queryKey);
          await queryClient.invalidateQueries({ queryKey: queryKey });
      } else {
          console.warn('[NewCommunityPostPageToast] community_slug is undefined, cannot invalidate query cache.');
      }
      // ------------------------
      
      // 跳转到对应的社区主题页面
      if (communityType === 'topic') {
        navigate(`/community/topic/${community_slug}`);
      } else if (communityType === 'relationship_topic') {
        navigate(`/community/relationship-topic/${community_slug}`);
      } else {
        // 如果无法确定类型或 slug 丢失，回退到通用社区页
        navigate(community_slug ? `/community/${community_slug}` : '/community'); 
      }
    } catch (err: any) {
      console.error('Error creating post:', err.response?.data || err.message);
      setError(err.response?.data?.error || '创建帖子失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
      {/* 移除Navbar组件 */}
      <div className="flex flex-1 pt-12">
        {/* 移除SideNavbar组件 */}
        <main className={`flex-1 p-3 overflow-y-auto transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
          <h1 className="text-3xl font-bold mb-2 text-gray-100">在 "{communityName || community_slug}" 中创建新帖子</h1>
          {error && <div className="bg-red-700 text-white p-3 rounded mb-3">{error}</div>}
          {success && <div className="bg-green-700 text-white p-3 rounded mb-3">{success}</div>}

          <form onSubmit={handleSubmit} className="bg-gray-850/70 p-3 rounded-lg shadow-xl border border-gray-700 backdrop-blur-sm">
            <div>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                placeholder="帖子标题"
              />
            </div>

            <div className="my-4">
              <div className="rounded bg-white">
                <ToastEditorWrapper 
                  initialData={content}
                  onChange={handleEditorChange}
                  token={token}
                  placeholder="分享你的想法..."
                />
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={isLoading}
                className={`py-2 px-4 rounded font-medium ${
                  isLoading ? 'bg-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                } text-white`}
              >
                {isLoading ? '发布中...' : '发布帖子'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default NewCommunityPostPageToast; 