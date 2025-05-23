# backend/app/models/dynamic.py
"""
定义动态模型 (Dynamic)。 (DEPRECATED? Superseded by UserAction?)
用于记录用户活动，如分享文章或工具，并附带评论。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class Dynamic(db.Model):
    __tablename__ = 'dynamics'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    action_type = db.Column(db.String(50), nullable=False, index=True) # e.g., 'SHARE_ARTICLE'
    target_article_id = db.Column(db.Integer, db.ForeignKey('articles.id'), nullable=True, index=True)
    target_tool_id = db.Column(db.Integer, db.ForeignKey('tools.id'), nullable=True, index=True)
    content = db.Column(db.Text, nullable=True) # User comment when sharing
    created_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now())

    # 关系 (与User, Article, Tool建立关联)
    user = db.relationship('User', backref=db.backref('dynamics', lazy='dynamic'))
    article = db.relationship('Article', backref=db.backref('dynamics_shared', lazy='dynamic')) # Use different backref name
    tool = db.relationship('Tool', backref=db.backref('dynamics_referenced', lazy='dynamic')) # Use different backref name

    def to_dict(self):
        # 基本的字典转换，可以根据前端需要扩展
        user_info = self.user.to_dict_basic() if self.user else None
        target_info = None
        target_type = None
        if self.article:
            target_info = self.article.to_dict(include_content=False)
            target_type = 'article'
        elif self.tool:
            target_info = self.tool.to_dict()
            target_type = 'tool'

        return {
            'id': self.id,
            'user': user_info,
            'action_type': self.action_type,
            'target_type': target_type,
            'target': target_info,
            'content': self.content,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Dynamic {self.id} by User {self.user_id} - Type: {self.action_type}>' 