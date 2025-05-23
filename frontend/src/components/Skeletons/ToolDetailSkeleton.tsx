import React from 'react';

const ToolDetailSkeleton: React.FC = () => {
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
      <div style={skeletonStyle} aria-busy="true" aria-live="polite" role="status" aria-label="正在加载工具详情...">
        {/* 模拟工具名称 */}
        <div style={{ ...placeholderBaseStyle, height: '36px', width: '60%', marginBottom: '24px' }}></div>
        
        {/* 模拟工具分类和标签 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <div style={{ ...placeholderBaseStyle, height: '24px', width: '100px', borderRadius: '12px' }}></div>
          <div style={{ ...placeholderBaseStyle, height: '24px', width: '80px', borderRadius: '12px' }}></div>
        </div>
        
        {/* 模拟工具描述 */}
        <div style={{ ...placeholderBaseStyle, height: '18px', width: '100%', marginBottom: '8px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '18px', width: '90%', marginBottom: '24px' }}></div>

        {/* 模拟工具主操作区域/iframe占位 */}
        <div style={{ ...placeholderBaseStyle, height: '300px', width: '100%', marginBottom: '24px' }}></div>

        {/* 模拟其他信息或按钮 */}
        <div style={{ ...placeholderBaseStyle, height: '40px', width: '150px' }}></div>
      </div>
    </>
  );
};

export default ToolDetailSkeleton; 