# backend/app/models/article.py
"""
定义文章模型 (Article)。
用于存储用户发布的文章，包含标题、内容、摘要、分类、标签、作者、封面图、向量嵌入、阅读量、系列信息等。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Index, event
from sqlalchemy.orm import relationship
from flask import current_app, request
from .user_action import UserAction
# 导入缓存管理器
from app.utils.cache_manager import DataCache, CounterCache, KEY_PREFIX, TTL

class Article(db.Model):
    __tablename__ = 'articles'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    summary = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    tags = db.Column(JSONB, nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    cover_image = db.Column(db.String(255))
    vector_embedding = db.Column(Vector(1536), nullable=True)
    slug = db.Column(db.String(200), nullable=True, unique=True, index=True)
    is_published = db.Column(db.Boolean, default=True)
    view_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    likes_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    collects_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    shares_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    comments_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    answers_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Add series fields
    series_name = db.Column(db.String(200), nullable=True, index=True)
    series_order = db.Column(db.Integer, nullable=True)

    # Add relationship to User (defined via backref in User model)
    # author_user relationship established by backref='articles' in User model
    
    # Add relationship to comments
    comments = db.relationship('Comment', backref='article', lazy='dynamic', cascade="all, delete-orphan")
    
    # Add relationship to answers
    answers = db.relationship('Answer', backref='article', lazy='dynamic', cascade='all, delete-orphan')

    # Add relationship to dynamics (defined via backref in Dynamic model)
    # dynamics_shared relationship established by backref='article' in Dynamic model
    
    # Add relationship to UserAction
    actions = relationship(
        'UserAction',
        lazy='dynamic',
        primaryjoin="and_(UserAction.target_type=='article', UserAction.target_id==Article.id)",
        foreign_keys="[UserAction.target_id]",
        viewonly=True
    )
    
    def to_dict(self, include_content=True):
        author_data = None
        if hasattr(self, 'author_user') and self.author_user:
            author_data = self.author_user.to_dict_basic()
        
        final_cover_image_url = self.cover_image
        if self.cover_image and not (self.cover_image.startswith('http://') or self.cover_image.startswith('https://')):
            try:
                # Use current_app only within a request context
                base_url = None
                if request: 
                    base_url = request.host_url.rstrip('/')
                # Fallback to config if not in request context (e.g., background task)
                elif current_app:
                    server_name = current_app.config.get('SERVER_NAME') or current_app.config.get('HOST_URL')
                    if server_name:
                        scheme = current_app.config.get('PREFERRED_URL_SCHEME', 'https')
                        base_url = f"{scheme}://{server_name.rstrip('/')}"
                
                if base_url:
                    final_cover_image_url = f"{base_url}{self.cover_image}"
                elif current_app:
                    current_app.logger.warning(f"无法确定文章 {self.id} 封面图的完整 URL，cover_image: {self.cover_image}")
            except RuntimeError:
                 # Handle cases where app context might not be available
                 pass 
        
        data = {
            'id': self.id,
            'title': self.title,
            'summary': self.summary,
            'category': self.category,
            'tags': self.tags if self.tags else [],
            'author': author_data,
            'cover_image': final_cover_image_url,
            'slug': self.slug,
            'is_published': self.is_published,
            'view_count': self.view_count,
            'likes_count': self.likes_count,
            'collects_count': self.collects_count,
            'shares_count': self.shares_count,
            'comments_count': self.comments_count,
            'answers_count': self.answers_count,
            'created_at': self.created_at.isoformat() + 'Z', # Add Z for UTC indication
            'updated_at': self.updated_at.isoformat() + 'Z', # Add Z for UTC indication
            'series_name': self.series_name,
            'series_order': self.series_order
        }
        
        if include_content:
            data['content'] = self.content
            
        return data
    
    def __repr__(self):
        user_id_repr = self.user_id if self.user_id else '[No User]'
        return f'<Article {self.title} by User {user_id_repr}>'

    def update_cache(self):
        """更新文章相关缓存"""
        try:
            # 失效文章详情缓存
            DataCache.invalidate(KEY_PREFIX['ARTICLE'], self.id)
            
            # 失效文章列表相关缓存
            DataCache.invalidate_group(f'article_list_user_{self.user_id}')
            DataCache.invalidate_group('article_list_all')
            
            # 如果有分类，失效分类相关缓存
            if self.category:
                DataCache.invalidate_group(f'article_category_{self.category}')
            
            # 如果有系列，失效系列相关缓存
            if self.series_name:
                DataCache.invalidate_group(f'article_series_{self.series_name}')
                
            # 同步计数器缓存到文章属性
            for counter_type in ['likes', 'views', 'comments', 'collects', 'shares']:
                cached_count = CounterCache.get(counter_type, 'article', self.id)
                if cached_count is not None:
                    setattr(self, f"{counter_type}_count", cached_count)
            
            current_app.logger.info(f"文章缓存已更新: Article#{self.id}")
            return True
        except Exception as e:
            current_app.logger.error(f"文章缓存更新失败 Article#{self.id}: {e}")
            return False
    
    def increment_view_count(self):
        """增加文章浏览量，使用缓存"""
        try:
            # 使用CounterCache原子操作增加计数
            new_count = CounterCache.increment('views', 'article', self.id)
            
            # 设定周期性同步到数据库
            # 注意：实际同步由后台任务执行，这里只更新内存中的计数
            self.view_count = new_count
            
            return new_count
        except Exception as e:
            current_app.logger.error(f"增加文章浏览量失败 Article#{self.id}: {e}")
            # 回退到直接更新数据库
            self.view_count += 1
            db.session.commit()
            return self.view_count

# 添加SQLAlchemy事件监听器，实现自动缓存管理
@event.listens_for(Article, 'after_update')
def article_after_update(mapper, connection, target):
    """文章更新后，触发缓存更新"""
    # 使用应用上下文执行缓存操作
    try:
        with current_app.app_context():
            target.update_cache()
    except Exception as e:
        print(f"文章更新后缓存刷新失败: {e}")

@event.listens_for(Article, 'after_delete')
def article_after_delete(mapper, connection, target):
    """文章删除后，清除相关缓存"""
    try:
        with current_app.app_context():
            # 删除文章详情缓存
            DataCache.invalidate(KEY_PREFIX['ARTICLE'], target.id)
            
            # 删除文章列表相关缓存
            DataCache.invalidate_group(f'article_list_user_{target.user_id}')
            DataCache.invalidate_group('article_list_all')
            
            # 删除文章计数器缓存
            for counter_type in ['likes', 'views', 'comments', 'collects', 'shares']:
                CounterCache.set(counter_type, 'article', target.id, 0, ttl=1)  # 设置为0并快速过期
            
            current_app.logger.info(f"文章删除，缓存已清理: Article#{target.id}")
    except Exception as e:
        print(f"文章删除后缓存清理失败: {e}")

# Add composite index for user series lookups
# Need to import the actual Article class for this
# Moved to __init__.py or a separate indexes.py if preferred
# db.Index('ix_article_user_series', Article.user_id, Article.series_name) 