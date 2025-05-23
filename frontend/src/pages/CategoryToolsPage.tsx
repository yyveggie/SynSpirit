/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了展示特定分类下工具列表的 React 组件。
 *
 * 主要功能:
 * - 根据路由参数 (分类 id 或 slug) 获取并显示该分类下的工具列表。
 * - 可能显示分类的名称或描述。
 * - 提供到单个工具详情页的链接。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
// // 已移除: import Navbar from "../components/Navbar";
// import SideNavbar from '../components/SideNavbar';
import ToolCard from '../components/ToolCard';
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext';

interface Tool {
  id: number;
  name: string;
  description: string;
  category: string;
  rating: number;
  image_url?: string;
  tags?: string[];
  is_free?: boolean;
  slug?: string;
}

interface Category {
  id: number;
  name: string;
  description: string;
  icon: string;
}

const CategoryToolsPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const [tools, setTools] = useState<Tool[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('popularity');
  const { isSidebarOpen } = useSidebar();

  useEffect(() => {
    const fetchCategoryAndTools = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch category info
        const categoryResponse = await fetch(`${API_BASE_URL}/api/categories/${categoryId}`);
        if (!categoryResponse.ok) {
          throw new Error('Failed to fetch category info');
        }
        
        const categoryData = await categoryResponse.json();
        setCategory(categoryData);
        
        // 添加时间戳参数防止缓存
        const timestamp = new Date().getTime();
        const toolsResponse = await fetch(`${API_BASE_URL}/api/tools?category=${categoryId}&_=${timestamp}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!toolsResponse.ok) {
          throw new Error('Failed to fetch tools for category');
        }
        
        const toolsData = await toolsResponse.json();
        console.log("分类工具数据:", toolsData);
        
        if (toolsData && Array.isArray(toolsData.tools)) {
          setTools(toolsData.tools);
        } else {
          console.error("工具数据格式不正确:", toolsData);
          setError('工具数据格式不正确');
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCategoryAndTools();
  }, [categoryId]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col">
        {/* 移除Navbar组件 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 移除SideNavbar组件 */}
          <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
            <div className="container mx-auto px-4 py-12 flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  
  if (error || !category) {
    return (
      <div className="min-h-screen bg-transparent text-white flex flex-col">
        {/* 移除Navbar组件 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 移除SideNavbar组件 */}
          <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
            <div className="container mx-auto px-4 py-12 flex justify-center items-center h-full">
          <div className="max-w-xl mx-auto bg-white/10 backdrop-blur-sm rounded-lg p-6 shadow-lg">
            <h1 className="text-2xl font-bold mb-4 text-center">出错了</h1>
            <p className="text-center">{error || '找不到该分类'}</p>
            <div className="flex justify-center mt-6">
              <button 
                onClick={() => navigate('/tools')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                返回所有工具
              </button>
            </div>
          </div>
            </div>
          </main>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col">
      {/* 移除Navbar组件 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 移除SideNavbar组件 */}
        <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
          <div className="container mx-auto px-4 py-6">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4">{category.name}</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">{category.description}</p>
        </header>
        
        {tools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map(tool => (
              <div 
                key={tool.id}
                className="bg-white/10 backdrop-blur-sm rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                    onClick={() => navigate(`/tools/${tool.slug || tool.id}`)}
              >
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-2">{tool.name}</h2>
                      <p className="text-gray-300 mb-4 line-clamp-3">{tool.description}</p>
                  <div className="flex justify-end">
                    <div className="text-sm text-white/70 bg-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition-colors">
                      查看详情
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 text-center max-w-md mx-auto">
            <p className="text-xl mb-4">该分类下暂无工具</p>
            <button 
              onClick={() => navigate('/tools')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              浏览其他分类
            </button>
          </div>
        )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default CategoryToolsPage; 