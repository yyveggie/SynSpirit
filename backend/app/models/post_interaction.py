from sqlalchemy import Column, Integer, String, ForeignKey, TIMESTAMP, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app import db

class PostInteraction(db.Model):
    """帖子交互模型，记录用户与帖子的点赞、收藏等交互操作"""
    __tablename__ = 'post_interactions'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    post_id = Column(Integer, ForeignKey('posts.id', ondelete='CASCADE'), nullable=False)
    interaction_type = Column(String(20), nullable=False)  # 'like' 或 'collect'
    created_at = Column(TIMESTAMP, default=func.now())

    # 关系
    user = relationship('User', backref='post_interactions')
    post = relationship('Post', backref='interactions')

    # 唯一约束，确保用户对同一帖子的同一类型交互只有一条记录
    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', 'interaction_type', name='unique_post_interaction'),
    )

    def __repr__(self):
        return f"<PostInteraction(user_id={self.user_id}, post_id={self.post_id}, type={self.interaction_type})>"
    
    @classmethod
    def get_user_interactions(cls, user_id, interaction_type=None):
        """获取指定用户的所有帖子交互"""
        query = cls.query.filter_by(user_id=user_id)
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        return query.order_by(cls.created_at.desc()).all()
    
    @classmethod
    def get_post_interactions(cls, post_id, interaction_type=None):
        """获取指定帖子的所有用户交互"""
        query = cls.query.filter_by(post_id=post_id)
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        return query.all()
    
    @classmethod
    def has_interaction(cls, user_id, post_id, interaction_type):
        """检查用户是否对帖子有指定类型的交互"""
        return cls.query.filter_by(
            user_id=user_id, 
            post_id=post_id, 
            interaction_type=interaction_type
        ).first() is not None 