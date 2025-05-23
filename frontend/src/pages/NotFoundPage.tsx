import React from 'react';
import { Link } from 'react-router-dom';
import { useSidebar } from '../contexts/SidebarContext';

const NotFoundPage: React.FC = () => {
  const { isSidebarOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col">
      {/* 移除Navbar组件 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 移除SideNavbar组件 */}
        <main className={`flex-1 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
          <div className="container mx-auto px-4 py-10 flex flex-col items-center justify-center h-full">
        <h1 className="text-9xl font-bold text-white mb-6">404</h1>
        <p className="text-2xl mb-8">页面未找到</p>
        <Link 
          to="/" 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          返回首页
        </Link>
          </div>
        </main>
      </div>
    </div>
  );
};

export default NotFoundPage; 