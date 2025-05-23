/**
 * 此文件定义了 ArticleFeed 组件，用于展示文章的信息流。
 *
 * 主要功能:
 * - 获取文章数据列表 (可能来自 API 或 props)。
 * - 以特定的布局 (如卡片列表、时间线等) 渲染文章摘要或卡片。
 * - 可能包含加载更多或分页的功能。
 * - 可能用于首页或其他需要展示文章列表的页面。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

// 模拟的帖子数据类型
interface MockDynamic {
  id: number;
  author: string;
  action: string; // e.g., '评论了', '发布了', '分享了'
  targetTitle?: string; // e.g., 文章标题
  content?: string; // e.g., 评论内容, 发布的内容摘要
  slug: string; // 用于未来链接到源头（文章、帖子等）
}

// 新增：定义 ArticleFeed 组件的 Props 类型
interface ArticleFeedProps {
  onDynamicClick: (dynamic: MockDynamic) => void;
}

// 更新模拟数据为用户动态
const allMockDynamics: MockDynamic[] = [
  { id: 201, author: "Alice", action: "评论了文章", targetTitle: "关于大型语言模型训练的新思考", content: "这篇文章的观点很有启发性，学习率调整确实关键！", slug: "llm-training-thoughts" },
  { id: 202, author: "Bob", action: "发布了见解", content: "我用 Stable Diffusion 生成的几张赛博朋克风格图片，效果还不错...", slug: "sd-cyberpunk-images" },
  { id: 203, author: "Charlie", action: "分享了链接", targetTitle: "如何克服学习新编程语言时的畏难情绪？", slug: "learning-rust-challenges" },
  { id: 204, author: "David", action: "发布了见解", content: "周末徒步路线推荐：风景绝佳！附带路线图...", slug: "hiking-recommendation" },
  { id: 205, author: "Eve", action: "评论了文章", targetTitle: "最近读的一本好书：《思考，快与慢》", content: "系统1和系统2的比喻太形象了！", slug: "thinking-fast-and-slow-review" },
  { id: 206, author: "Frank", action: "发布了见解", content: "咖啡爱好者的福音：手冲咖啡入门技巧，让你在家也能冲出好咖啡...", slug: "pour-over-coffee-tips" },
  { id: 207, author: "Grace", action: "分享了动态", content: "第一次给开源项目贡献代码，修复了一个小Bug，很有成就感！", slug: "first-open-source-pr" },
  { id: 208, author: "Heidi", action: "评论了见解", targetTitle: "科幻电影中的物理学：哪些是真的？", content: "光剑的物理学解释一直很有趣！", slug: "sci-fi-physics" },
  { id: 209, author: "Ivan", action: "发布了食谱", content: "深夜食堂：十分钟搞定美味夜宵，加班回家必备...", slug: "quick-late-night-snacks" },
  { id: 210, author: "Judy", action: "分享了指南", targetTitle: "冥想入门指南：如何开始你的第一次冥想？", slug: "meditation-guide" },
];

const DYNAMICS_PER_LOAD = 5; // 每次加载数量

const ArticleFeed: React.FC<ArticleFeedProps> = ({ onDynamicClick }) => { // 接收 onDynamicClick prop
  const [dynamics, setDynamics] = useState<MockDynamic[]>([]); // 重命名 state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastDynamicElementRef = useCallback((node: HTMLElement | null) => { // 重命名 ref callback
    if (isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreDynamics(); // 调用新的加载函数
      }
    });
    
    if (node) observer.current.observe(node);
  }, [isLoadingMore, hasMore]);

  // 初始化加载
  useEffect(() => {
    setDynamics(allMockDynamics.slice(0, DYNAMICS_PER_LOAD)); // 使用新的数据和常量
    setHasMore(allMockDynamics.length > DYNAMICS_PER_LOAD);
  }, []);

  // 加载更多函数 (模拟)
  const loadMoreDynamics = useCallback(() => { // 重命名加载函数
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);

    setTimeout(() => {
      const currentLength = dynamics.length;
      const nextDynamics = allMockDynamics.slice(currentLength, currentLength + DYNAMICS_PER_LOAD);
      
      if (nextDynamics.length > 0) {
           setDynamics(prev => {
               const existingIds = new Set(prev.map(d => d.id));
               const uniqueNextDynamics = nextDynamics.filter(d => !existingIds.has(d.id));
               return [...prev, ...uniqueNextDynamics];
           });
           setHasMore(currentLength + nextDynamics.length < allMockDynamics.length);
      } else {
           setHasMore(false);
      }
      setIsLoadingMore(false);
    }, 500); 
  }, [isLoadingMore, hasMore, dynamics.length]);

  return (
    <div 
      className="w-full space-y-3 flex flex-col overflow-y-auto pr-2"
    >
      {/* 动态列表容器 */}
      <div className="space-y-2"> 
          {dynamics.map((dynamic, index) => {
            const isLastElement = dynamics.length === index + 1;
            
            return (
              // 修改：使用 div 替代 Link，添加 onClick 事件
              <div 
                ref={isLastElement ? lastDynamicElementRef : null} // 附加 ref 到外部 div
                key={dynamic.id}
                onClick={() => onDynamicClick(dynamic)} // 点击时调用 prop 函数
                className="block p-3 rounded-lg bg-gray-800/30 backdrop-blur-md shadow-md hover:bg-gray-700/50 transition-colors duration-200 group w-full cursor-pointer" // 添加 cursor-pointer
              >
                <div className="flex items-center text-xs text-gray-400 mb-1">
                  <span className="font-semibold text-gray-300 mr-1">{dynamic.author}</span>
                  <span>{dynamic.action}</span>
                  {dynamic.targetTitle && <span className="ml-1">“{dynamic.targetTitle}”</span>}
                </div>
                {dynamic.content && <p className="text-xs text-gray-200">{dynamic.content}</p>}
              </div>
            );
          })}
      </div>

      {/* 加载指示器 */}
      {isLoadingMore && (
        <div className="text-center py-4 flex-shrink-0">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white/50"></div>
        </div>
      )}
    </div>
  );
};

export default ArticleFeed; // 可以考虑重命名组件为 DynamicFeed 