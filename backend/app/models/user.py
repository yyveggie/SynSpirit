# backend/app/models/user.py
"""
定义用户模型 (User)。
用于存储用户信息，包括邮箱、密码哈希、昵称、状态、角色、登录信息、头像等。
同时包含 Flask-Login 所需的 user_loader 函数。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db, login_manager
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship
from sqlalchemy import UniqueConstraint
# --- 新增：导入 PostComment 以引用其列 --- 
from .post_comment import PostComment 
# --- 结束新增 ---
from flask import current_app

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    nickname = db.Column(db.String(50), nullable=True, index=True)
    is_active = db.Column(db.Boolean, default=True)
    is_admin = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    bio = db.Column(db.Text, nullable=True)
    avatar = db.Column(db.String(255), nullable=True) # 添加用户头像字段
    tags = db.Column(db.JSON, nullable=True, default=list)
    
    # 关系
    # backref='author_user' in Article model links articles here
    articles = db.relationship('Article', backref='author_user', lazy='dynamic')
    
    # backref='user' in Comment model links legacy comments here
    # legacy_comments relationship established by backref='legacy_comments' in Comment model

    conversations = db.relationship('Conversation', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    # backref='user' in Dynamic model links dynamics here
    # dynamics relationship established by backref='user' in Dynamic model

    # backref='user' in UserAction model links actions here
    # actions relationship established by backref='actions' in UserAction model

    # backref='user' in ActionInteraction model links action interactions here
    # action_interactions relationship established by backref='action_interactions' in ActionInteraction model

    # backref='user' in ActionComment model links action comments here
    # action_comments relationship established by backref='action_comments' in ActionComment model

    # backref='author' in Answer model links answers here
    # answers relationship established by backref='answers' in Answer model

    # backref='author' in Post model links posts here
    # posts relationship established by backref='posts' in Post model
    
    # post_comments relationship needs to be explicitly defined if not using backref in PostComment
    # --- 修改：使用正确的 foreign_keys 语法 --- 
    post_comments = db.relationship(
        'PostComment',
        # foreign_keys='[PostComment.user_id]', # 错误语法：这是字符串
        foreign_keys=[PostComment.user_id], # 正确语法：直接引用列对象
        back_populates='user', # 与 PostComment.user 关联
        lazy='dynamic'
    )
    # --- 结束修改 ---
    
    # 添加topic_positions关系，与UserTopicPosition的user关联
    topic_positions = db.relationship('UserTopicPosition', back_populates='user', lazy='dynamic')
    
    # 添加收藏主题关系，与UserFavoriteTopic的user关联
    favorite_topics_rel = db.relationship('UserFavoriteTopic', back_populates='user', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    # Flask-Login required method
    def get_id(self):
        return str(self.id)

    def to_dict(self):
        # Full user details, maybe restrict for security
        return {
            'id': self.id,
            'email': self.email,
            'nickname': self.nickname,
            'is_active': self.is_active,
            'is_admin': self.is_admin,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'bio': self.bio,
            'avatar': self.avatar,
            'tags': self.tags or []
        }
    
    def __repr__(self):
        return f'<User {self.email}>'

    def to_public_dict(self):
        """返回用户的公开信息字典，不包含敏感数据"""
        return {
            'id': self.id,
            'nickname': self.nickname or f'User{self.id}', # 如果没有昵称，提供一个默认值
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'bio': self.bio,
            'avatar': self.avatar,
            'tags': self.tags or []
            # 注意：不返回 email, is_active, is_admin, last_login, updated_at 等
        }

    def to_dict_basic(self):
        # Minimal user details for embedding in other objects
        return {
            'id': self.id,
            'nickname': self.nickname or self.email.split('@')[0],
            'email': self.email, 
            'avatar': self.avatar,
            'bio': self.bio,
            'tags': self.tags or []
        }

# 新增模型：用户收藏的主题
class UserFavoriteTopic(db.Model):
    """
    存储用户收藏的主题关系。
    
    记录哪个用户收藏了哪个主题。
    """
    __tablename__ = 'user_favorite_topics'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 定义联合唯一约束，确保一个用户对一个主题只能收藏一次
    __table_args__ = (UniqueConstraint('user_id', 'topic_id', name='uq_user_favorite_topic'),)
    
    # 关系 (修改为back_populates)
    user = relationship('User', back_populates='favorite_topics_rel')
    topic = relationship('Topic', back_populates='favorited_by')
    
    def __repr__(self):
        return f'<UserFavoriteTopic User:{self.user_id} Topic:{self.topic_id}>' 

# --- 新增：用户关注关系模型 ---
class UserFollow(db.Model):
    """
    存储用户之间的关注关系。
    
    记录哪个用户 (follower) 关注了哪个用户 (followed)。
    """
    __tablename__ = 'user_follows'
    
    follower_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False, index=True)
    followed_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 添加外键关系 (可选但推荐，便于查询)
    # 使用 backref 定义反向关系，方便从 User 模型查询
    follower = db.relationship(
        'User', 
        foreign_keys=[follower_id], 
        backref=db.backref('following_rel', lazy='dynamic', cascade='all, delete-orphan')
    )
    followed = db.relationship(
        'User', 
        foreign_keys=[followed_id], 
        backref=db.backref('followers_rel', lazy='dynamic', cascade='all, delete-orphan')
    )
    
    # 联合主键隐式包含唯一约束
    # __table_args__ = (UniqueConstraint('follower_id', 'followed_id', name='uq_user_follow'),) # 如果不用联合主键，则需要这个

    def __repr__(self):
        return f'<UserFollow Follower:{self.follower_id} Followed:{self.followed_id}>'
# --- 结束新增 --- 