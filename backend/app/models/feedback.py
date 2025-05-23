# backend/app/models/feedback.py
"""
定义用户反馈模型 (Feedback)。
用于收集用户对工具的评分和评论。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

# 创建用户反馈表
class Feedback(db.Model):
    __tablename__ = 'feedback'
    
    id = db.Column(db.Integer, primary_key=True)
    tool_id = db.Column(db.Integer, db.ForeignKey('tools.id'), nullable=False)
    rating = db.Column(db.Integer, nullable=False)  # 1-5评分
    comment = db.Column(db.Text, nullable=True)
    user_email = db.Column(db.String(100), nullable=True) # Consider linking to user_id if users must be logged in
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系
    tool = db.relationship('Tool', backref=db.backref('feedback', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'tool_id': self.tool_id,
            'rating': self.rating,
            'comment': self.comment,
            'created_at': self.created_at.isoformat()
        }

    def __repr__(self):
        return f'<Feedback for Tool {self.tool_id} - Rating {self.rating}>' 