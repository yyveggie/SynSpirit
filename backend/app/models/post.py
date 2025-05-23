"""
定义帖子模型 (Post)。
用于存储与特定主题 (Topic) 关联的帖子，包含标题、内容、作者、主题、封面图等。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from datetime import datetime
from app import db
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
from flask import current_app, request # For image URL generation
import sqlalchemy as sa # Make sure sqlalchemy is imported if using sa.text

class Post(db.Model):
    __tablename__ = 'posts'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=True, index=True)
    cover_image = db.Column(db.String(255), nullable=True)
    slug = db.Column(db.String(255), nullable=True, unique=True, index=True)
    # is_published = db.Column(db.Boolean, default=True) # This might be redundant now with publication_status
    view_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    likes_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    collects_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    comments_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    shares_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # --- Add missing columns from migration 52fc5c13042b ---
    publication_status = db.Column(db.String(length=50), server_default='draft', nullable=False)
    access_level = db.Column(db.String(length=50), server_default='public', nullable=False)
    allow_comments = db.Column(db.Boolean, server_default=sa.text('true'), nullable=False)
    scheduled_publish_time = db.Column(db.DateTime(), nullable=True)
    password = db.Column(db.String(length=128), nullable=True)
    # --- End of added columns ---

    # Define database relationships
    author = db.relationship('User', backref=db.backref('posts', lazy='dynamic'))
    topic = db.relationship('Topic', back_populates='posts')

    def to_dict(self, include_content=True):
        """将 Post 对象转换为字典表示"""
        author_data = self.author.to_dict_basic() if self.author else None
        # 确保author_data包含bio和tags字段
        if author_data and self.author:
            author_data['bio'] = self.author.bio
            author_data['tags'] = self.author.tags or []
        topic_data = self.topic.to_dict() if self.topic else None

        final_cover_image_url = self.cover_image
        if self.cover_image and not (self.cover_image.startswith('http://') or self.cover_image.startswith('https://')):
            try:
                base_url = None
                if request:
                    base_url = request.host_url.rstrip('/')
                elif current_app:
                    server_name = current_app.config.get('SERVER_NAME') or current_app.config.get('HOST_URL')
                    if server_name:
                        scheme = current_app.config.get('PREFERRED_URL_SCHEME', 'https')
                        base_url = f"{scheme}://{server_name.rstrip('/')}"
                
                if base_url:
                    final_cover_image_url = f"{base_url}{self.cover_image}"
                elif current_app:
                     current_app.logger.warning(f"无法确定帖子 {self.id} 封面图的完整 URL，cover_image: {self.cover_image}")
            except RuntimeError:
                pass

        data = {
            'id': self.id,
            'title': self.title,
            'author': author_data,
            'topic': topic_data,
            'cover_image': final_cover_image_url,
            'slug': self.slug,
            # 'is_published': self.is_published, # Consider removing or aligning with publication_status
            'view_count': self.view_count,
            'likes_count': self.likes_count,
            'collects_count': self.collects_count,
            'shares_count': self.shares_count,
            'comments_count': self.comments_count,
            'created_at': self.created_at.isoformat() + 'Z',
            'updated_at': self.updated_at.isoformat() + 'Z',
            # Add new fields to the dictionary representation
            'publication_status': self.publication_status,
            'access_level': self.access_level,
            'allow_comments': self.allow_comments,
            'scheduled_publish_time': self.scheduled_publish_time.isoformat() + 'Z' if self.scheduled_publish_time else None,
            # Do not include password in to_dict!
        }
        if include_content:
            data['content'] = self.content
        return data

    def __repr__(self):
        return f'<Post {self.id} - {self.title} in Topic {self.topic_id} by User {self.user_id}>' 