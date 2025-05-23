/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了用于生成工具描述的页面 React 组件。
 *
 * 主要功能:
 * - 提供输入框让用户输入工具的源 URL。
 * - 调用后端 API (`/generate-description`) 来触发 AI 生成工具描述。
 * - 显示生成的描述结果。
 * - 可能用于后台管理或内部工具。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
// 已移除: import Navbar from "../components/Navbar";
import Chatbot from '../components/Chatbot';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext';

// 工具类型定义
interface Tool {
  id: number;
  name: string;
  description: string;
  category_id: number;
}

interface FormData {
  name: string;
  description: string;
  category: string;
  features: string;
  source: string;
  website: string;
}

interface Message {
  type: 'success' | 'error';
  text: string;
}

const ToolGeneratorPage: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    category: '',
    features: '',
    source: '',
    website: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const { isSidebarOpen } = useSidebar();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [featuredTools, setFeaturedTools] = useState<Tool[]>([]);

  // 加载热门工具
  useEffect(() => {
    const loadFeaturedTools = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/tools?limit=6&sort_by=popularity&sort_order=desc`);
        if (response.ok) {
          const data = await response.json();
          setFeaturedTools(data.tools || []);
        }
      } catch (error) {
        console.error('加载热门工具失败:', error);
      }
    };

    loadFeaturedTools();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    
    // 这里应该有实际的API调用，现在只是模拟
    setTimeout(() => {
      setIsSubmitting(false);
      setMessage({
        text: '工具创建成功！',
        type: 'success'
      });
      
      // 重置表单
      setFormData({
        name: '',
        description: '',
        category: '',
        features: '',
        source: '',
        website: ''
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-transparent text-white">
      {/* 移除Navbar组件 */}
      
      {/* 添加聊天助手 */}
      <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      
      {/* 右下角的聊天助手按钮 */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="fixed right-6 bottom-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg z-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* 左侧导航栏 */} 
      <aside 
        className={`w-48 flex-shrink-0 fixed top-24 left-0 bottom-0
                  transition-transform duration-500 ease-out z-20 
                  ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} 
      >
        <div className="h-full overflow-y-auto px-4">
          {/* 导航部分 */} 
          <div className="mb-10"> 
            <nav className="space-y-2">
              <Link to="/" className="flex items-center py-1.5 px-2 rounded text-gray-200 hover:text-white hover:bg-white/10 transition-all duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                首页
              </Link>
              <Link to="/articles" className="flex items-center py-1.5 px-2 rounded text-gray-200 hover:text-white hover:bg-white/10 transition-all duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                文章
              </Link>
              <Link to="/tools" className="flex items-center py-1.5 px-2 rounded font-semibold text-white hover:text-gray-200 transition-colors duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                工具
              </Link>
              <Link to="/chat" className="flex items-center py-1.5 px-2 rounded text-gray-200 hover:text-white hover:bg-white/10 transition-all duration-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                AI 聊天
              </Link>
            </nav>
          </div>
          
          {/* 热门工具部分 */} 
          <div>
            <div className="flex items-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14.05 1.5 17 3 17.657 6c.657 3 .168 6.578-1.68 8.422a11.92 11.92 0 01-1.68 1.68 11.92 11.92 0 01-1.68 1.68A8 8 0 0117.657 18.657z" /></svg>
              <h2 className="text-lg font-serif font-semibold text-white">热门工具</h2>
            </div>
            <ul className="space-y-2 pl-[calc(1.25rem+0.75rem)]">
              {featuredTools && featuredTools.slice(0, 3).map(tool => (
                <li key={tool.id}>
                  <Link 
                    to={`/tool/${tool.id}`}
                    className="block w-full text-left text-gray-300 hover:text-white hover:font-semibold transition-all duration-200 py-0.5"
                  >
                    <span className="text-sm">{tool.name}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link 
                  to="/tools"
                  className="block w-full text-left text-gray-400 hover:text-white transition-all duration-200 py-0.5 mt-1"
                >
                  <span className="text-xs font-medium">查看全部 →</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </aside>
      
      <div className={`container mx-auto px-6 py-12 transition-all duration-500 ease-out ${isSidebarOpen ? 'md:ml-48' : 'ml-0'}`}>
        <div className="max-w-3xl mx-auto bg-white/10 backdrop-blur-sm rounded-lg shadow-md overflow-hidden">
          <div className="p-6 bg-indigo-600 text-white">
            <h1 className="text-2xl font-bold">所有工具</h1>
            <p className="mt-2 text-indigo-100">填写以下信息添加一个新的AI工具</p>
          </div>
          
          <div className="p-6">
            {message && (
              <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-100' : 'bg-red-500/20 text-red-100'}`}>
                {message.text}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="text-white">
              <div className="mb-4">
                <label htmlFor="name" className="block text-white font-medium mb-2">工具名称</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="description" className="block text-white font-medium mb-2">工具描述</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows={4}
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                ></textarea>
              </div>
              
              <div className="mb-4">
                <label htmlFor="category" className="block text-white font-medium mb-2">分类</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                >
                  <option value="">选择分类</option>
                  <option value="文本生成">文本生成</option>
                  <option value="图像处理">图像处理</option>
                  <option value="音频处理">音频处理</option>
                  <option value="视频编辑">视频编辑</option>
                  <option value="代码辅助">代码辅助</option>
                </select>
              </div>
              
              <div className="mb-4">
                <label htmlFor="features" className="block text-white font-medium mb-2">主要功能 (用逗号分隔)</label>
                <input
                  type="text"
                  id="features"
                  name="features"
                  value={formData.features}
                  onChange={handleChange}
                  required
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>
              
              <div className="mb-4">
                <label htmlFor="source" className="block text-white font-medium mb-2">来源</label>
                <input
                  type="text"
                  id="source"
                  name="source"
                  value={formData.source}
                  onChange={handleChange}
                  required
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>
              
              <div className="mb-6">
                <label htmlFor="website" className="block text-white font-medium mb-2">官方网站</label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  required
                  className="w-full border border-white/30 bg-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold transition-colors ${isSubmitting ? 'bg-indigo-400 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
              >
                {isSubmitting ? '提交中...' : '创建工具'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolGeneratorPage;
