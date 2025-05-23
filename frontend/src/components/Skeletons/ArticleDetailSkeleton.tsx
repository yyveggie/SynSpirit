import React from 'react';

const ArticleDetailSkeleton: React.FC = () => {
  const skeletonStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: 'var(--bg-base-color)', 
    backgroundImage: 'var(--bg-gradient)',
    padding: '20px', 
    boxSizing: 'border-box',
    color: 'white',
  };

  const placeholderBaseStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    marginBottom: '12px',
    animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  };
  
  const keyframesStyle = `
    @keyframes pulse {
      0%, 100% {
        opacity: 0.6;
      }
      50% {
        opacity: 0.3;
      }
    }
  `;

  return (
    <>
      <style>{keyframesStyle}</style>
      <div style={skeletonStyle} aria-busy="true" aria-live="polite" role="status" aria-label="正在加载文章详情...">
        {/* 模拟文章大标题 */}
        <div style={{ ...placeholderBaseStyle, height: '40px', width: '80%', marginBottom: '28px' }}></div>
        
        {/* 模拟作者信息区域 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
          <div style={{ ...placeholderBaseStyle, width: '48px', height: '48px', borderRadius: '50%', marginRight: '16px' }}></div>
          <div>
            <div style={{ ...placeholderBaseStyle, height: '18px', width: '150px', marginBottom: '8px' }}></div>
            <div style={{ ...placeholderBaseStyle, height: '14px', width: '100px' }}></div>
          </div>
        </div>
        
        {/* 模拟文章内容段落 */}
        <div style={{ ...placeholderBaseStyle, height: '22px', width: '100%', marginBottom: '16px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '22px', width: '100%', marginBottom: '16px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '22px', width: '90%', marginBottom: '16px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '22px', width: '95%', marginBottom: '30px' }}></div>

        {/* 模拟图片或代码块占位 */}
        <div style={{ ...placeholderBaseStyle, height: '180px', width: '100%', marginBottom: '30px' }}></div>

        <div style={{ ...placeholderBaseStyle, height: '22px', width: '100%', marginBottom: '16px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '22px', width: '85%', marginBottom: '16px' }}></div>
      </div>
    </>
  );
};

export default ArticleDetailSkeleton; 