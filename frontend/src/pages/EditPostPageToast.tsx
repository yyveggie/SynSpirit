import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import ToastEditorWrapper from '../components/ToastEditorWrapper';
// 已移除: import Navbar from "../components/Navbar";
import SideNavbar from '../components/SideNavbar';
import { useSidebar } from '../contexts/SidebarContext';
import { useQueryClient } from '@tanstack/react-query';

interface PostData {
    id: number;
    title: string;
    content: string;
    community_slug?: string; // Assuming posts might be associated with communities
    slug: string; // 确保包含slug属性
    // Add other fields as necessary, e.g., author, created_at
}

const EditPostPageToast: React.FC = () => {
    const { post_slug } = useParams<{ post_slug: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const queryClient = useQueryClient();

    const [post, setPost] = useState<PostData | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const { isSidebarOpen } = useSidebar();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!token) {
            navigate('/login', { state: { from: `/edit-post-toast/${post_slug}` } });
            return;
        }

        const fetchPost = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // 使用slug查询帖子，而不是通过ID
                const response = await axios.get<PostData>(`${API_BASE_URL}/api/posts/slug/${post_slug}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                
                // 后端API直接返回帖子数据，没有嵌套在"post"字段中
                const fetchedPost = response.data;
                setPost(fetchedPost);
                setTitle(fetchedPost.title);
                setContent(fetchedPost.content);
            } catch (err: any) {
                console.error("Error fetching post for editing:", err.response?.data || err.message);
                setError(err.response?.data?.error || '无法加载帖子数据进行编辑');
                // Optional: Navigate away if post not found or unauthorized
            } finally {
                setIsLoading(false);
            }
        };

        fetchPost();
    }, [post_slug, token, navigate]);

    const handleEditorChange = (value: string) => {
        setContent(value);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!post || !token) return;

        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            // 使用JSON格式而不是FormData
            const postData: {
                title: string;
                content: string;
            } = {
                title,
                content,
            };

            // 发送JSON格式的数据
            const response = await axios.put(`${API_BASE_URL}/api/posts/${post.id}`, postData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            setSuccess('帖子更新成功!');
            // Optionally update local state if needed, or rely on navigation
            setPost(response.data); // 更新本地状态
            
            // 使相关缓存失效，确保获取最新数据
            console.log(`[EditPostPageToast] 使帖子缓存失效: ${post.slug}`);
            queryClient.invalidateQueries({ queryKey: ['postDetails', post.slug] });
            
            // Navigate back to the post page after a short delay
            setTimeout(() => {
                if (post.community_slug) {
                    navigate(`/community/${post.community_slug}/post/${post.slug}`);
                } else {
                    // Fallback or navigate to a general posts list if no community
                    navigate(`/posts/${post.slug}`);
                }
            }, 1500);

        } catch (err: any) {
            console.error('Error updating post:', err.response?.data || err.message);
            setError(err.response?.data?.error || '更新帖子失败');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
                {/* 移除Navbar组件 */}
                <div className="flex flex-1 pt-16 overflow-hidden">
                    {/* 移除SideNavbar组件 */}
                    <main className={`flex-1 p-6 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
                        <div className="flex justify-center items-center h-full">
                            <p className="text-xl">正在加载帖子...</p>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    if (error && !post) {
        return (
            <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
                {/* 移除Navbar组件 */}
                <div className="flex flex-1 pt-16 overflow-hidden">
                    {/* 移除SideNavbar组件 */}
                    <main className={`flex-1 p-6 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
                        <div className="bg-red-700 text-white p-4 rounded shadow-lg text-center">
                            <p className="text-lg font-semibold">出错了</p>
                            <p>{error}</p>
                            <button 
                                onClick={() => navigate(-1)} 
                                className="mt-3 bg-white text-red-700 px-4 py-2 rounded"
                            >
                                返回
                            </button>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
            {/* 移除Navbar组件 */}
            <div className="flex flex-1 pt-16 overflow-hidden">
                {/* 移除SideNavbar组件 */}
                <main className={`flex-1 p-6 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
                    <h1 className="text-3xl font-bold mb-6">编辑帖子</h1>
                    
                    {error && <div className="bg-red-700 text-white p-3 rounded mb-4">{error}</div>}
                    {success && <div className="bg-green-700 text-white p-3 rounded mb-4">{success}</div>}
                    
                    <form onSubmit={handleSubmit} className="bg-gray-850/70 p-6 rounded-lg shadow-xl border border-gray-700">
                        <div className="mb-4">
                            <label htmlFor="title" className="block text-gray-200 mb-2">帖子标题</label>
                            <input
                                type="text"
                                id="title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="帖子标题"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-gray-200 mb-2">帖子内容</label>
                                <ToastEditorWrapper
                                    initialData={content}
                                    onChange={handleEditorChange}
                                    token={token}
                                placeholder="请输入帖子内容..."
                                />
                        </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
                            >
                            {isSaving ? '正在保存...' : '更新帖子'}
                            </button>
                    </form>
                </main>
            </div>
        </div>
    );
};

export default EditPostPageToast; 