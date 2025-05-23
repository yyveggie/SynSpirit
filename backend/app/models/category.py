# backend/app/models/category.py
"""
定义分类模型 (Category)。
用于组织和管理工具、文章等内容的分类体系。支持层级结构。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy.orm import relationship

class Category(db.Model):
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    icon = db.Column(db.String(100), nullable=True)
    slug = db.Column(db.String(100), nullable=True, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    parent = db.relationship('Category', remote_side=[id], backref=db.backref('children', lazy='dynamic'))
    tools = db.relationship('Tool', backref='category', lazy='dynamic') # Note: Tool model is in another file
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'parent_id': self.parent_id,
            'icon': self.icon,
            'slug': self.slug,
            'children': [child.to_dict() for child in self.children], # Recursive call might be slow for deep trees
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<Category {self.name}>' 