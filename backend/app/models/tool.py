# backend/app/models/tool.py
"""
定义工具模型 (Tool)。
用于存储AI工具的信息，包括名称、描述、URL、分类、标签、特性、用例、优缺点、评分、截图、向量嵌入等。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class Tool(db.Model):
    __tablename__ = 'tools'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    source_url = db.Column(db.String(255), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=False)
    tags = db.Column(JSONB, nullable=True)  # 使用JSONB存储标签
    content = db.Column(db.Text, nullable=True)
    features = db.Column(JSONB, nullable=True)  # 工具功能列表
    use_cases = db.Column(JSONB, nullable=True)  # 使用场景
    pros = db.Column(JSONB, nullable=True)  # 优点
    cons = db.Column(JSONB, nullable=True)  # 缺点
    rating = db.Column(db.Float, default=0.0)  # 用户评分
    popularity = db.Column(db.Integer, default=0)  # 人气指数
    is_free = db.Column(db.Boolean, default=True)  # 是否免费
    pricing_info = db.Column(JSONB, nullable=True)  # 价格信息
    screenshot_url = db.Column(db.String(255), nullable=True)  # 截图URL
    vector_embedding = db.Column(Vector(1536), nullable=True)  # OpenAI嵌入向量
    slug = db.Column(db.String(100), nullable=True, unique=True, index=True)
    is_published = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系定义在 Category 模型中通过 backref='tools' 建立
    # feedback 关系通过 Feedback 模型中的 backref='tool' 建立
    # dynamics_referenced 关系通过 Dynamic 模型中的 backref='tool' 建立
    
    def to_dict(self):
        category_data = None
        if self.category: # Assumes backref 'category' is set by Category model
            category_data = {
                'id': self.category.id,
                'name': self.category.name
                # Add other category fields if needed by frontend, e.g., slug
            }
            
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'source_url': self.source_url,
            'category': category_data, # Nested category object
            'tags': self.tags,
            'content': self.content,
            'features': self.features,
            'use_cases': self.use_cases,
            'pros': self.pros,
            'cons': self.cons,
            'rating': self.rating,
            'popularity': self.popularity,
            'is_free': self.is_free,
            'pricing_info': self.pricing_info,
            'screenshot_url': self.screenshot_url,
            'slug': self.slug,
            'is_published': self.is_published,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
    
    def __repr__(self):
        return f'<Tool {self.name}>' 