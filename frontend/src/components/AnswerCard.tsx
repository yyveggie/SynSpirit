/**
 * 此文件定义了 AnswerCard 组件，用于展示对文章或问题的单个回答。
 *
 * 主要功能:
 * - 接收回答数据作为 props。
 * - 显示回答者的信息 (头像、昵称)。
 * - 显示回答内容 (通常是富文本)。
 * - 显示回答的发布时间或更新时间。
 * - 可能包含对回答进行点赞、评论等交互操作的功能。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState } from 'react';

// 修改 Answer 接口，移除 commentsCount，与 PostDetailPage 同步
interface Answer {
  id: number;
  author: { id: number; nickname: string; email: string; }; // 假设这里的 author 必传且结构固定
  content: string; 
  upvotes: number;
  // commentsCount: number; // 移除
  timestamp: string; // 假设这里接收的是处理过的字符串
}

interface AnswerCardProps {
  answer: Answer;
}

const AnswerCard: React.FC<AnswerCardProps> = ({ answer }) => {
  const [isExpanded, setIsExpanded] = useState(false); // 控制展开/折叠状态
  const MAX_HEIGHT_COLLAPSED = '150px'; // 折叠时的最大高度，可调整

  // 判断内容是否过长，需要一个更可靠的方法，例如比较渲染后的高度或字符数
  // 这里用一个简单的字符数判断作为示例
  const isLongContent = answer.content.length > 500; 

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="rounded-lg bg-black/10 backdrop-blur-lg border border-white/10 p-4 text-gray-200">
      {/* 回答者信息 */}
      <div className="flex items-center mb-3">
        {/* 可以添加头像 */} 
        <div className="w-8 h-8 rounded-full bg-white/10 mr-3"></div> 
        <div>
          <p className="text-sm font-semibold text-gray-100">{answer.author.nickname}</p>
          <p className="text-xs text-gray-400">发布于 {answer.timestamp}</p>
        </div>
      </div>

      {/* 回答内容区域 */} 
      <div 
        className={`prose prose-invert max-w-none overflow-hidden transition-all duration-300 ease-in-out ${isLongContent && !isExpanded ? 'relative' : ''}`}
        style={{
          maxHeight: isLongContent && !isExpanded ? MAX_HEIGHT_COLLAPSED : 'none'
        }}
      >
         {/* 渲染 HTML 内容 */}
        <div dangerouslySetInnerHTML={{ __html: answer.content }}></div>
        {/* 折叠时的渐变遮罩 */}
        {isLongContent && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-800/80 via-gray-800/50 to-transparent pointer-events-none"></div>
        )}
      </div>

      {/* 展开/折叠按钮 (如果内容过长) */} 
      {isLongContent && (
        <button 
          onClick={toggleExpand}
          className="text-blue-400 hover:text-blue-300 text-sm mt-2"
        >
          {isExpanded ? '收起' : '展开阅读全文'}
        </button>
      )}

      {/* 底部操作按钮 */} 
      <div className="flex items-center justify-start space-x-4 mt-4 pt-3 border-t border-white/10 text-sm text-gray-400">
        <button className="flex items-center space-x-1 hover:text-green-400 transition-colors">
           {/* 使用 SVG 或图标库 */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
          <span>赞同 {answer.upvotes}</span>
        </button>
        {/* 移除评论按钮或修改为其他交互 */}
        {/* 
        <button className="flex items-center space-x-1 ...">
          <svg ... />
          <span>{answer.commentsCount} 条评论</span> 
        </button>
        */}
         <button className="flex items-center space-x-1 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>评论</span>
        </button>
      </div>
    </div>
  );
};

export default AnswerCard; 