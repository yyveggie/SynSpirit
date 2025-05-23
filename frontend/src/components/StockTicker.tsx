/**
 * 此文件定义了 StockTicker 组件，用于以跑马灯或滚动条的形式展示股票信息。
 *
 * 主要功能:
 * - 获取股票市场数据 (可能来自 API)。
 * - 以水平滚动的方式循环展示股票代码、价格、涨跌幅等信息。
 * - 根据涨跌情况可能显示不同的颜色 (红/绿)。
 * - 可能链接到股票详情页或财经网站。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import Marquee from "react-fast-marquee";

// 模拟股价数据
const mockStocks = [
  "AAPL 175.20 ▲ 1.5%",
  "GOOGL 2800.50 ▼ 0.8%",
  "MSFT 340.80 ▲ 0.9%",
  "AMZN 140.10 ▼ 1.2%",
  "TSLA 250.60 ▲ 2.1%",
  "NVDA 480.00 ▲ 3.5%",
];

const StockTicker: React.FC = () => {
  return (
    // 使用与 NewsTicker 相同的毛玻璃背景和布局
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg shadow-md overflow-hidden h-10 flex items-center"> 
      <Marquee 
        gradient={false} 
        speed={50} // 可以调整速度
        className="text-sm" 
        pauseOnHover={true} // 添加悬停暂停
      >
        {mockStocks.map((item, index) => (
          // 可以为不同的涨跌添加不同颜色
          <span 
            key={index} 
            className={`mx-4 ${item.includes('▲') ? 'text-green-400' : item.includes('▼') ? 'text-red-400' : 'text-gray-300'} hover:text-white transition-colors duration-200 whitespace-nowrap`}
          >
            {item}
          </span>
        ))}
        <span className="mx-4">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> 
      </Marquee>
    </div>
  );
};

export default StockTicker; 