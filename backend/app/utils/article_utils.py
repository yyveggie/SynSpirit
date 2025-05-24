"""
文章工具模块

提供与文章模型(Article)相关的工具函数，包括：
- 更新文章浏览量
- 处理文章相关的缓存操作
- 统一文章交互逻辑处理

这个模块旨在减少代码重复，提高可维护性，并确保所有API端点使用一致的方法操作文章。
"""

from flask import current_app
from app import db
from app.models.article import Article
from app.utils.cache_manager import CounterCache
from sqlalchemy.orm import joinedload

def update_article_view_count(article):
    """
    更新文章浏览量
    
    使用Article模型的increment_view_count方法，该方法会优先使用缓存，
    失败时回退到直接数据库更新。这是更新文章浏览量的推荐方法。
    
    参数:
        article: Article对象实例
        
    返回:
        int: 更新后的浏览量
    """
    try:
        if not article:
            current_app.logger.error("update_article_view_count调用时传入了空的article对象")
            return 0
            
        # 使用Article模型的increment_view_count方法增加浏览量
        # 该方法优先使用缓存，失败时回退到直接更新数据库
        new_count = article.increment_view_count()
        current_app.logger.info(f"文章浏览量已更新: ID={article.id}, slug={article.slug}, 新浏览量={new_count}")
        return new_count
    except Exception as e:
        current_app.logger.error(f"更新文章浏览量失败: {e}")
        # 异常情况下回退到直接更新（虽然increment_view_count已有回退机制）
        try:
            # 尝试直接更新数据库
            article.view_count = (article.view_count or 0) + 1
            db.session.commit()
            return article.view_count
        except Exception as inner_e:
            current_app.logger.error(f"回退更新文章浏览量失败: {inner_e}")
            db.session.rollback()
            return article.view_count or 0

def get_article_by_slug(slug, include_deleted=False):
    """
    通过slug获取文章，预加载作者信息
    
    参数:
        slug: 文章的slug标识
        include_deleted: 是否包含已删除的文章（默认不包含）
        
    返回:
        Article对象或None
    """
    query = Article.query.options(joinedload(Article.author_user))
    
    if not include_deleted:
        query = query.filter(Article.is_deleted == False)
        
    return query.filter_by(slug=slug).first()

def get_article_by_id(article_id, include_deleted=False):
    """
    通过ID获取文章，预加载作者信息
    
    参数:
        article_id: 文章ID
        include_deleted: 是否包含已删除的文章（默认不包含）
        
    返回:
        Article对象或None
    """
    query = Article.query.options(joinedload(Article.author_user))
    
    if not include_deleted:
        query = query.filter(Article.is_deleted == False)
        
    return query.filter_by(id=article_id).first() 