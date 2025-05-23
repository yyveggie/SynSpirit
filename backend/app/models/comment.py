# backend/app/models/comment.py
"""
定义文章评论模型 (Comment)。
用于存储用户对整篇文章的评论，支持层级回复。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey, Table, text # 导入 text
from sqlalchemy.orm import relationship
import sqlalchemy as sa # 确保导入 sqlalchemy
# --- 移除循环导入 ---
# from . import comment_likes 

# --- 新增：将 comment_likes 定义移到这里 --- 
comment_likes = Table('comment_likes', db.metadata, # 使用 db.metadata
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True),
    db.Column('comment_id', db.Integer, db.ForeignKey('comments.id', ondelete='CASCADE'), primary_key=True),
    db.Column('created_at', db.DateTime, default=datetime.utcnow)
)
# --- 结束新增 ---

# 恢复原始 Comment 模型 (用于文章整体评论/回复)
class Comment(db.Model):
    __tablename__ = 'comments'

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Foreign Keys
    article_id = db.Column(db.Integer, db.ForeignKey('articles.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('comments.id', ondelete='CASCADE'), nullable=True, index=True)
    
    # --- 新增 is_deleted 字段 ---
    is_deleted = db.Column(db.Boolean, nullable=False, default=False, server_default=text('false'))
    # --- 结束新增 ---
    
    # --- 新增：点赞计数字段 ---
    likes_count = db.Column(db.Integer, default=0, nullable=False, index=True)
    # --- 结束新增 ---
    
    # --- 新增：AI生成标记字段 ---
    is_ai_generated = db.Column(db.Boolean, default=False, nullable=False, server_default=text('false'))
    # --- 结束新增 ---
    
    # 保留其他关系
    user = db.relationship('User', backref=db.backref('legacy_comments', lazy='dynamic'))
    replies = db.relationship("Comment", 
                            backref=db.backref('parent_comment', remote_side=[id]),
                            lazy='dynamic', 
                            cascade="all, delete-orphan")
    likers = db.relationship(
        'User',
        secondary=comment_likes,
        backref=db.backref('liked_comments', lazy='dynamic'),
        lazy='dynamic'
    )

    # --- 修改 to_dict 以包含点赞信息 ---
    def to_dict(self, include_replies=True, current_user_id=None, is_liked=False):
        user_info = None
        if self.is_ai_generated: # 新增：AI生成的评论特殊处理
            user_info = {
                'id': -1, # 特殊ID，例如 -1 代表 AI
                'nickname': 'Lynn', # AI 的专属昵称
                'avatar': 'https://ui-avatars.com/api/?name=L&background=8A2BE2&color=fff&size=200&bold=true&rounded=true', # AI 的专属头像
                'email': None # AI 没有邮箱
            }
        elif self.user:
            user_info = {
                'id': self.user.id,
                'nickname': self.user.nickname or self.user.email.split('@')[0],
                'email': self.user.email,
                'avatar': self.user.avatar
            }
        
        data = {
            'id': self.id,
            'content': '[该评论已删除]' if getattr(self, 'is_deleted', False) else self.content,
            'created_at': self.created_at.isoformat() + 'Z',
            'article_id': self.article_id,
            'user_id': self.user_id if not self.is_ai_generated else -1, # 如果是AI，user_id也用特殊值
            'parent_id': self.parent_id,
            'user': user_info,
            'like_count': self.likes_count,
            'is_liked_by_current_user': is_liked,
            'is_deleted': getattr(self, 'is_deleted', False),
            'is_ai_generated': getattr(self, 'is_ai_generated', False)
        }

        if include_replies:
            # 直接查询子评论
            child_comments = Comment.query.filter_by(parent_id=self.id).order_by(Comment.created_at.asc()).all()
            replies_data = []
            for reply in child_comments:
                 # 改进：获取子评论的真实点赞状态
                 reply_is_liked_by_current_user = False
                 if current_user_id:
                     # 检查当前用户是否点赞了这条回复
                     # 注意：这里假设 reply.likers 是一个可查询的关系
                     if reply.likers.filter(comment_likes.c.user_id == current_user_id).first():
                         reply_is_liked_by_current_user = True
                 
                 replies_data.append(reply.to_dict(include_replies=True, current_user_id=current_user_id, is_liked=reply_is_liked_by_current_user))
            data['replies'] = replies_data
            
        return data
    # --- 结束修改 ---

    def __repr__(self):
        parent_info = f" (Reply to {self.parent_id})" if self.parent_id else ""
        user_info = f"User {self.user_id}" if self.user_id else "Anonymous"
        return f'<Comment {self.id} on Article {self.article_id} by {user_info}{parent_info}>' 