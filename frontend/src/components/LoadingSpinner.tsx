/**
 * LoadingSpinner.tsx
 * 
 * 这个组件提供一个通用的加载动画指示器
 */
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  color = 'text-blue-400',
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };
  
  const spinnerClass = `animate-spin rounded-full ${sizeClasses[size]} ${color} border-t-transparent ${className}`;
  
  return (
    <div className="flex justify-center items-center">
      <div className={spinnerClass}></div>
    </div>
  );
};

export default LoadingSpinner; 