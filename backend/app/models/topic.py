# backend/app/models/topic.py
"""
定义主题模型 (Topic) 和用户主题位置模型 (UserTopicPosition)。
Topic用于知识图谱/概念地图中的节点，包含名称、描述、位置和样式信息。
UserTopicPosition用于存储每个用户对主题节点的自定义位置。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
import slugify
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

# 不再需要导入TopicRelation模型
# from .topic_relation import TopicRelation  # 导入已存在的 TopicRelation 模型

Base = declarative_base()

class Topic(db.Model):
    __tablename__ = 'topics'
    __searchable__ = ['name', 'description'] # 用于全文搜索
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    slug = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    
    # 位置信息 (默认坐标)
    pos_x = db.Column(db.Float, nullable=False, default=0)
    pos_y = db.Column(db.Float, nullable=False, default=0)
    
    # 样式信息 (可定制节点外观)
    style_bgcolor = db.Column(db.String(20), default='#ffffff')
    style_fgcolor = db.Column(db.String(20), default='#333333')
    style_width = db.Column(db.Integer, default=70) # 宽度，像素
    style_height = db.Column(db.Integer, default=70) # 高度，像素
    style_shape = db.Column(db.String(20), default='rectangle') # 形状: rectangle, circle 等
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系定义 - 不再需要
    # source_relations = db.relationship('TopicRelation', foreign_keys='TopicRelation.source_topic_id', backref='source_topic', lazy='dynamic', cascade='all, delete-orphan')
    # target_relations = db.relationship('TopicRelation', foreign_keys='TopicRelation.target_topic_id', backref='target_topic', lazy='dynamic', cascade='all, delete-orphan')
    
    # 关联的帖子 - 修改backref为back_populates，避免冲突
    posts = db.relationship('Post', back_populates='topic', lazy='dynamic')
    
    # 关联的用户位置数据，使用back_populates防止重复定义
    user_positions = db.relationship('UserTopicPosition', back_populates='topic', lazy='dynamic', cascade='all, delete-orphan')
    
    # 被用户收藏 - 修改为back_populates
    favorited_by = db.relationship('UserFavoriteTopic', back_populates='topic', lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'pos_x': self.pos_x,
            'pos_y': self.pos_y,
            'style': {
                'backgroundColor': self.style_bgcolor,
                'color': self.style_fgcolor,
                'width': self.style_width,
                'height': self.style_height,
                'shape': self.style_shape
            },
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
        
    def to_minimal_dict(self):
        """
        返回主题的精简信息，适用于列表展示
        """
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'pos_x': self.pos_x,
            'pos_y': self.pos_y,
            'style_bgcolor': self.style_bgcolor,
            'style_fgcolor': self.style_fgcolor,
            'style_shape': self.style_shape
        }

    def __repr__(self):
        return f'<Topic {self.id} {self.name}>'

# 新增模型：存储用户特定的主题节点位置
class UserTopicPosition(db.Model):
    """
    存储用户特定的主题节点位置
    
    此模型允许每个用户为每个主题节点保存自定义的位置，实现个性化布局。
    当用户第一次访问社区页面时，将使用主题默认位置。
    当用户移动节点后，新位置将被保存在此表中。
    后续访问时，系统将优先使用此表中存储的位置信息。
    """
    __tablename__ = 'user_topic_positions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id', ondelete='CASCADE'), nullable=False)
    pos_x = db.Column(db.Float, nullable=False)
    pos_y = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系定义，使用back_populates与父模型匹配
    user = db.relationship('User', back_populates='topic_positions')
    topic = db.relationship('Topic', back_populates='user_positions')
    
    # 确保每个用户对每个主题只有一个位置记录
    __table_args__ = (db.UniqueConstraint('user_id', 'topic_id', name='uix_user_topic_position'),)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'topic_id': self.topic_id,
            'pos_x': self.pos_x,
            'pos_y': self.pos_y,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        } 