import React from 'react';

const ArticleCardSkeleton: React.FC = () => {
  const placeholderBaseStyle: React.CSSProperties = {
    backgroundColor: 'rgba(50, 50, 90, 0.3)', // 稍亮的深色占位符
    borderRadius: '4px',
    animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  };
  
  const cardStyle: React.CSSProperties = {
    padding: '16px', // p-4
    borderRadius: '8px', // rounded-lg
    border: '1px solid rgba(90, 90, 130, 0.3)', // 调整边框颜色以匹配
    backgroundColor: 'rgba(30, 30, 70, 0.2)', // 更深的卡片背景色
    marginBottom: '8px', // gap-2 from HomeContent grid
  };
  
  const keyframesStyle = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: .5; }
    }
  `;

  return (
    <>
      <style>{keyframesStyle}</style>
      <div style={cardStyle} aria-busy="true" aria-live="polite" role="status" aria-label="正在加载文章卡片...">
        {/* 模拟标题 */}
        <div style={{ ...placeholderBaseStyle, height: '20px', width: '70%', marginBottom: '8px' }}></div>
        {/* 模拟作者/日期 (可选) */}
        <div style={{ ...placeholderBaseStyle, height: '14px', width: '40%', marginBottom: '12px' }}></div>
        {/* 模拟摘要 */}
        <div style={{ ...placeholderBaseStyle, height: '16px', width: '100%', marginBottom: '6px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '16px', width: '90%', marginBottom: '12px' }}></div>
        {/* 模拟标签 (可选) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ ...placeholderBaseStyle, height: '20px', width: '50px', borderRadius: '9999px' }}></div>
          <div style={{ ...placeholderBaseStyle, height: '20px', width: '60px', borderRadius: '9999px' }}></div>
        </div>
      </div>
    </>
  );
};

export default ArticleCardSkeleton; 