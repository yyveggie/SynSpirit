/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了展示社区帖子列表页面的 React 组件。
 *
 * 主要功能:
 * - 获取并显示所有社区帖子或特定主题下的帖子列表。
 * - 可能支持分页或加载更多。
 * - 提供到单个帖子详情页的链接。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PostCard from '../components/PostCard'; // Import the new PostCard
import { API_BASE_URL } from '../config';
import { useSidebar } from '../contexts/SidebarContext'; // 引入 useSidebar
// import axios from 'axios'; // No longer needed for mock data

// 修改: 使用模拟数据类型 (可以单独定义或复用)
interface MockPost {
  id: number;
  title: string;
  author: string;
  content: string;
  slug: string;
}

// 定义模拟数据 (可以从 ArticleFeed 复制和扩展)
const mockPosts: MockPost[] = [
  { id: 101, title: "关于大型语言模型训练的新思考", author: "AI探索者", content: "最近在研究中发现，调整学习率的策略对最终模型的性能影响巨大，特别是对于长序列任务，采用逐步降低的学习率似乎比固定学习率效果更好...", slug: "llm-training-thoughts" },
  { id: 102, title: "我用 Stable Diffusion 生成的几张赛博朋克风格图片", author: "数字艺术家", content: "分享一下周末用 SDXL 模型的 LoRA 尝试生成的图片，效果还不错，提示词工程确实是门学问啊！大家看看怎么样？", slug: "sd-cyberpunk-images" },
  { id: 103, title: "如何克服学习新编程语言时的畏难情绪？", author: "终身学习者", content: "从 Python 转向 Rust 的过程中，遇到了不少挑战，尤其是所有权和生命周期的概念，分享一些我的心得体会，希望能帮助到同样在学习的朋友。", slug: "learning-rust-challenges" },
  { id: 104, title: "周末徒步路线推荐：风景绝佳！", author: "户外爱好者", content: "上周末去了一条少有人知的徒步路线，山顶的风景简直太美了！强烈推荐给大家，附带路线图和注意事项。", slug: "hiking-recommendation" },
  { id: 105, title: "最近读的一本好书：《思考，快与慢》", author: "读书笔记", content: "丹尼尔·卡尼曼的这本书深入浅出地介绍了系统1和系统2的思维模式，对理解我们如何做决策非常有帮助，强烈推荐！", slug: "thinking-fast-and-slow-review" },
  { id: 106, title: "咖啡爱好者的福音：手冲咖啡入门技巧", author: "咖啡师小李", content: "从选豆、磨粉到水温、手法，分享一些我自己总结的手冲咖啡小技巧，让你在家也能冲出好咖啡。", slug: "pour-over-coffee-tips" },
  { id: 107, title: "开源项目贡献初体验：修复了一个小Bug", author: "代码萌新", content: "第一次给 Github 上的开源项目提 PR，虽然只是个小小的文档修复，但感觉很有成就感！记录一下过程。", slug: "first-open-source-pr" },
  // ... add more mock posts if desired ...
];

// Placeholder for Featured Tools data type (copy if needed)
interface Tool {
  id: number;
  name: string;
  slug: string;
}

const PostsListPage: React.FC = () => {
  const { isSidebarOpen } = useSidebar(); // 使用 Context
  const [posts, setPosts] = useState<MockPost[]>([]); 
  const [loading, setLoading] = useState(true); // 可以保留 loading 状态模拟
  const [error, setError] = useState<string | null>(null); // 保留错误处理
  const [featuredTools, setFeaturedTools] = useState<Tool[]>([]); 
  const navigate = useNavigate();

  // 修改: 使用模拟数据替换 API 调用
  useEffect(() => {
    setLoading(true);
    // 模拟加载延迟
    setTimeout(() => {
      setPosts(mockPosts);
      setLoading(false);
    }, 300); // 模拟 300ms 加载时间
  }, []);

  // Fetch featured tools for the sidebar (保持不变)
  useEffect(() => {
    const loadFeaturedTools = async () => {
      try {
        // Using mock data for simplicity, replace with API call if needed
        setFeaturedTools([
          { id: 1, name: "GPT-4 Turbo", slug: "gpt-4-turbo" },
          { id: 2, name: "Midjourney V6", slug: "midjourney-v6" },
          { id: 3, name: "Claude 3.5 Sonnet", slug: "claude-3.5-sonnet" },
          { id: 4, name: "Stable Diffusion 3", slug: "stable-diffusion-3" },
          { id: 5, name: "Perplexity AI", slug: "perplexity-ai" },
          { id: 6, name: "Runway Gen-3", slug: "runway-gen-3" }
        ]);
      } catch (error) {
        console.error('加载热门工具失败:', error);
      }
    };
    loadFeaturedTools();
  }, []);

  return (
    <div className={`min-h-screen flex flex-col text-white`}>
      {/* 移除Navbar组件 */}
      <div className="flex flex-1 overflow-hidden pt-16">
        {/* 移除SideNavbar组件 */}
        <main 
          className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'} px-6 md:px-10 py-8`}
        >
          <div className="max-w-3xl mx-auto">
              {loading && (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
                </div>
              )}
    
              {error && (
                <div className="border border-red-600 text-red-200 p-4 rounded-lg text-center">
                  {error}
                </div>
              )}
    
              {!loading && !error && posts.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <p>还没有帖子发布。</p>
                </div>
              )}
    
              {!loading && !error && posts.length > 0 && (
                <div className="grid grid-cols-1 gap-5">
                  {posts.map((post) => (
                    <PostCard 
                      key={post.id}
                      id={post.id}
                      title={post.title}
                      excerpt={post.content} 
                      slug={post.slug}
                      author={post.author} 
                    />
                  ))}
                </div>
              )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default PostsListPage; 