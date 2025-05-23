# backend/app/models/message.py
"""
定义消息模型 (Message)。
用于存储对话中的单条消息，包含内容、角色（user/assistant/system）和所属对话。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False) # 'user', 'assistant', 'system'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship defined by backref='messages' in Conversation model
    # conversation relationship established by backref='messages' in Conversation model

    def to_dict(self):
        return {
            'id': self.id,
            'conversation_id': self.conversation_id,
            'role': self.role,
            'content': self.content,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else self.created_at.isoformat()
        }
    
    def __repr__(self):
        return f'<Message {self.id} in Conversation {self.conversation_id} - Role: {self.role}>' 