"""
定义聊天消息模型 (ChatMessage)。
用于存储社区主题聊天室中的消息，包括内容、发送者、所属聊天室等。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class ChatMessage(db.Model):
    """
    聊天消息模型，用于存储社区聊天室中的消息。
    主要字段：
    - id: 唯一标识符
    - content: 消息内容
    - chat_room_id: 关联的聊天室ID
    - user_id: 发送者用户ID
    - is_system_message: 是否为系统消息
    - created_at: 创建时间
    """
    __tablename__ = 'chat_messages'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    chat_room_id = db.Column(db.Integer, db.ForeignKey('chat_rooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # 允许匿名/系统消息
    is_system_message = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    # chat_room 关系由 ChatRoom.messages 的 backref 定义
    user = db.relationship('User', backref='chat_messages')
    
    def to_dict(self):
        """
        将聊天消息转换为字典
        :return: 包含消息信息的字典
        """
        # 获取用户基本信息（如果有）
        user_info = None
        if self.user:
            user_info = {
                'id': self.user.id,
                'username': self.user.username,
                'nickname': self.user.nickname,
                'avatar': self.user.avatar,
            }
            
        return {
            'id': self.id,
            'content': self.content,
            'chat_room_id': self.chat_room_id,
            'user_id': self.user_id,
            'user': user_info,
            'is_system_message': self.is_system_message,
            'created_at': self.created_at.isoformat()
        }
    
    @classmethod
    def add_message(cls, chat_room_id, content, user_id=None, is_system_message=False):
        """
        添加新消息
        :param chat_room_id: 聊天室ID
        :param content: 消息内容
        :param user_id: 用户ID（可选）
        :param is_system_message: 是否为系统消息（默认否）
        :return: 创建的消息对象
        """
        from app.models import ChatRoom
        
        # 验证聊天室是否存在
        chat_room = ChatRoom.query.get(chat_room_id)
        if not chat_room:
            return None
            
        # 创建新消息
        message = cls(
            content=content,
            chat_room_id=chat_room_id,
            user_id=user_id,
            is_system_message=is_system_message
        )
        db.session.add(message)
        db.session.commit()
        return message
    
    def to_realtime_format(self):
        """
        将消息转换为实时聊天前端所需的格式
        :return: 符合前端RealtimeChatMessage接口的字典
        """
        return {
            'id': str(self.id),
            'userId': self.user_id or 0,
            'username': self.user.nickname if self.user else '系统',
            'nickname': self.user.nickname if self.user else 'Lynn',
            'avatar': self.user.avatar if self.user else None,
            'message': self.content,
            'timestamp': self.created_at.isoformat() + 'Z',
            'is_system_message': self.is_system_message
        }
        
    def __repr__(self):
        return f'<ChatMessage {self.id} in Room {self.chat_room_id}>' 