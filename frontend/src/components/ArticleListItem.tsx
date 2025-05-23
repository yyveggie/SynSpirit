import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

// Assuming Article and Author interfaces are defined similarly to ArticleListPage
// You might want to move these interfaces to a shared types file
interface Author {
    id: number;
    email: string;
    nickname?: string | null;
}

interface Article {
  id: number;
  title: string;
  author: Author | null;
  category?: string | null; // Optional category display
  summary: string | null;
  content: string;
  created_at: string;
  tags: string[] | null;
  slug: string;
  series_name?: string | null;
}

interface ArticleListItemProps {
    article: Article;
}

const ArticleListItem: React.FC<ArticleListItemProps> = ({ article }) => {

    // --- 新增：添加日志 --- 
    console.log(`[ArticleListItem] Rendering article ID: ${article.id}`);
    console.log(`  - Received content:`, article.content?.substring(0, 50) + '...'); // 只打印前 50 字符避免过长
    console.log(`  - Received summary:`, article.summary);
    // --- 结束新增 --- 

    // --- 新增：打印作者信息 --- 
    useEffect(() => {
      if (article.author) {
        console.log('[ArticleListItem] Author data:', article.author);
      }
    }, [article.author]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit', // Use 2-digit for compactness
            day: '2-digit'
        });
    };

    // --- 修改：处理内容预览的函数，增强 content 判断 ---
    const createContentPreview = (content: string | null | undefined, summary: string | null | undefined): string => {
        let textToProcess = '';
        let prefix = '';
        let useSummaryFallback = true; // 默认使用 summary 作为备选

        // 优先使用 content，并检查是否有实际内容
        if (content && content.trim() !== '') { 
            useSummaryFallback = false; // 找到了有效的 content，不需要 fallback
            // 检查图片/视频逻辑
            if (content.trim().toLowerCase().startsWith('<img') || content.trim().toLowerCase().startsWith('<figure')) {
                prefix = '[图片] ';
            } else if (content.includes('youtube.com/watch') || content.includes('youtu.be/') || content.includes('<video')) {
                prefix = '[视频] ';
            }
            // 移除 HTML 并赋值
            textToProcess = content.replace(/<[^>]+>/g, '');
        }
        // 如果 content 无效且 summary 有效，使用 summary
        else if (useSummaryFallback && summary) {
            textToProcess = summary;
        }
        // 如果都没有有效内容
        else {
            return '[无内容预览]';
        }

        // 截取和添加省略号
        const maxLength = 60;
        let truncatedText = textToProcess.substring(0, maxLength);
        if (textToProcess.length > maxLength) {
            truncatedText += '...';
        }
        
        return prefix + truncatedText;
    };
    // --- 结束修改 ---

    const authorName = article.author?.nickname || article.author?.email || '匿名';
    const previewText = createContentPreview(article.content, article.summary);

    // --- 新增：添加日志 --- 
    console.log(`  - Generated previewText:`, previewText);
    // --- 结束新增 --- 

    return (
        <div className="block bg-gray-800/40 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg overflow-hidden shadow-md hover:bg-gray-700/60 dark:hover:bg-gray-700/80 transition-colors duration-200 p-4 group">
            <div className="flex flex-col sm:flex-row justify-between items-start">
                {/* Left Side: Title and Preview */}
                <div className="flex-grow mb-3 sm:mb-0 sm:mr-4">
                    <Link to={`/article/${article.slug}`} className="block mb-1">
                        <h3 className="text-lg font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-2">
                            {article.series_name && <span className="text-xs text-purple-300 mr-1.5">[{article.series_name}]</span>}
                            {article.title}
                        </h3>
                    </Link>
                    <p className="text-sm text-gray-300 dark:text-gray-400 line-clamp-6">
                        {previewText}
                    </p>
                </div>

                {/* Right Side: Meta Info */}
                <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-end w-full sm:w-auto text-xs text-gray-400 dark:text-gray-500 space-y-1 sm:space-y-0 sm:space-x-2">
                    {/* Author and Date - Combined */}
                    <div className="flex items-center space-x-1.5">
                        <span>👤 {authorName}</span>
                        <span>·</span>
                        <span>{formatDate(article.created_at)}</span>
                    </div>
                    {/* Tags */}
                    {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-start sm:justify-end pt-1 sm:pt-0">
                            {article.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-block px-2 py-0.5 text-xs rounded bg-indigo-900/50 text-indigo-200"
                                >
                                    {tag}
                                </span>
                            ))}
                            {article.tags.length > 3 && (
                               <span className="text-xs text-gray-400">...</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ArticleListItem;
