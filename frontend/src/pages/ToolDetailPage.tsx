/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * @file ToolDetailPage.tsx
 * @description 显示单个工具的详细信息页面。
 *              使用 TanStack Query (通过自定义 Hook: useToolDetail) 
 *              进行数据获取和缓存管理。
 */
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
// 已移除: import Navbar from "../components/Navbar";
import SideNavbar from '../components/SideNavbar';
import Chatbot from '../components/Chatbot';
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext';
import { useToolDetail, ToolDetail } from '../hooks/useToolsQueries';
import { getCosImageUrl } from '../utils/imageUrl';
import ToolDetailSkeleton from '../components/Skeletons/ToolDetailSkeleton';
import { motion } from 'framer-motion';

const ToolDetailPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const { isSidebarOpen } = useSidebar();
    const [isChatOpen, setIsChatOpen] = useState(false);

    const { data: tool, isLoading, error: queryError } = useToolDetail(slug);
    
    const effectiveError = queryError ? queryError.message : null;

    // Helper to render markdown-like text (newlines to <br>, simple lists)
    const renderFormattedText = (text: string | null | undefined) => {
        if (!text) return null;
        // 将换行符替换为 <br>
        const lines = text.split('\n');
        return (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
                {lines.map((line, index) => (
                    <li key={index}>{line.trim()}</li>
                ))}
            </ul>
        );
    };

    // Helper to render markdown-like text (newlines to <br>, simple lists)
    const renderFormattedTextSmall = (text: string | null | undefined) => {
        if (!text) return null;
        // 将换行符替换为 <br>
        const lines = text.split('\n');
        return (
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-300">
                {lines.map((line, index) => (
                    <li key={index}>{line.trim()}</li>
                ))}
            </ul>
        );
    };

    if (isLoading) {
        return <ToolDetailSkeleton />;
    }

    if (effectiveError && !tool) {
        return (
          <div 
            className="flex flex-col items-center justify-center min-h-screen text-white p-4"
            style={{backgroundColor: 'var(--bg-base-color)', backgroundImage: 'var(--bg-gradient)'}}
          >
            <h2 className="text-2xl font-semibold mb-4">无法加载工具详情</h2>
            <p className="text-gray-400 mb-8">{effectiveError || '工具可能已被删除或链接无效。'}</p>
            <Link to="/tools" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors">
              返回所有工具
            </Link>
          </div>
        );
    }
    
    if (!tool) {
        return (
            <div 
              className="flex flex-col items-center justify-center min-h-screen text-white p-4"
              style={{backgroundColor: 'var(--bg-base-color)', backgroundImage: 'var(--bg-gradient)'}}
            >
              <h2 className="text-2xl font-semibold mb-4">未找到工具</h2>
              <p className="text-gray-400 mb-8">无法找到您请求的工具信息。</p>
              <Link to="/tools" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors">
                返回所有工具
              </Link>
            </div>
          );
    }

    return (
        <div className="flex flex-col min-h-screen text-white bg-transparent">
            <div className="flex flex-1 overflow-hidden">
              <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'} px-6 md:px-8 pb-24 pt-6`}>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="max-w-6xl mx-auto"
                >
                        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                           {tool.category && (
                                <span className="inline-block bg-indigo-500/30 text-indigo-200 px-3 py-1 rounded-full text-sm font-medium">
                                    {tool.category.name}
                                </span>
                            )}
                            {tool.tags && tool.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {tool.tags.map((tag) => (
                                        <span key={tag} className="bg-gray-600/50 text-gray-300 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <header className="mb-8 pb-5 border-b border-gray-700/40">
                            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{tool.name}</h1>
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
                                {tool.source_url && (
                                    <a href={tool.source_url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-300 transition-colors flex items-center">
                                        访问官网 
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /> </svg>
                                    </a>
                                )}
                                {tool.is_free && (
                                    <span className="text-green-400 font-medium">免费</span>
                                )}
                                <span>最后更新: {new Date(tool.updated_at).toLocaleDateString('zh-CN', { year:'numeric', month:'numeric', day:'numeric' })}</span>
                             </div>
                        </header>
                        
                        <div className="md:flex md:space-x-6 mb-6">
                            <div className="md:w-1/3 mb-6 md:mb-0">
                                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg p-6 md:p-8 h-full">
                                    <p className="text-base md:text-lg leading-relaxed text-gray-200 mb-8">{tool.description}</p>
                            {tool.screenshot_url && (
                                <img 
                                            src={getCosImageUrl(tool.screenshot_url) || undefined}
                                    alt={`${tool.name} screenshot`} 
                                            className="rounded-lg shadow-lg w-full max-h-[600px] object-contain border border-gray-700/50"
                                />
                            )}
                                </div>
                            </div>

                        {(tool.features || tool.use_cases || tool.pros || tool.cons || tool.pricing_info) && (
                                <div className="md:w-2/3">
                                    <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg p-6 md:p-8 h-full">
                                        <h2 className="text-xl md:text-2xl font-bold text-blue-300 pb-3 mb-5 border-b border-gray-700/40">详细信息</h2>
                                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                                    {tool.features && tool.features.length > 0 && (
                                        <div>
                                                    <h3 className="text-lg font-semibold mb-2 text-gray-200">主要功能</h3>
                                                    {renderFormattedTextSmall(tool.features.join('\n'))}
                                        </div>
                                    )}
                                    {tool.use_cases && tool.use_cases.length > 0 && (
                                        <div>
                                                    <h3 className="text-lg font-semibold mb-2 text-gray-200">使用场景</h3>
                                                    {renderFormattedTextSmall(tool.use_cases.join('\n'))}
                                        </div>
                                    )}
                                    {tool.pros && tool.pros.length > 0 && (
                                        <div>
                                                    <h3 className="text-lg font-semibold mb-2 text-gray-200">优点</h3>
                                                    {renderFormattedTextSmall(tool.pros.join('\n'))}
                                        </div>
                                    )}
                                    {tool.cons && tool.cons.length > 0 && (
                                        <div>
                                                    <h3 className="text-lg font-semibold mb-2 text-gray-200">缺点</h3>
                                                    {renderFormattedTextSmall(tool.cons.join('\n'))}
                                        </div>
                                    )}
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>

                        {tool.content && (
                            <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg p-6 md:p-8 mb-6">
                                <h2 className="text-2xl md:text-3xl font-bold text-blue-300 pb-4 mb-6 border-b border-gray-700/40">详细介绍</h2>
                                <div 
                                    className="prose prose-lg prose-invert max-w-none ck-content-output text-gray-300 prose-headings:font-bold prose-headings:text-white prose-a:text-blue-400 prose-strong:text-white mt-6"
                                    dangerouslySetInnerHTML={{ __html: tool.content }}
                                />
                            </section>
                        )}

                        {tool.installation_steps && (
                            <section className="bg-gray-800/50 backdrop-blur-sm rounded-lg shadow-lg p-6 md:p-8 mb-6">
                                <h2 className="text-2xl md:text-3xl font-bold text-blue-300 pb-4 mb-6 border-b border-gray-700/40">安装流程</h2>
                                <div className="prose prose-invert max-w-none text-gray-300 mt-6">
                                    {renderFormattedText(tool.installation_steps)}
                                </div>
                            </section>
                        )}
                </motion.div>

                <div className="fixed bottom-6 right-6 z-50">
            <button
                        onClick={() => setIsChatOpen(!isChatOpen)} 
                        className="bg-white/20 backdrop-blur-md text-white rounded-full p-3 shadow-lg z-50 transition-colors hover:bg-white/30"
                        title="AI助手"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </button>
                    {isChatOpen && tool && (
                        <Chatbot 
                            isOpen={isChatOpen}
                            toolName={tool.name} 
                            toolDescription={tool.description} 
                            onClose={() => setIsChatOpen(false)} 
                        />
                    )}
                 </div>
              </main>
            </div>
        </div>
    );
};

export default ToolDetailPage;
