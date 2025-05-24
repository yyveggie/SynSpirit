import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- 精简接口，只保留必要字段 ---
export interface DynamicDetails {
  action_id: number;
  share_comment: string | null;
  action_type: string;
  shared_at: string;
  sharer_id: number | null;
  sharer_username: string;
  sharer_avatar_url?: string | null;
  is_repost: boolean;
  original_action: DynamicDetails | null;
  
  target_type: 'article' | 'post' | 'action' | 'tool' | 'user' | 'deleted' | string;
  target_title: string | null;
  target_slug: string | null; 
  target_id: number | null;

  likes_count?: number;
  collects_count?: number;
  reposts_count?: number;
  comment_count?: number;
  
  // 添加缺少的属性
  is_liked_by_current_user?: boolean;
  is_collected_by_current_user?: boolean;
  like_action_id?: number | null;
  collect_action_id?: number | null;
  
  images?: string[];

  is_deleted?: boolean;
}

interface QuotedDynamicViewProps {
  dynamic: DynamicDetails | null | undefined;
  level?: number; 
  forceExpand?: boolean;
  /**
   * 点击图片时的回调函数
   */
  onImageClick?: (images: string[], index: number) => void;
  /**
   * 点击动态内容时的回调，用于跳转到动态时间栏
   */
  onDynamicClick?: (dynamicId: number) => void;
}

// --- 简化文本处理函数 ---
const replaceImageMarkdown = (text: string | undefined | null): string => {
  if (!text) return '';
  // 替换所有 Markdown 格式的图片链接 ![description](url)
  return text.replace(/!\[.*?\]\((.*?)\)/g, '[图片]');
};

// 获取目标类型的中文描述
const getTargetTypeText = (type: string): string => {
  switch (type) {
    case 'article': return '文章';
    case 'post': return '帖子';
    case 'tool': return '工具';
    case 'action': return '动态';
    case 'user': return '用户';
    default: return type || '内容';
  }
};

// 检查两个图片数组是否实质上相同
const areImagesArraysEqual = (arr1: string[] | undefined | null, arr2: string[] | undefined | null): boolean => {
  // 如果两个都是无效值，认为它们相等
  if (!arr1 && !arr2) return true;
  // 如果只有一个是无效值，认为它们不相等
  if (!arr1 || !arr2) return false;
  // 如果长度不同，认为它们不相等
  if (arr1.length !== arr2.length) return false;
  
  // 确保两个数组是有效的
  const validArr1 = Array.isArray(arr1) ? arr1 : [];
  const validArr2 = Array.isArray(arr2) ? arr2 : [];
  
  // 比较每个元素
  for (let i = 0; i < validArr1.length; i++) {
    if (validArr1[i] !== validArr2[i]) return false;
  }
  
  return true;
};

// 新的函数：检查图片是否应该显示在当前层级
const shouldShowImagesInCurrentLevel = (dynamic: DynamicDetails | null): boolean => {
  if (!dynamic || !dynamic.images || !Array.isArray(dynamic.images) || dynamic.images.length === 0) {
    return false;
  }
  return true;
};

// 新的函数：检查嵌套层级应该显示的图片
const getImagesForNestedLevel = (dynamic: DynamicDetails | null, level: number): string[] | null => {
  if (!dynamic) return null;
  
  // 获取完整的转发链（从最新到最旧）
  const chain: DynamicDetails[] = [];
  let currentDynamic: DynamicDetails | null = dynamic;
  
  // 构建完整链
  while (currentDynamic) {
    chain.push(currentDynamic);
    currentDynamic = currentDynamic.original_action;
  }
  
  // 如果要查找的层级超出了链的长度，返回null
  if (level >= chain.length) return null;
  
  // 获取指定层级的动态
  const targetDynamic = chain[level];
  if (!targetDynamic.images || !Array.isArray(targetDynamic.images) || targetDynamic.images.length === 0) {
    return null;
  }
  
  // 创建一个Map记录每张图片首次出现的层级
  const imageFirstAppearanceLevel = new Map<string, number>();
  
  // 遍历转发链，记录每张图片首次出现的层级
  for (let i = 0; i < chain.length; i++) {
    const dynamicAtLevel = chain[i];
    if (dynamicAtLevel.images && Array.isArray(dynamicAtLevel.images)) {
      dynamicAtLevel.images.forEach(img => {
        // 只记录第一次出现的层级
        if (!imageFirstAppearanceLevel.has(img)) {
          imageFirstAppearanceLevel.set(img, i);
        }
      });
    }
  }
  
  // 过滤出当前层级独有的图片（即首次出现在当前层级的图片）
  const uniqueImages = targetDynamic.images.filter(img => imageFirstAppearanceLevel.get(img) === level);
  
  // 如果这个层级没有独有的图片，返回null
  return uniqueImages.length > 0 ? uniqueImages : null;
};

// 新的：只渲染当前层自己的图片
const renderOwnImages = (dynamic: DynamicDetails, nestedCount: number, onImageClick?: (images: string[], index: number) => void) => {
  if (!dynamic.images || !Array.isArray(dynamic.images) || dynamic.images.length === 0) return null;
  const baseHeight = Math.max(120 - nestedCount * 15, 70);
  const twoImageHeight = Math.max(100 - nestedCount * 15, 60);
  const multiImageHeight = Math.max(80 - nestedCount * 15, 50);
  const containerScale = Math.max(1 - (nestedCount * 0.05), 0.9);
  const getImageWidth = (count: number) => {
    if (count === 1) return '100%';
    if (count === 2) return 'calc(50% - 0.1rem)';
    if (count === 3) return 'calc(33.333% - 0.125rem)';
    if (count === 4) return 'calc(25% - 0.125rem)';
    if (count <= 6) return 'calc(33.333% - 0.125rem)';
    return 'calc(25% - 0.125rem)';
  };
  return (
    <div
      className="flex flex-wrap gap-0.5 mt-1.5"
      style={{
        width: `${containerScale * 100}%`,
        marginLeft: `${((1 - containerScale) / 2) * 100}%`
      }}
    >
      {dynamic.images.map((img, idx) => (
        <div
          key={idx}
          className="relative overflow-hidden cursor-pointer"
          onClick={e => { e.stopPropagation(); onImageClick && onImageClick(dynamic.images!, idx); }}
          style={{
            width: getImageWidth(dynamic.images!.length),
            maxHeight: dynamic.images!.length === 1
              ? `${baseHeight}px`
              : dynamic.images!.length === 2
                ? `${twoImageHeight}px`
                : `${multiImageHeight}px`
          }}
        >
          <img
            src={img}
            alt={`动态图片 ${idx + 1}`}
            className="object-cover w-full h-full"
            style={{ maxHeight: dynamic.images!.length === 1 ? `${baseHeight}px` : dynamic.images!.length === 2 ? `${twoImageHeight}px` : `${multiImageHeight}px` }}
          />
        </div>
      ))}
    </div>
  );
};

// 新的单条动态卡片组件
const InternalDynamicCard = React.memo(({ dynamic, isLast, nestedCount = 0, onImageClick, onDynamicClick, forceExpandProp }: {
  dynamic: DynamicDetails;
  isLast: boolean;
  nestedCount?: number;
  onImageClick?: (images: string[], index: number) => void;
  onDynamicClick?: (dynamicId: number) => void;
  forceExpandProp?: boolean;
}) => {
  const [expanded, setExpanded] = useState(() => {
    if (nestedCount === 0) {
      return forceExpandProp !== undefined ? forceExpandProp : true;
    }
    return forceExpandProp || false;
  });
  
  // 处理点击卡片
  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDynamicClick && dynamic.action_id) {
      onDynamicClick(dynamic.action_id);
    }
  };
  
  // 处理图片点击
  const handleImageClick = (e: React.MouseEvent, images: string[], index: number) => {
    e.stopPropagation();
    if (onImageClick) {
      onImageClick(images, index);
    }
  };
  
  // 生成指向目标的链接
  const generateTargetLink = (
    type: string | undefined, 
    slug: string | null | undefined, 
    id: number | null | undefined
  ): string | null => {
    if (!slug) return null;
    if (type === 'post') return `/posts/${slug}`;
    if (type === 'article') return `/article/${slug}`;
    if (type === 'tool') return `/tool/${slug}`;
    return null;
  };
  
  // 渲染被引用动态的图片 - 完全重写此函数
  const renderImages = (): React.ReactNode => {
    // 使用getImagesForNestedLevel函数获取当前动态层级的非重复图片
    const currentLevelImages = getImagesForNestedLevel(dynamic, 0);
    if (!currentLevelImages || currentLevelImages.length === 0) return null;
    
    console.log(`[动态${dynamic.action_id}]显示${currentLevelImages.length}张图片`);
    
    // 根据嵌套深度调整图片大小
    const baseHeight = Math.max(120 - nestedCount * 15, 70); // 随嵌套深度减小，但最小不低于70px
    const twoImageHeight = Math.max(100 - nestedCount * 15, 60); // 最小60px
    const multiImageHeight = Math.max(80 - nestedCount * 15, 50); // 最小50px
    
    // 根据嵌套深度决定图片容器的宽度缩放比例
    const containerScale = Math.max(1 - (nestedCount * 0.05), 0.9); // 每嵌套一层减少5%宽度，但不要太窄
    
    // 根据图片数量获取适当的图片宽度
    const getImageWidth = (count: number) => {
      if (count === 1) return '100%';
      if (count === 2) return 'calc(50% - 0.1rem)'; // 减小间距计算
      if (count === 3) return 'calc(33.333% - 0.125rem)'; // 3张图片用3列布局
      if (count === 4) return 'calc(25% - 0.125rem)'; // 4张图片用4列布局
      if (count <= 6) return 'calc(33.333% - 0.125rem)'; // 5-6张图片用3列布局
      return 'calc(25% - 0.125rem)'; // 7张及以上用4列布局
    };
    
    return (
      <div 
        className="flex flex-wrap gap-0.5 mt-1.5" 
        style={{ 
          width: `${containerScale * 100}%`, 
          marginLeft: `${((1 - containerScale) / 2) * 100}%` // 居中显示
        }}
      >
        {currentLevelImages.map((img, idx) => (
          <div 
            key={idx} 
            className="relative overflow-hidden cursor-pointer"
            onClick={(e) => handleImageClick(e, currentLevelImages, idx)}
            style={{ 
              width: getImageWidth(currentLevelImages.length),
              maxHeight: currentLevelImages.length === 1 
                ? `${baseHeight}px` 
                : currentLevelImages.length === 2 
                  ? `${twoImageHeight}px` 
                  : `${multiImageHeight}px`
            }}
          >
            <img
              src={img}
              alt={`动态图片 ${idx+1}`}
              className="object-cover w-full h-full"
              style={{ maxHeight: currentLevelImages.length === 1 ? `${baseHeight}px` : currentLevelImages.length === 2 ? `${twoImageHeight}px` : `${multiImageHeight}px` }}
            />
          </div>
        ))}
      </div>
    );
  };
  
  // 如果动态已删除，且是原始动态（没有 original_action），则显示删除信息
  // 如果是中间层的转发，不要显示删除信息
  if (dynamic.target_type === 'deleted' && !dynamic.original_action) {
    let deletedMessage = dynamic.target_title || "引用的原始内容已被删除。";
    return (
      <div className="relative">
        <div className="p-3 bg-transparent border-0 border-b border-gray-300 hover:bg-gray-100/30 transition-colors cursor-pointer mb-1"
             onClick={handleCardClick}>
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 text-xs">
              <Link 
                to={dynamic.sharer_id ? `/profile/${dynamic.sharer_id}` : '#'}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-400 hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                @{dynamic.sharer_username}
              </Link>
              {dynamic.share_comment && (
                <span className="text-black ml-1 break-words">
                  ：{dynamic.share_comment}
                </span>
              )}
              {!dynamic.share_comment && (
                <span className="text-black ml-1">：转发了动态</span>
              )}
            </div>
          </div>
          
          {renderImages()}
          
          <div className="p-1.5 bg-transparent border-0 border-t border-gray-300 mt-2">
            <p className="text-xs text-red-400 font-normal">{deletedMessage}</p>
          </div>
        </div>
      </div>
    );
  }
  
  // 如果是中间层转发且目标是已删除内容，则仅显示转发信息，不显示删除消息
  if (dynamic.target_type === 'deleted' && dynamic.original_action) {
    return (
      <div className="relative">
        <div 
          className="p-3 bg-transparent border-0 border-b border-gray-300 hover:bg-gray-100/30 transition-colors cursor-pointer mb-1"
          onClick={handleCardClick}
        >
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 text-xs">
              <Link 
                to={dynamic.sharer_id ? `/profile/${dynamic.sharer_id}` : '#'}
                onClick={(e) => e.stopPropagation()}
                className="text-blue-400 hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                @{dynamic.sharer_username}
              </Link>
              <span className="text-black ml-1">：转发了动态</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-gray-500 mr-2">{new Date(dynamic.shared_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          
          {renderImages()}
        </div>
      </div>
    );
  }
  
  // 正常动态
  return (
    <div className="relative">
      <div 
        className="p-3 bg-transparent border-0 border-b border-gray-300 hover:bg-gray-100/30 transition-colors cursor-pointer mb-1"
        onClick={handleCardClick}
      >
        {/* 折叠状态 - 简洁模式 */}
        {!expanded ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-1 text-xs">
                <Link 
                  to={dynamic.sharer_id ? `/profile/${dynamic.sharer_id}` : '#'}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 hover:underline font-medium"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{dynamic.sharer_username}
                </Link>
                <span className="text-black truncate ml-1">
                  ：{(() => {
                    const commentText = dynamic.share_comment ? replaceImageMarkdown(dynamic.share_comment) : '';
                    const targetTitleText = dynamic.target_title || '';
                    const maxLength = nestedCount > 0 ? 25 : 45;

                    if (commentText) {
                      return commentText.slice(0, maxLength) + (commentText.length > maxLength ? '...' : '');
                    } else if (dynamic.is_repost) {
                      return '转发了动态';
                    } else {
                      const typeText = getTargetTypeText(dynamic.target_type || 'content');
                      const fullText = `分享了${typeText}${targetTitleText ? '：' + targetTitleText : ''}`;
                      return fullText.slice(0, maxLength) + (fullText.length > maxLength ? '...' : '');
                  }
                  })()}
                </span>
              </div>
            </div>
            {/* 只渲染当前层自己的图片 */}
            {renderOwnImages(dynamic, nestedCount, onImageClick)}
          </div>
        ) : (
          <>
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-start flex-1">
                <Link 
                  to={dynamic.sharer_id ? `/profile/${dynamic.sharer_id}` : '#'}
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 hover:underline font-medium text-xs flex-shrink-0"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{dynamic.sharer_username}
                </Link>
                {/* 确保冒号始终存在 */}
                {dynamic.share_comment && (
                  <span className="text-black ml-1 break-words text-xs">
                    ：<ReactMarkdown 
                      remarkPlugins={[remarkGfm]} 
                      components={{
                        img: ({node, ...props}) => <span className="text-blue-400">[图片]</span>,
                        p: ({node, ...props}) => <span {...props} />
                      }}
                    >
                      {dynamic.share_comment}
                    </ReactMarkdown>
                  </span>
                )}
                {!dynamic.share_comment && dynamic.is_repost && (
                  <span className="text-black ml-1 text-xs">：转发了动态</span>
                )}
                {!dynamic.share_comment && !dynamic.is_repost && dynamic.target_type && (
                  <span className="text-black ml-1 text-xs">：分享了{getTargetTypeText(dynamic.target_type)}</span>
                )}
              </div>
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">{new Date(dynamic.shared_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            
            {/* 渲染当前层级的图片 */}
            {renderOwnImages(dynamic, nestedCount, onImageClick)}

            {/* 目标内容 */}
            {(dynamic.target_title || dynamic.target_slug) && dynamic.target_type !== 'action' && (
              <div className="text-xs p-1 bg-transparent border-0 border-t border-gray-300 mt-1.5 mb-1 flex items-center"> 
                <span className="text-black whitespace-nowrap">
                  {getTargetTypeText(dynamic.target_type)}：
                </span>
                {generateTargetLink(dynamic.target_type, dynamic.target_slug, dynamic.target_id) ? (
                  <Link 
                    to={generateTargetLink(dynamic.target_type, dynamic.target_slug, dynamic.target_id) || '#'}
                    className={`hover:underline truncate ml-1 ${
                      dynamic.target_type === 'article' ? 'text-blue-400' : 
                      dynamic.target_type === 'post' ? 'text-green-400' : 
                      dynamic.target_type === 'tool' ? 'text-purple-400' : 'text-gray-300'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {dynamic.target_title}
                  </Link>
                ) : (
                  <span className="text-black truncate ml-1">{dynamic.target_title}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
InternalDynamicCard.displayName = 'InternalDynamicCard'; // For better debugging

// 主组件：平铺+线条式的转发链
const QuotedDynamicViewComponent: React.FC<QuotedDynamicViewProps> = ({ 
  dynamic, 
  level = 1, 
  forceExpand = false,
  onImageClick,
  onDynamicClick
}) => {
  // 是否展开所有动态 - 默认不展开
  const [showAll, setShowAll] = useState(false);
  // 记录动画状态
  const [isAnimating, setIsAnimating] = useState(false);
  // 引用容器元素
  const containerRef = useRef<HTMLDivElement>(null);
  // 用于控制渲染的动态列表
  const [visibleDynamics, setVisibleDynamics] = useState<DynamicDetails[]>([]);
  // 存储构建好的转发链
  const [dynamicChain, setDynamicChain] = useState<DynamicDetails[]>([]);
  
  // 添加effect以响应forceExpand属性变化
  useEffect(() => {
    if (forceExpand) {
      setShowAll(true);
    }
  }, [forceExpand]);
  
  // 构建转发链数组
  useEffect(() => {
    if (dynamic) {
      const buildChain = (item: DynamicDetails | null): DynamicDetails[] => {
        const chain: DynamicDetails[] = [];
        let current = item;
        
        // 防止无限循环
        const maxDepth = 10;
        let depth = 0;
        
        while (current && depth < maxDepth) {
          chain.push(current);
          current = current.original_action;
          depth++;
        }
        
        return chain;
      };
      
      setDynamicChain(buildChain(dynamic));
    } else {
      setDynamicChain([]);
    }
  }, [dynamic]);
  
  // 当showAll或dynamicChain变化时更新visibleDynamics
  useEffect(() => {
    if (showAll) {
      // 如果是展开操作，先设置前3条
      if (visibleDynamics.length <= 3) {
        setVisibleDynamics(dynamicChain.slice(0, Math.min(3, dynamicChain.length)));
        
        // 然后延迟添加剩余的条目
        setTimeout(() => {
          setVisibleDynamics(dynamicChain);
        }, 50);
      } else {
        setVisibleDynamics(dynamicChain);
      }
    } else {
      // 如果是收起操作，直接设置为前3条
      setVisibleDynamics(dynamicChain.slice(0, Math.min(3, dynamicChain.length)));
    }
  }, [showAll, dynamicChain]);
  
  // 如果没有动态数据，显示占位符
  if (!dynamic) {
    return (
      <div className="p-2 bg-transparent rounded-lg text-xs text-gray-500 italic mt-2 border border-black">
        原始分享内容丢失或无法加载。
      </div>
    );
  }
  
  // 默认只显示前3条，其余折叠
  const hasMore = dynamicChain.length > 3 && !showAll;
  
  // 计算每个动态后面有多少条嵌套动态
  const getNestedCount = (index: number): number => {
    if (index >= dynamicChain.length - 1) {
      return 0; // 最后一个动态后面没有嵌套动态
    }
    return dynamicChain.length - index - 1;
  };
  
  // 处理展开/收起的点击事件，防止触发动态详情
  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isAnimating) return; // 防止动画过程中重复点击
    
    setIsAnimating(true);
    setShowAll(prevState => !prevState);
    
    // 动画结束后重置状态 - 延长动画完成时间
    setTimeout(() => {
      setIsAnimating(false);
    }, 1200);
  };
  
  return (
    <div className="mt-2 relative pl-4">
      <div 
        ref={containerRef}
        className="transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      >
        {/* 显示固定的前3条，确保它们始终可见 */}
        {dynamicChain.slice(0, Math.min(3, dynamicChain.length)).map((item, index) => (
          <div 
            key={`fixed-${item.action_id || index}`}
            className="transform transition-all duration-500 ease-in-out mb-1"
          >
            <InternalDynamicCard
              dynamic={item}
              isLast={index === Math.min(2, dynamicChain.length - 1) && hasMore}
              nestedCount={getNestedCount(index)}
              onImageClick={onImageClick}
              onDynamicClick={onDynamicClick}
              forceExpandProp={forceExpand}
            />
          </div>
        ))}
        
        {/* 剩余的条目，移除高度限制 */}
        {dynamicChain.length > 3 && ( // Always render the container for max-height transition
          <div 
            className="transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden" // Added overflow-hidden
            style={{
              maxHeight: showAll ? `${dynamicChain.slice(3).reduce((acc, item) => acc + (item.images && item.images.length > 0 ? 200 : 80), 0)}px` : '0px', // Dynamic height estimation
            }}
          >
            {dynamicChain.slice(3).map((item, slicedIndex) => {
              const index = slicedIndex + 3;
              return (
                <div 
                  key={`extra-${item.action_id || index}`}
                  className="transform mb-1" // Removed transition classes, will be controlled by parent
                  style={{
                    opacity: showAll ? 1 : 0,
                    transform: showAll ? 'translateY(0)' : 'translateY(-10px)',
                    transition: `opacity 500ms ease-[cubic-bezier(0.34,1.56,0.64,1)] ${slicedIndex * 80}ms, transform 500ms ease-[cubic-bezier(0.34,1.56,0.64,1)] ${slicedIndex * 80}ms`,
                  }}
                >
                  <InternalDynamicCard
                    dynamic={item}
                    isLast={index === dynamicChain.length - 1}
                    nestedCount={getNestedCount(index)}
                    onImageClick={onImageClick}
                    onDynamicClick={onDynamicClick}
                    forceExpandProp={forceExpand}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 展开/收起按钮，带渐变过渡效果 */}
      <div className="relative">
        {/* "展开更多"按钮 */}
        <div 
          className={`flex justify-center items-center mb-2 mt-1 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showAll ? 'opacity-0 max-h-0 invisible' : 'opacity-100 max-h-10 visible'}`}
        >
          {hasMore && (
            <button 
              onClick={handleToggleClick}
              disabled={isAnimating}
              className={`px-3 py-1 text-xs bg-gray-800/40 hover:bg-gray-800/60 text-blue-300 rounded-full transition-all flex items-center ${isAnimating ? 'opacity-50' : ''}`}
            >
              <svg className="w-3 h-3 mr-1 transition-transform duration-300 ease-in-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              剩余 {dynamicChain.length - 3} 条
            </button>
          )}
        </div>
        
        {/* "收起"按钮 - 在完全展开时显示 */}
        <div 
          className={`flex justify-center items-center mb-2 mt-1 transition-opacity duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${showAll && dynamicChain.length > 3 ? 'opacity-100 visible' : 'opacity-0 invisible h-0'}`}
        >
          {dynamicChain.length > 3 && (
            <button 
              onClick={handleToggleClick}
              disabled={isAnimating}
              className={`px-3 py-1 text-xs bg-gray-800/40 hover:bg-gray-800/60 text-blue-300 rounded-full transition-all flex items-center ${isAnimating ? 'opacity-50' : ''}`}
            >
              <svg className="w-3 h-3 mr-1 transition-transform duration-300 ease-in-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              收起
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const QuotedDynamicView = React.memo(QuotedDynamicViewComponent);
QuotedDynamicView.displayName = 'QuotedDynamicView'; // For better debugging

export default QuotedDynamicView; 