# backend/app/models/action_comment.py
"""
定义用户动态评论模型 (ActionComment)。
用于存储用户对某个用户动态 (UserAction) 的评论，支持层级回复。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy import text

# 动态评论点赞关系表
action_comment_likes = db.Table(
    'action_comment_likes',
    db.Column('user_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    db.Column('comment_id', db.Integer, db.ForeignKey('action_comments.id', ondelete='CASCADE'), primary_key=True),
    db.Column('created_at', db.DateTime, default=datetime.utcnow)
)

class ActionComment(db.Model):
    __tablename__ = 'action_comments'
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action_id = db.Column(db.Integer, db.ForeignKey('user_actions.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('action_comments.id'), nullable=True) # 自关联，用于回复
    
    # --- 新增：软删除相关字段 ---
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    original_content = db.Column(db.Text, nullable=True) # 存储原始内容
    # --- 结束新增 ---

    # --- 新增：AI生成标记字段 (与 Comment/PostComment 模型保持一致) ---
    is_ai_generated = db.Column(db.Boolean, default=False, nullable=False, server_default=text('false'))
    # --- 结束新增 ---

    # --- 新增：被回复用户ID (用于区分AI回复的是哪个用户的评论) ---
    replied_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    # --- 结束新增 ---

    # 关系
    user = db.relationship('User', foreign_keys=[user_id], backref='action_comments')
    action = db.relationship('UserAction', backref='comments')
    # 修改：添加 cascade="all, delete-orphan" 以便在物理删除父评论时删除子评论（如果需要）
    # 注意：我们现在用软删除，所以这个 cascade 可能不是必须的，但保留通常是好的实践
    parent = db.relationship('ActionComment', remote_side=[id], backref=db.backref('replies', lazy='dynamic', cascade="all, delete-orphan"))

    # 点赞关系
    likers = db.relationship(
        'User',
        secondary=action_comment_likes,
        lazy='dynamic',
        backref=db.backref('liked_action_comments', lazy='dynamic')
    )

    def to_dict(self, include_replies=True):
        """将评论对象转换为字典表示形式，包含用户信息和回复评论

        Args:
            include_replies (bool, optional): 是否包含回复评论. Defaults to True.

        Returns:
            dict: 评论对象的字典表示
        """
        # --- 修改：为AI生成的评论提供专属用户信息 ---
        user_info_for_dict = None
        if self.is_ai_generated:
            user_info_for_dict = {
                'id': -1, 
                'nickname': 'Lynn', 
                'avatar': 'https://ui-avatars.com/api/?name=L&background=8A2BE2&color=fff&size=200&bold=true&rounded=true',
                'email': None
            }
        elif self.user: # 原有的用户逻辑
            user_info_for_dict = {
                'id': self.user.id,
                'nickname': self.user.nickname or (self.user.email.split('@')[0] if self.user.email else 'Unknown'),
                'email': self.user.email,
                'avatar': self.user.avatar
            }
        # --- 结束修改 ---
        
        # 获取点赞数
        likes_count = self.likers.count()
        
        # 尝试获取当前用户ID
        current_user_id = None
        try:
            current_user_id = get_jwt_identity()
        except:
            pass  # 无需处理异常
        
        # 检查当前用户是否点赞
        is_liked = False
        if current_user_id:
            is_liked = db.session.query(action_comment_likes).filter(
                action_comment_likes.c.user_id == current_user_id,
                action_comment_likes.c.comment_id == self.id
            ).first() is not None

        data = {
            'id': self.id,
            'content': '[该评论已删除]' if self.is_deleted else self.content,
            'created_at': self.created_at.isoformat(),
            'user_id': self.user_id,
            'action_id': self.action_id,
            'parent_id': self.parent_id,
            'user': user_info_for_dict,
            'is_deleted': self.is_deleted,
            'likes_count': likes_count,
            'is_liked': is_liked,
            'is_ai_generated': getattr(self, 'is_ai_generated', False),
            'replied_user_id': self.replied_user_id
        }
        
        if include_replies:
            replies_data = []
            for reply in self.replies.order_by(ActionComment.created_at.asc()):
                replies_data.append(reply.to_dict(include_replies=True))
            data['replies'] = replies_data
            
        return data

    def __repr__(self):
        deleted_status = " (deleted)" if self.is_deleted else ""
        return f'<ActionComment {self.id} by User {self.user_id} on Action {self.action_id}{deleted_status}>' 