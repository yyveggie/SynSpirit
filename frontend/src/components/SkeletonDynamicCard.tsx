import React from 'react';

const SkeletonDynamicCard: React.FC = () => {
  return (
    <div className="w-full max-w-[550px] p-4 bg-gray-700/30 rounded-xl shadow-lg mb-4 animate-pulse">
      <div className="flex items-center mb-3">
        <div className="h-10 w-10 bg-gray-600/50 rounded-full mr-3"></div>
        <div className="flex-grow">
          <div className="h-4 bg-gray-600/50 rounded w-1/3 mb-1.5"></div>
          <div className="h-3 bg-gray-600/50 rounded w-1/4"></div>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        <div className="h-4 bg-gray-600/50 rounded w-full"></div>
        <div className="h-4 bg-gray-600/50 rounded w-5/6"></div>
      </div>
      <div className="h-20 bg-gray-600/50 rounded mb-3"></div> {/* Placeholder for image/quoted content */}
      <div className="h-8 bg-gray-600/50 rounded w-full"></div> {/* Placeholder for comment input/button */}
    </div>
  );
};

export default SkeletonDynamicCard; 