import React from 'react';

const PostDetailSkeleton: React.FC = () => {
  const skeletonStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '100vh',
    // 使用CSS变量保持统一背景
    backgroundColor: 'var(--bg-base-color)', 
    backgroundImage: 'var(--bg-gradient)',
    padding: '20px', // 可以根据实际详情页布局调整
    boxSizing: 'border-box',
    color: 'white', // 确保文本占位符（如果直接用文字）是可见的
  };

  const placeholderBaseStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // 半透明白色作为占位符背景
    borderRadius: '4px',
    marginBottom: '12px', // 统一间距
    animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', // 添加脉冲动画
  };
  
  // CSS for pulse animation (could also be in a global CSS file)
  // 将动画定义移到<style>标签中，以便在React组件中正确应用
  const keyframesStyle = `
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: .5;
      }
    }
  `;

  return (
    <>
      <style>{keyframesStyle}</style> {/* 内联动画定义 */}
      <div style={skeletonStyle} aria-busy="true" aria-live="polite" role="status" aria-label="正在加载帖子详情...">
        {/* 模拟帖子标题 */}
        <div style={{ ...placeholderBaseStyle, height: '36px', width: '75%', marginBottom: '24px' }}></div>
        
        {/* 模拟作者信息和日期 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ ...placeholderBaseStyle, width: '40px', height: '40px', borderRadius: '50%', marginRight: '12px' }}></div>
          <div>
            <div style={{ ...placeholderBaseStyle, height: '16px', width: '120px', marginBottom: '6px' }}></div>
            <div style={{ ...placeholderBaseStyle, height: '12px', width: '80px' }}></div>
          </div>
        </div>
        
        {/* 模拟帖子内容段落 */}
        <div style={{ ...placeholderBaseStyle, height: '20px', width: '100%' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '20px', width: '100%' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '20px', width: '90%' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '20px', width: '95%', marginBottom: '30px' }}></div>

        {/* 模拟评论区或相关内容区域的占位 */}
        <div style={{ ...placeholderBaseStyle, height: '28px', width: '40%', marginBottom: '16px' }}></div>
        <div style={{ ...placeholderBaseStyle, height: '60px', width: '100%' }}></div>
      </div>
    </>
  );
};

export default PostDetailSkeleton; 