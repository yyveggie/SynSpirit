/**
 * @file ToolsPage.tsx
 * @description 工具展示页面，允许用户浏览、按分类和标签筛选工具。
 *              使用 TanStack Query (通过自定义 Hooks: useCategories, useTags, useTools) 
 *              进行数据获取和缓存管理。
 */
import React, { useState } from 'react'; // 移除 useEffect
// 移除 Navbar 和 SideNavbar 的导入
// // 已移除: import Navbar from "../components/Navbar";
// import SideNavbar from '../components/SideNavbar';
import { Link, useNavigate } from 'react-router-dom';
import Chatbot from '../components/Chatbot';
import { useSidebar } from '../contexts/SidebarContext'; // 引入 useSidebar
// 导入自定义 Hooks 和类型
import { useCategories, useTags, useTools, Tool, Category } from '../hooks/useToolsQueries';

// 移除接口定义，因为它们从 Hook 文件导入
/*
interface Tool { ... }
interface Category { ... }
*/

// 移除分页常量，因为当前 Hook 未实现分页
// const TOOLS_PER_PAGE = 20;

const ToolsPage: React.FC = () => {
    // 移除数据状态: tools, categories, allTags, isLoading, error
    // const [tools, setTools] = useState<Tool[]>([]);
    // const [categories, setCategories] = useState<Category[]>([]);
    // const [allTags, setAllTags] = useState<string[]>([]);
    // const [isLoading, setIsLoading] = useState<boolean>(true);
    // const [error, setError] = useState<string | null>(null);
    
    const { isSidebarOpen } = useSidebar(); // 使用 Context
    // 保留筛选状态
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
    const [selectedTag, setSelectedTag] = useState<string | 'all'>('all');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const navigate = useNavigate();

    // --- 使用 TanStack Query Hooks 获取数据 --- 
    const { data: categories = [], isLoading: isLoadingCategories, error: errorCategories } = useCategories();
    const { data: allTags = [], isLoading: isLoadingTags, error: errorTags } = useTags();
    const { data: tools = [], isLoading: isLoadingTools, error: errorTools } = useTools(selectedCategory, selectedTag);

    // 合并加载状态和错误状态 (简化处理)
    const isLoading = isLoadingCategories || isLoadingTags || isLoadingTools;
    // 优先显示更具体的错误
    const error = errorTools?.message ?? errorTags?.message ?? errorCategories?.message ?? null;

    // 移除 useEffect 数据获取逻辑
    /*
    useEffect(() => {
        const fetchData = async () => {
           // ... (旧逻辑已移除) ...
        };
        fetchData();
    }, [selectedCategory, selectedTag, categories.length, allTags.length]);
    */

    // 处理分类点击 (保持不变，但不再需要手动触发 fetch)
    const handleCategoryClick = (categoryId: number | 'all') => {
        setSelectedCategory(categoryId);
        setSelectedTag('all'); // 重置标签选择
    };

    // 处理标签点击 (保持不变，但不再需要手动触发 fetch)
    const handleTagClick = (tag: string | 'all') => {
        setSelectedTag(tag);
        setSelectedCategory('all'); // 重置分类选择
    };

    // 处理工具卡片点击 (保持不变)
    const handleToolClick = (slug: string) => {
        navigate(`/tools/${slug}`);
    };

    return (
        <div className="min-h-screen flex flex-col bg-transparent text-white">
            {/* 移除 Navbar */}
            
            <div className="flex flex-1 overflow-hidden"> 
              {/* 移除 SideNavbar */}
              
              <main className={`flex-grow overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'} pt-4`}> 
                 <div className="container mx-auto px-4 pb-4"> 
                    {/* 分类按钮区域 - 使用 Hook 返回的 categories */}
                    {/* 添加 categories 加载和错误处理 */} 
                    {isLoadingCategories ? (
                        <div className="mb-6 text-gray-400">加载分类中...</div>
                    ) : errorCategories ? (
                        <div className="mb-6 text-red-400">加载分类失败: {errorCategories.message}</div>
                    ) : (
                    <div className="mb-6 flex flex-wrap gap-2">
                        <button
                            onClick={() => handleCategoryClick('all')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${ 
                                selectedCategory === 'all' && selectedTag === 'all'
                                ? 'bg-indigo-600 text-white shadow-md' 
                                : 'bg-gray-700/50 hover:bg-gray-600/80 text-gray-200'
                            }`}
                        >
                            全部
                        </button>
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                onClick={() => handleCategoryClick(category.id)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${ 
                                    selectedCategory === category.id && selectedTag === 'all'
                                    ? 'bg-indigo-600 text-white shadow-md' 
                                    : 'bg-gray-700/50 hover:bg-gray-600/80 text-gray-200'
                                }`}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                    )}

                    {/* 标签按钮区域 - 使用 Hook 返回的 allTags */}
                    {/* 添加 allTags 加载和错误处理 */} 
                    {isLoadingTags ? (
                        <div className="mb-8 text-gray-400">加载标签中...</div>
                    ) : errorTags ? (
                         <div className="mb-8 text-red-400">加载标签失败: {errorTags.message}</div>
                    ) : allTags.length > 0 && (
                        <div className="mb-8 flex flex-wrap gap-2">
                            <button
                                onClick={() => handleTagClick('all')}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${ 
                                    selectedTag === 'all'
                                    ? 'bg-teal-600 text-white shadow' 
                                    : 'bg-gray-600/60 hover:bg-gray-500/80 text-gray-300'
                                }`}
                            >
                                # 所有标签
                            </button>
                            {allTags.map((tag) => (
                                <button
                                    key={tag} 
                                    onClick={() => handleTagClick(tag)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${ 
                                        selectedTag === tag 
                                        ? 'bg-teal-600 text-white shadow' 
                                        : 'bg-gray-600/60 hover:bg-gray-500/80 text-gray-300'
                                    }`}
                                >
                                    # {tag}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 工具列表区域 - 使用合并的 isLoading 和 error */} 
                    {isLoading && (
                        <div className="flex justify-center items-center h-screen" style={{
                          backgroundColor: 'var(--bg-base-color)',
                          backgroundImage: 'var(--bg-gradient)',
                          width: '100%',
                          height: '100vh',
                        }}>
                          <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                    )}

                    {/* 显示合并后的错误 */} 
                    {error && !isLoading && (
                        <div className="text-center py-10 bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded relative" role="alert">
                            <strong className="font-bold">出错啦！</strong>
                            <span className="block sm:inline"> {error}</span>
                        </div>
                    )}

                    {/* 使用 Hook 返回的 tools */} 
                    {!isLoading && !error && tools.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-gray-400">暂时还没有工具哦。</p>
                        </div>
                    )}

                    {!isLoading && !error && tools.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                            {tools.map((tool) => (
                                <div 
                                    key={tool.id} 
                                    onClick={() => handleToolClick(tool.slug)}
                                    className="cursor-pointer bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-4 hover:bg-white/20 transition-colors duration-200 shadow-sm hover:shadow-md"
                                >
                                    <h3 className="text-base font-semibold text-white mb-1 truncate" title={tool.name}>{tool.name}</h3>
                                    <p className="text-xs text-gray-300 line-clamp-2" title={tool.description}>{tool.description}</p>
                                     {tool.tags && tool.tags.length > 0 && (
                                         <div className="mt-2 flex flex-wrap gap-1">
                                             {tool.tags.slice(0, 3).map(tag => (
                                                 <span key={tag} className="text-xs bg-teal-600/70 text-teal-100 px-1.5 py-0.5 rounded-full">
                                                     # {tag}
                                                 </span>
                                             ))}
                                         </div>
                                     )}
                                </div>
                            ))}
                        </div>
                    )}
                 </div>
              </main>
            </div>

            <Chatbot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
};

export default ToolsPage; 