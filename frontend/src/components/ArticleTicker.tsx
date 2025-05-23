/**
 * 此文件定义了 ArticleTicker 组件，用于以跑马灯或滚动条的形式展示文章标题。
 *
 * 主要功能:
 * - 获取最新的或精选的文章列表。
 * - 以水平滚动的方式循环展示文章标题。
 * - 每个标题通常链接到对应的文章详情页。
 * - 可能包含简单的动画效果。
 * - 用于页眉、页脚或侧边栏等区域，吸引用户点击。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import Marquee from "react-fast-marquee";
import { Link } from 'react-router-dom'; // Import Link for navigation
import { API_BASE_URL } from '../config'; // Import API base URL

// Define the structure of an article for the ticker
interface TickerArticle {
  id: number;
  title: string;
  slug: string; // Add slug for linking
}

const ArticleTicker: React.FC = () => {
  const [articles, setArticles] = useState<TickerArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArticles = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch latest 10 articles, only needing title and slug
        const response = await fetch(`${API_BASE_URL}/api/articles?limit=10&sort_by=created_at&sort_order=desc&fields=id,title,slug`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Ensure data.articles is an array
        if (data && Array.isArray(data.articles)) {
            setArticles(data.articles);
        } else {
            console.error("Fetched data is not in expected format:", data);
            setArticles([]); // Set to empty array if format is wrong
        }
      } catch (err) {
        console.error("Failed to fetch articles for ticker:", err);
        setError("无法加载最新文章");
        setArticles([]); // Clear articles on error
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []); // Empty dependency array means this runs once on mount

  // Display loading or error state
  if (loading) {
    // Optional: Add a subtle loading indicator if desired, or just render nothing
    return null; 
  }

  if (error) {
    // Render error message within the ticker's style
    return (
      <div className="bg-red-800/30 backdrop-blur-sm rounded-lg shadow-md overflow-hidden h-10 flex items-center px-4">
        <span className="text-red-200 text-sm">{error}</span>
      </div>
    );
  }
  
  // Render nothing if no articles are available
  if (articles.length === 0) {
      return null;
  }

  return (
    // Use similar styling as NewsTicker for consistency
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg shadow-md overflow-hidden h-10 flex items-center">
      <Marquee 
        gradient={false} 
        speed={50} // Adjust speed as needed
        className="text-sm"
        pauseOnHover={true} // Pause scrolling on hover
      >
        {articles.map((article) => (
          // Wrap title in a Link component
          <Link 
            key={article.id} 
            to={`/article/${article.slug}`} 
            className="mx-4 text-gray-200 hover:text-blue-300 transition-colors duration-200 whitespace-nowrap" // Prevent line breaks
            title={article.title} // Add title attribute for full text on hover
          >
            {article.title}
          </Link>
        ))}
        {/* Add extra space at the end for seamless looping */}
        {articles.length > 0 && <span className="mx-4">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>}
      </Marquee>
    </div>
  );
};

export default ArticleTicker; 