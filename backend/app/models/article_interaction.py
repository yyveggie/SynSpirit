from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app import db

class ArticleInteraction(db.Model):
    """文章交互模型，记录用户与文章的点赞、收藏等交互操作"""
    __tablename__ = 'article_interactions'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    article_id = Column(Integer, ForeignKey('articles.id', ondelete='CASCADE'), nullable=False)
    interaction_type = Column(String(20), nullable=False)  # 'like' 或 'collect'
    created_at = Column(TIMESTAMP, default=func.now())

    # 关系
    user = relationship('User', backref='article_interactions')
    article = relationship('Article', backref='interactions')

    # 唯一约束，确保用户对同一文章的同一类型交互只有一条记录
    __table_args__ = (
        UniqueConstraint('user_id', 'article_id', 'interaction_type', name='unique_article_interaction'),
    )

    def __repr__(self):
        return f"<ArticleInteraction(user_id={self.user_id}, article_id={self.article_id}, type={self.interaction_type})>"
    
    @classmethod
    def get_user_interactions(cls, user_id, interaction_type=None):
        """获取指定用户的所有文章交互"""
        query = cls.query.filter_by(user_id=user_id)
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        return query.order_by(cls.created_at.desc()).all()
    
    @classmethod
    def get_article_interactions(cls, article_id, interaction_type=None):
        """获取指定文章的所有用户交互"""
        query = cls.query.filter_by(article_id=article_id)
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        return query.all()
    
    @classmethod
    def has_interaction(cls, user_id, article_id, interaction_type):
        """检查用户是否对文章有指定类型的交互"""
        return cls.query.filter_by(
            user_id=user_id, 
            article_id=article_id, 
            interaction_type=interaction_type
        ).first() is not None 