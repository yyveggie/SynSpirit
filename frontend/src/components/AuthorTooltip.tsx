import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion'; // 导入动画组件
import { API_BASE_URL } from '../config';
import { getCosImageUrl } from '../utils/imageUrl'; // 导入重命名后的函数

interface AuthorTooltipProps {
  nickname: string;
  bio?: string | null;
  tags?: string[] | null;
  isVisible: boolean;
  avatar?: string | null; // 添加头像属性
}

const AuthorTooltip: React.FC<AuthorTooltipProps> = ({ nickname, bio, tags, isVisible, avatar }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  
  // 初始化Portal节点
  useEffect(() => {
    // 获取或创建Portal容器
    let node = document.getElementById('tooltip-portal');
    if (!node) {
      node = document.createElement('div');
      node.id = 'tooltip-portal';
      document.body.appendChild(node);
    }
    setPortalNode(node);
    
    // 组件卸载时清理
    return () => {
      // 不移除节点，因为其他工具提示可能还在使用
    };
  }, []);
  
  // 计算位置
  useEffect(() => {
    if (isVisible) {
      const handleMouseMove = (e: MouseEvent) => {
        // 设置位置为鼠标当前位置上方
        setPosition({
          left: e.clientX - 125, // 水平方向居中
          top: Math.max(10, e.clientY - 150) // 垂直方向在鼠标上方，至少距离顶部10px
        });
      };
      
      // 监听鼠标移动事件
      document.addEventListener('mousemove', handleMouseMove);
      
      // 初始化位置（如果有）
      if (window.event instanceof MouseEvent) {
        handleMouseMove(window.event);
      }
      
      // 清理函数
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [isVisible, nickname, bio, tags, avatar]);
  
  if (!portalNode) return null;
  
  // 处理avatar URL
  const avatarUrl = avatar ? getCosImageUrl(avatar) : null; // 使用重命名后的函数
  
  // 使用Portal渲染工具提示到body
  return ReactDOM.createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed z-[9999] bg-gray-800/50 backdrop-blur-md rounded-md shadow-lg p-4 min-w-[250px] max-w-[350px] text-sm"
          style={{ 
            top: `${position.top}px`, 
            left: `${position.left}px`,
            pointerEvents: 'none' // 确保鼠标事件穿透工具提示
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <div className="absolute -bottom-2 left-[calc(50%-4px)] w-4 h-4 bg-gray-800/50 backdrop-blur-md transform rotate-45"></div>
          
          <div className="flex items-center gap-3 mb-2">
            {/* 头像显示 */}
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt={nickname} 
                  className="w-full h-full object-cover" 
                  onError={(e) => {
                    console.log('头像加载失败:', avatarUrl);
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nickname)}&background=334155&color=fff`;
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-700 text-gray-200 text-sm">
                  {nickname.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <h4 className="text-blue-400 font-semibold">{nickname}</h4>
          </div>
          
          {bio ? <p className="text-gray-300 mb-2">{bio}</p> : <p className="text-gray-300 mb-2">这个作者很懒，还没有填写个人简介</p>}
          {tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag, index) => (
                <span key={index} className="bg-blue-900/40 text-blue-200 px-1.5 py-0.5 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-xs">暂无标签</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    portalNode
  );
};

export default AuthorTooltip; 