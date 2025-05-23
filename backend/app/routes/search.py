"""
搜索相关 API 端点
"""
from flask import Blueprint, request, jsonify, current_app
from app import db
# --- 修改：从真实模型文件导入 ---
from app.models.article import Article
from app.models.post import Post
# --- 结束修改 ---
import jellyfish # 用于计算 Jaro-Winkler 相似度

# # 为了能运行，暂时定义一个虚拟的 Article 和 Post 类
# # 您需要将它们替换为真实的 SQLAlchemy 模型
# # ----------------- 请替换为真实模型 -----------------
# class Article(db.Model):
#     __tablename__ = 'articles' # 假设表名
#     id = db.Column(db.Integer, primary_key=True)
#     title = db.Column(db.String)
#     slug = db.Column(db.String)
#     status = db.Column(db.String, default='published')
#     # 如果您的模型有其他字段，请确保它们不会影响这里的查询
# 
#     def __repr__(self):
#         return f'<Article {self.title}>'
# 
# class Post(db.Model):
#     __tablename__ = 'posts' # 假设表名
#     id = db.Column(db.Integer, primary_key=True)
#     title = db.Column(db.String)
#     slug = db.Column(db.String)
#     status = db.Column(db.String, default='published')
# 
#     def __repr__(self):
#         return f'<Post {self.title}>'
# # --------------- 真实模型替换结束 ---------------

# --- 新增导入 User 模型 ---
from app.models.user import User
# --- 结束新增导入 ---

search_bp = Blueprint('search_api', __name__) # 蓝图名称保持唯一

def calculate_similarity_py(text1, text2):
    """
    计算两段文本的 Jaro-Winkler 相似度。
    确保输入是字符串，且转换为小写以忽略大小写。
    """
    if not text1 or not text2:
        return 0.0
    
    # --- DEBUGGING: 打印实际比较的字符串 ---
    s1 = str(text1).lower()
    s2 = str(text2).lower()
    # 使用 current_app.logger.info 或者 print，根据你的日志配置选择
    # current_app.logger.info(f"[相似度调试] 比较: '{s1}' vs '{s2}'")
    print(f"[相似度调试] 比较: '{s1}' vs '{s2}'") # 直接用print，更容易在开发控制台看到
    # --- END DEBUGGING ---
    
    return jellyfish.jaro_winkler_similarity(s1, s2)

@search_bp.route('/similar', methods=['GET'])
def find_similar_content_py():
    """
    查找与用户查询相似的内容 (Python Flask 版本)
    """
    try:
        query_param = request.args.get('query')
        limit_param = request.args.get('limit', default=5, type=int)

        current_app.logger.info(f"[搜索日志] 收到搜索请求: query='{query_param}', limit={limit_param}")

        if not query_param or query_param.strip() == '':
            current_app.logger.warning("[搜索日志] 查询参数为空")
            return jsonify({'error': '必须提供搜索查询文本'}), 400

        # --- 文章处理 ---
        articles_query = Article.query.options(db.joinedload(Article.author_user)).filter(
            Article.is_published == True,  # 正确的发布状态字段
            # Article.is_deleted == False  # Article 模型没有 is_deleted 字段，暂时移除此条件
        )
        # 如果需要，可以在这里添加更多的过滤条件，例如基于 query_param 的初步文本匹配
        # articles_query = articles_query.filter(Article.title.ilike(f"%{query_param}%")) # 示例：简单的标题包含匹配

        all_articles = articles_query.all()
        current_app.logger.info(f"[搜索日志] 从数据库获取到 {len(all_articles)} 篇已发布的文章。")
        if not all_articles:
            current_app.logger.info("[搜索日志] 没有找到任何已发布的文章。")

        similar_articles = []
        for article in all_articles:
            # 使用 content 或者 summary (如果 content 不直接可用或太长) # MODIFIED: 只与标题比较，移除内容比较逻辑
            # content_to_compare = (article.content[:500] + '...') if article.content and len(article.content) > 500 else article.content
            # if not content_to_compare and hasattr(article, 'summary'): # 作为后备
            #      content_to_compare = article.summary

            # if not content_to_compare: # 如果两者都不可用，则跳过
            #     current_app.logger.debug(f"[搜索日志] 文章 ID {article.id} ('{article.title}') 无有效内容进行比较，跳过。")
            #     continue

            # similarity_score = calculate_similarity_py(query_param, article.title + " " + (content_to_compare or "")) # OLD LOGIC
            similarity_score = calculate_similarity_py(query_param, article.title) # NEW: 只比较标题
            current_app.logger.debug(f"[搜索日志] 文章 ID {article.id} ('{article.title}') 与查询 '{query_param}' 的标题相似度分数为: {similarity_score:.4f}")
            if similarity_score > 0.1: # 示例阈值，可能需要调整
                author_nickname = article.author_user.nickname if article.author_user else "佚名" # <-- 修正: 使用 article.author_user
                similar_articles.append({
                'id': article.id, 
                'title': article.title,
                'slug': article.slug,
                    'content': article.content[:150] if article.content else '', # 返回部分内容
                'cover_image': article.cover_image,
                    'author_nickname': author_nickname,
                    'created_at': article.created_at.isoformat() if article.created_at else None,
                    'score': similarity_score,
                    'type': 'article'
                })
        
        current_app.logger.info(f"[搜索日志] 初步筛选出 {len(similar_articles)} 篇相似文章。")

        # --- 帖子处理 ---
        posts_query = Post.query.options(db.joinedload(Post.author)).filter(
            Post.publication_status == 'published',
            # Post.is_deleted == False  # Post 模型没有 is_deleted 字段，暂时移除此条件
        )
        # posts_query = posts_query.filter(Post.title.ilike(f"%{query_param}%")) # 示例

        all_posts = posts_query.all()
        current_app.logger.info(f"[搜索日志] 从数据库获取到 {len(all_posts)} 篇已发布的帖子。")
        if not all_posts:
            current_app.logger.info("[搜索日志] 没有找到任何已发布的帖子。")

        similar_posts = []
        for post in all_posts:
            # content_to_compare = (post.content[:500] + '...') if post.content and len(post.content) > 500 else post.content # MODIFIED: 只与标题比较，移除内容比较逻辑
            # Post 模型没有 summary 字段，直接使用 content
            # if not content_to_compare:
            #     current_app.logger.debug(f"[搜索日志] 帖子 ID {post.id} ('{post.title}') 无有效内容进行比较，跳过。")
            #     continue
            
            # similarity_score = calculate_similarity_py(query_param, post.title + " " + (content_to_compare or "")) # OLD LOGIC
            similarity_score = calculate_similarity_py(query_param, post.title) # NEW: 只比较标题
            current_app.logger.debug(f"[搜索日志] 帖子 ID {post.id} ('{post.title}') 与查询 '{query_param}' 的标题相似度分数为: {similarity_score:.4f}")
            if similarity_score > 0.1: # 示例阈值
                author_nickname = post.author.nickname if post.author else "佚名"
                similar_posts.append({
                'id': post.id,
                'title': post.title,
                'slug': post.slug,
                    'content': post.content[:150] if post.content else '', # 返回部分内容
                    'cover_image': post.cover_image, # 假设帖子也有封面图字段
                    'author_nickname': author_nickname,
                    'created_at': post.created_at.isoformat() if post.created_at else None,
                    'score': similarity_score,
                    'type': 'post'
                })
        
        current_app.logger.info(f"[搜索日志] 初步筛选出 {len(similar_posts)} 篇相似帖子。")

        # --- 合并、排序和限制结果 ---
        combined_results = similar_articles + similar_posts
        # 按相似度得分降序排序
        sorted_results = sorted(combined_results, key=lambda x: x['score'], reverse=True)
        
        final_results = sorted_results[:limit_param]
        current_app.logger.info(f"[搜索日志] 最终合并、排序并限制到 {len(final_results)} 条结果。")
        for res_idx, res_item in enumerate(final_results):
            current_app.logger.debug(f"[搜索日志] 最终结果 {res_idx+1}: 类型='{res_item['type']}', ID={res_item['id']}, 标题='{res_item['title']}', 分数={res_item['score']:.4f}")


        return jsonify({
            'articles': [res for res in final_results if res['type'] == 'article'],
            'posts': [res for res in final_results if res['type'] == 'post']
        })

    except Exception as e:
        current_app.logger.error(f"[搜索日志] 处理搜索请求时发生错误: {e}", exc_info=True)
        return jsonify({'error': '处理搜索请求时发生内部错误', 'details': str(e)}), 500

def find_similar_content_py(query_text: str, top_n: int = 5):
    # print(f"[DEBUG] find_similar_content_py called with query: {query_text}")
    results = {'articles': [], 'posts': []}
    
    # Search in Articles
    # Ensure author relationship is loaded to avoid N+1 queries if accessing author.username later
    articles = Article.query.options(db.joinedload(Article.author_user)).all() 
    article_similarities = []
    for article in articles:
        similarity_score = jellyfish.jaro_winkler_similarity(query_text.lower(), article.title.lower())
        if article.summary: # Prioritize existing summary
            similarity_score_summary = jellyfish.jaro_winkler_similarity(query_text.lower(), article.summary.lower())
            similarity_score = max(similarity_score, similarity_score_summary * 0.8) # Summary has lower weight
        elif article.content: # Fallback to content if no summary
            similarity_score_content = jellyfish.jaro_winkler_similarity(query_text.lower(), article.content[:200].lower()) # Compare with first 200 chars of content
            similarity_score = max(similarity_score, similarity_score_content * 0.7) # Content has even lower weight

        if similarity_score > 0.7: # Adjust threshold as needed
            article_data = {
                'id': article.id,
                'title': article.title,
                'slug': article.slug,
                'type': 'article',
                'score': similarity_score,
                'cover_image': article.cover_image,
                'author_username': article.author_user.username if article.author_user else '未知作者',
                'created_at': article.created_at.isoformat() + 'Z' if article.created_at else None,
                'summary': article.summary if article.summary else (article.content[:100] + '...' if article.content and len(article.content) > 100 else article.content)
            }
            article_similarities.append(article_data)

    # Sort articles by similarity score in descending order and take top_n
    results['articles'] = sorted(article_similarities, key=lambda x: x['score'], reverse=True)[:top_n]

    # Search in Posts
    # Ensure author relationship is loaded
    posts = Post.query.options(db.joinedload(Post.author)).all()
    post_similarities = []
    for post in posts:
        similarity_score = jellyfish.jaro_winkler_similarity(query_text.lower(), post.title.lower())
        # Posts don't have a dedicated summary field, so we use content
        if post.content:
            similarity_score_content = jellyfish.jaro_winkler_similarity(query_text.lower(), post.content[:200].lower())
            similarity_score = max(similarity_score, similarity_score_content * 0.7)

        if similarity_score > 0.7: # Adjust threshold as needed
            post_data = {
                'id': post.id,
                'title': post.title,
                'slug': post.slug,
                'type': 'post',
                'score': similarity_score,
                # Posts might not have cover_image in the same way, adjust if necessary
                # 'cover_image': post.cover_image, 
                'author_username': post.author.username if post.author else '未知作者',
                'created_at': post.created_at.isoformat() + 'Z' if post.created_at else None,
                'summary': post.content[:100] + '...' if post.content and len(post.content) > 100 else post.content
            }
            post_similarities.append(post_data)
            
    # Sort posts by similarity score in descending order and take top_n
    results['posts'] = sorted(post_similarities, key=lambda x: x['score'], reverse=True)[:top_n]
    
    # print(f"[DEBUG] find_similar_content_py results: {results}")
    return results 