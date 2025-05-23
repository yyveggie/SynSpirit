# backend/app/models/conversation.py
"""
定义对话模型 (Conversation)。
用于组织和存储用户与AI或其他用户的对话记录，包含标题、关联用户、状态等。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=True) # 对话标题，可以从第一条消息自动生成
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True) # 关联用户，允许匿名对话
    is_active = db.Column(db.Boolean, default=True) # 是否活跃对话
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    # user relationship established by backref='conversations' in User model
    messages = db.relationship('Message', backref='conversation', lazy='dynamic', cascade='all, delete-orphan', order_by="Message.created_at")

    def to_dict(self):
        # Include basic user info if available
        user_info = None
        if self.user:
            user_info = self.user.to_dict_basic()
            
        return {
            'id': self.id,
            'title': self.title,
            'user_id': self.user_id,
            'user': user_info,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            # Optionally include a snippet of the last message or message count
            # 'last_message_snippet': self.messages.order_by(Message.created_at.desc()).first().content[:50] if self.messages else None
        }
    
    def __repr__(self):
        return f'<Conversation {self.id} - Title: {self.title}>' 