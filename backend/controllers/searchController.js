/**
 * 搜索控制器
 * 处理站内内容搜索相关功能
 */

const { Article } = require('../models/Article');
const { Post } = require('../models/Post');
const { natural } = require('natural'); // 自然语言处理库，需要安装

/**
 * 计算两段文本的相似度
 * @param {string} text1 - 文本1
 * @param {string} text2 - 文本2
 * @returns {number} 相似度评分(0-1)
 */
const calculateSimilarity = (text1, text2) => {
  // 转为小写
  const a = text1.toLowerCase();
  const b = text2.toLowerCase();
  
  // 使用余弦相似度算法
  return natural.JaroWinklerDistance(a, b);
};

/**
 * 查找与用户查询相似的内容
 * @route GET /api/search/similar
 * @param {string} query - 用户搜索查询文本
 * @param {number} limit - 结果数量限制，默认为5
 * @returns {object} 包含相似文章和帖子的JSON对象
 */
exports.findSimilarContent = async (req, res) => {
  try {
    const { query } = req.query;
    const limit = parseInt(req.query.limit) || 5;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ 
        error: '必须提供搜索查询文本'
      });
    }
    
    // 从数据库获取文章和帖子
    const articles = await Article.find(
      { status: 'published' },
      'id title slug'
    ).limit(20);
    
    const posts = await Post.find(
      { status: 'published' },
      'id title slug'
    ).limit(20);
    
    // 计算每篇文章与查询的相似度
    const articlesWithSimilarity = articles.map(article => {
      const similarity = calculateSimilarity(query, article.title);
      return {
        id: article._id,
        title: article.title,
        slug: article.slug,
        similarity
      };
    });
    
    // 计算每个帖子与查询的相似度
    const postsWithSimilarity = posts.map(post => {
      const similarity = calculateSimilarity(query, post.title);
      return {
        id: post._id,
        title: post.title,
        slug: post.slug,
        similarity
      };
    });
    
    // 对结果按相似度排序并限制数量
    const sortedArticles = articlesWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
      
    const sortedPosts = postsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    // 返回结果
    res.json({
      articles: sortedArticles,
      posts: sortedPosts
    });
    
  } catch (error) {
    console.error('搜索相似内容时出错:', error);
    res.status(500).json({ 
      error: '服务器内部错误，请稍后再试'
    });
  }
}; 