# backend/app/models/answer.py
"""
定义回答模型 (Answer)。
用于存储用户对文章（可能作为问题提出）的回答。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class Answer(db.Model):
    __tablename__ = 'answers'

    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False) # 回答内容 (HTML)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    upvotes = db.Column(db.Integer, default=0)
    # 可以添加 comments_count 等字段

    # 外键
    article_id = db.Column(db.Integer, db.ForeignKey('articles.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # 关系
    # article relationship established by backref='answers' in Article model
    author = db.relationship('User', backref=db.backref('answers', lazy='dynamic'))

    def to_dict(self):
        author_info = self.author.to_dict_basic() if self.author else None
        # article_info = self.article.to_dict(include_content=False) if self.article else None
        
        return {
            'id': self.id,
            'content': self.content,
            'created_at': self.created_at.isoformat() + 'Z', # Add Z for UTC indication
            'updated_at': self.updated_at.isoformat() + 'Z', # Add Z for UTC indication
            'upvotes': self.upvotes,
            'article_id': self.article_id,
            'user_id': self.user_id,
            'author': author_info
            # 'article': article_info
        }

    def __repr__(self):
        return f'<Answer {self.id} for Article {self.article_id} by User {self.user_id}>' 