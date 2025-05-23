import React, { useState } from 'react';
// Use react-icons instead of heroicons
// import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
// Import the new interface and the utility function
import { getCosImageUrl, MediaItem } from '../utils/imageUrl'; 
// 导入自定义懒加载图片组件
import LazyImage from './LazyImage';

// Update props interface to accept MediaItem array
interface MediaCarouselProps {
    mediaItems: MediaItem[];
}

// eslint-disable-next-line react/prop-types
const MediaCarousel: React.FC<MediaCarouselProps> = ({ mediaItems }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Filter out invalid items (though extraction should handle this)
    const validMediaItems = mediaItems.filter(item => item && item.url);
    const totalItems = validMediaItems.length;

    if (totalItems === 0) {
        return null;
    }

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prevIndex) => (prevIndex === 0 ? totalItems - 1 : prevIndex - 1));
    };

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prevIndex) => (prevIndex === totalItems - 1 ? 0 : prevIndex + 1));
    };

    // Stop propagation for clicks within the carousel area (image or video)
    const handleMediaClick = (e: React.MouseEvent) => {
         e.stopPropagation();
    };

    // 处理视频URL，确保禁用自动播放
    const ensureNoAutoplay = (url: string) => {
        if (!url) return url;
        
        // 处理B站链接，确保添加autoplay=0
        if (url.includes('bilibili.com')) {
            const hasParams = url.includes('?');
            const connector = hasParams ? '&' : '?';
            
            // 添加多个参数确保不自动播放
            url = `${url}${connector}autoplay=0&danmaku=0&as_wide=0`;
            
            // 确保没有重复参数
            return url.replace(/([&?])autoplay=\d+/g, '$1autoplay=0');
        }
        
        // 处理YouTube链接
        if (url.includes('youtube.com')) {
            const hasParams = url.includes('?');
            const connector = hasParams ? '&' : '?';
            
            return `${url}${connector}autoplay=0`;
        }
        
        return url;
    };

    const currentItem = validMediaItems[currentIndex];

    // 计算每个媒体项目的优先级
    // 当前显示的媒体优先级最高，相邻的次之，其余最低
    const getPriority = (index: number): number => {
        if (index === currentIndex) return 1; // 当前显示的最高优先级
        if (index === (currentIndex + 1) % totalItems || 
            index === (currentIndex - 1 + totalItems) % totalItems) {
            return 2; // 相邻媒体项次高优先级
        }
        return 4; // 其他媒体项最低优先级
    };

    return (
        <div className="relative w-full aspect-video overflow-hidden group rounded-md" onClick={handleMediaClick}>
            {/* Inner container for sliding - holds images and videos */}
            <div
                className="flex h-full transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
                {validMediaItems.map((item, index) => (
                    <div key={index} className="w-full h-full flex-shrink-0 relative"> {/* Wrapper for each item */}
                        {item.type === 'image' ? (
                            <LazyImage
                                src={getCosImageUrl(item.url) || ''} 
                                alt={`Media ${index + 1}`}
                                className="w-full h-full object-cover transform-none hover:transform-none active:transform-none"
                                priority={getPriority(index)}
                                placeholderSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3C/svg%3E"
                                blur={true}
                            />
                        ) : item.type === 'video' ? (
                            <iframe
                                src={ensureNoAutoplay(item.url)} // 使用处理后的URL
                                title={`Media ${index + 1}`}
                                className="w-full h-full absolute top-0 left-0 border-0 transform-none hover:transform-none active:transform-none"
                                allow="clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                loading="lazy" // Lazy loading for iframes
                                allowFullScreen
                                scrolling="no"
                                referrerPolicy="no-referrer-when-downgrade"
                            ></iframe>
                        ) : null}
                    </div>
                ))}
            </div>

            {/* Navigation Buttons */}
            {totalItems > 1 && (
                <>
                    <button
                        onClick={handlePrev}
                        className="absolute top-1/2 left-2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus:outline-none transform-none hover:transform-none active:transform-none hover:bg-opacity-70 z-10" // Ensure buttons are above iframe
                        aria-label="Previous media"
                    >
                        {/* <ChevronLeftIcon className="h-5 w-5" /> */}
                        <FaChevronLeft className="h-4 w-4" /> {/* Adjusted size slightly if needed */}
                    </button>
                    <button
                        onClick={handleNext}
                        className="absolute top-1/2 right-2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus:outline-none transform-none hover:transform-none active:transform-none hover:bg-opacity-70 z-10" // Ensure buttons are above iframe
                        aria-label="Next media"
                    >
                        {/* <ChevronRightIcon className="h-5 w-5" /> */}
                        <FaChevronRight className="h-4 w-4" /> {/* Adjusted size slightly if needed */}
                    </button>
                </>
            )}

            {/* Media Counter */}
            {totalItems > 1 && (
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded z-10"> {/* Ensure counter is above iframe */}
                    {currentIndex + 1} / {totalItems}
                </div>
            )}
        </div>
    );
};

export default MediaCarousel; // Export the renamed component 