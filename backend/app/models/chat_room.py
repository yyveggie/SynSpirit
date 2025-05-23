"""
定义聊天室模型 (ChatRoom)。
用于存储社区主题的聊天室信息。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from flask import current_app
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class ChatRoom(db.Model):
    """
    聊天室模型，用于存储社区主题的聊天室信息。
    主要字段：
    - id: 唯一标识符
    - name: 聊天室名称
    - topic_id: 关联的普通主题ID
    - description: 聊天室描述
    - is_active: 是否活跃
    - created_at: 创建时间
    - updated_at: 更新时间
    """
    __tablename__ = 'chat_rooms'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    topic = db.relationship('Topic', backref='chat_rooms')
    messages = db.relationship('ChatMessage', backref='chat_room', lazy='dynamic', 
                              cascade='all, delete-orphan', order_by="ChatMessage.created_at")

    # 添加索引优化查询
    __table_args__ = (
        db.Index('ix_chat_rooms_topic_id', 'topic_id'),
    )

    def to_dict(self):
        """
        将聊天室对象转换为字典
        :return: 包含聊天室信息的字典
        """
        return {
            'id': self.id,
            'name': self.name,
            'topic_id': self.topic_id,
            'topic_name': self.topic.name if self.topic else None,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'message_count': self.messages.count()
        }
    
    @classmethod
    def get_or_create(cls, topic_id, name=None, description=None):
        """
        获取或创建聊天室。
        :param topic_id: 主题ID
        :param name: 聊天室名称（可选）
        :param description: 聊天室描述（可选）
        :return: 聊天室对象或 None
        """
        from app.models import Topic
        
        if topic_id is None:
            raise ValueError("必须提供 topic_id")

            parent_topic = Topic.query.get(topic_id)
        
        if not parent_topic:
            current_app.logger.warning(f"尝试为不存在的主题创建聊天室: topic_id={topic_id}")
            return None
            
        # 如果未提供名称，则使用主题名称
        if not name:
            name = f"{parent_topic.name}讨论"
            
        # 检查是否已存在该主题的聊天室
        chat_room = cls.query.filter_by(topic_id=topic_id).first()
        if chat_room:
            return chat_room
            
        # 创建新聊天室
        chat_room = cls(
            name=name,
            topic_id=topic_id,
            description=description or f"{parent_topic.name}的社区讨论"
        )
        db.session.add(chat_room)
        db.session.commit()
        return chat_room
    
    def __repr__(self):
            return f'<ChatRoom {self.id}: {self.name} (Topic: {self.topic_id})>'