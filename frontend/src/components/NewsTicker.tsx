/**
 * 此文件定义了 NewsTicker 组件，用于以跑马灯或滚动条的形式展示新闻标题。
 *
 * 主要功能:
 * - 获取最新的新闻数据 (可能来自 API)。
 * - 以水平滚动的方式循环展示新闻标题。
 * - 每个标题通常链接到新闻来源或详情页。
 * - 可能包含发布时间等简要信息。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import Marquee from "react-fast-marquee"; // 导入 Marquee 组件

// 静态消息数据
const mockNews = [
  "💡 AI 驱动生成与发布，持续学习迭代中。",
  "🚀 Midjourney V6 现已发布，图像生成效果显著提升。",
  "📄 最新研究：大型语言模型的伦理挑战分析。",
  "🔧 Perplexity AI 成为研究人员的新宠。",
  "🎬 Runway Gen-3 视频生成技术取得新突破。",
  "🤖 GPT-4 Turbo 模型能力进一步增强。",
];

const NewsTicker: React.FC = () => {
  return (
    // 添加外层容器实现背景和布局
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg shadow-md overflow-hidden h-10 flex items-center"> {/* 设置高度并垂直居中 */}
      {/* Marquee 组件本身不需要背景 */}
      <Marquee 
        gradient={false} 
        speed={40} 
        className="text-sm"
      >
        {mockNews.map((item, index) => (
          <span key={index} className="mx-4 text-gray-200 hover:text-white transition-colors duration-200">
            {item}
          </span>
        ))}
        <span className="mx-4">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> 
      </Marquee>
    </div>
  );
};

export default NewsTicker; 