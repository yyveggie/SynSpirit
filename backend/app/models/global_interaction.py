"""
定义全局交互模型 (GlobalInteraction)。
用于统一管理用户对文章、帖子和动态的点赞和收藏记录，提供统一的接口进行查询。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, func, or_, and_
from sqlalchemy.orm import relationship


class GlobalInteraction(db.Model):
    """
    全局用户交互模型，记录用户与各类内容(文章、帖子、动态)的交互操作(点赞、收藏)
    使用统一的数据表格式存储不同类型的交互，便于统一查询
    """
    __tablename__ = 'global_interactions'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    content_type = Column(String(20), nullable=False, index=True)  # 'article', 'post', 'action'
    content_id = Column(Integer, nullable=False, index=True)
    interaction_type = Column(String(20), nullable=False, index=True)  # 'like' 或 'collect'
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # 关系
    user = relationship('User', backref='global_interactions')
    
    # 唯一约束，确保用户对同一内容的同一类型交互只有一条记录
    __table_args__ = (
        UniqueConstraint('user_id', 'content_type', 'content_id', 'interaction_type', 
                         name='unique_global_interaction'),
    )

    def __repr__(self):
        return f"<GlobalInteraction(user_id={self.user_id}, {self.content_type}_id={self.content_id}, type={self.interaction_type})>"
    
    @classmethod
    def get_user_interactions(cls, user_id, content_type=None, interaction_type=None, page=1, per_page=20):
        """获取指定用户的所有交互，支持分页和过滤"""
        query = cls.query.filter_by(user_id=user_id)
        
        if content_type:
            query = query.filter_by(content_type=content_type)
        
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
        
        return query.order_by(cls.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    
    @classmethod
    def get_content_interactions(cls, content_type, content_id, interaction_type=None):
        """获取指定内容的所有交互"""
        query = cls.query.filter_by(content_type=content_type, content_id=content_id)
        
        if interaction_type:
            query = query.filter_by(interaction_type=interaction_type)
            
        return query.order_by(cls.created_at.desc()).all()
    
    @classmethod
    def has_interaction(cls, user_id, content_type, content_id, interaction_type):
        """检查用户是否对指定内容有特定类型的交互"""
        return cls.query.filter_by(
            user_id=user_id, 
            content_type=content_type,
            content_id=content_id,
            interaction_type=interaction_type
        ).first() is not None
    
    @classmethod
    def create_interaction(cls, user_id, content_type, content_id, interaction_type):
        """创建交互记录"""
        # 先检查是否已存在相同交互
        existing = cls.query.filter_by(
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            interaction_type=interaction_type
        ).first()
        
        if existing:
            return existing
        
        # 创建新交互
        new_interaction = cls(
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            interaction_type=interaction_type
        )
        
        try:
            db.session.add(new_interaction)
            db.session.commit()
            return new_interaction
        except Exception as e:
            db.session.rollback()
            raise e
    
    @classmethod
    def delete_interaction(cls, user_id, content_type, content_id, interaction_type):
        """删除交互记录"""
        interaction = cls.query.filter_by(
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            interaction_type=interaction_type
        ).first()
        
        if interaction:
            try:
                db.session.delete(interaction)
                db.session.commit()
                return True
            except Exception as e:
                db.session.rollback()
                raise e
        
        return False
    
    @classmethod
    def count_interactions(cls, content_type, content_id, interaction_type):
        """统计指定内容特定类型交互的数量"""
        return cls.query.filter_by(
            content_type=content_type,
            content_id=content_id,
            interaction_type=interaction_type
        ).count()
    
    @classmethod
    def get_user_liked_content_ids(cls, user_id, content_type):
        """获取用户点赞的某类内容的ID列表"""
        interactions = cls.query.filter_by(
            user_id=user_id,
            content_type=content_type,
            interaction_type='like'
        ).all()
        
        return [interaction.content_id for interaction in interactions]
    
    @classmethod
    def get_user_collected_content_ids(cls, user_id, content_type):
        """获取用户收藏的某类内容的ID列表"""
        interactions = cls.query.filter_by(
            user_id=user_id,
            content_type=content_type,
            interaction_type='collect'
        ).all()
        
        return [interaction.content_id for interaction in interactions] 