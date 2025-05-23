# backend/app/models/post_comment.py
"""
定义帖子评论模型 (PostComment)。
用于存储用户对帖子 (Post) 的评论，支持嵌套回复。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey, Table, text # 导入 text
from sqlalchemy.orm import relationship
import sqlalchemy as sa # 确保导入 sqlalchemy

# --- 新增：定义 PostComment-User 点赞关联表 --- 
post_comment_likes = Table('post_comment_likes', db.metadata,
    db.Column('user_id', db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    db.Column('post_comment_id', db.Integer, db.ForeignKey('post_comments.id', ondelete='CASCADE'), primary_key=True),
    db.Column('timestamp', db.DateTime, default=datetime.utcnow)
)
# --- 结束新增 ---

class PostComment(db.Model):
    """帖子评论模型，支持嵌套回复"""
    __tablename__ = 'post_comments'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id', ondelete='CASCADE'), nullable=False, index=True)
    # --- 恢复使用 user_id 作为作者外键 --- 
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True) # 允许匿名，或用户删除后保留评论
    # --- 移除 author_id --- 
    # author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    # --- 结束修改 ---
    parent_id = db.Column(db.Integer, db.ForeignKey('post_comments.id', ondelete='CASCADE'), nullable=True, index=True)
    replied_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # --- 新增 is_deleted 字段 ---
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    # --- 结束新增 ---
    
    # --- 新增：点赞计数字段 ---
    likes_count = db.Column(db.Integer, default=0, nullable=False, index=True)
    # replies_count 也可以考虑添加，如果需要频繁展示回复数
    # replies_count = db.Column(db.Integer, default=0, index=True, nullable=False)
    # --- 结束新增 ---
    
    # --- 新增：AI生成标记字段 (与 Comment 模型保持一致) ---
    is_ai_generated = db.Column(db.Boolean, default=False, nullable=False, server_default=text('false'))
    # --- 结束新增 ---
    
    # 定义关系
    post = db.relationship("Post", backref=db.backref("comments", lazy='dynamic', cascade="all, delete-orphan"))
    # --- 修改：定义与 User 的关系 (基于 user_id) --- 
    # 移除基于 author_id 的关系
    # author = relationship('User', foreign_keys=[author_id], backref='post_comments') 
    # 定义评论的作者关系 (基于 user_id)
    user = relationship('User', foreign_keys=[user_id], back_populates='post_comments') # 使用 back_populates
    # --- 结束修改 ---
    
    # --- 新增：定义被回复者关系 (基于 replied_user_id) ---
    replied_user = relationship('User', foreign_keys=[replied_user_id]) # 只需要单向关系，或按需添加 back_populates
    # --- 结束新增 ---

    # 自引用关系，一条评论可以有多个回复
    replies = db.relationship("PostComment", 
                            backref=db.backref('parent', remote_side=[id]), 
                            lazy='dynamic', 
                            cascade="all, delete-orphan")

    # --- 新增：PostComment 点赞关系 ---
    likers = db.relationship(
        'User',
        secondary=post_comment_likes,
        backref=db.backref('liked_post_comments', lazy='dynamic'), # Use a different backref
        lazy='dynamic'
    )
    # --- 结束新增 ---

    # --- 恢复完整的 to_dict 方法 (使用 'user' 字段) ---
    def to_dict(self, include_author=True, include_post=False, include_parent=False, include_replies=False, depth=0, max_depth=5, current_user_id=None):
        """
        将评论对象转换为字典表示
        
        参数:
            include_author: 是否包含作者信息
            include_post: 是否包含帖子信息
            include_parent: 是否包含父评论信息
            include_replies: 是否包含回复信息
            depth: 当前递归深度 (内部使用)
            max_depth: 最大递归深度，防止无限递归 (默认5层，支持深层嵌套)
            current_user_id: 当前登录用户的ID (可选)
        """
        is_liked_by_current_user = False
        if current_user_id and self.likers:
            # 检查当前用户是否在点赞者列表中
            # SQLAlchemy 的 likers 关系是 lazy='dynamic', 所以需要进一步查询
            if db.session.query(post_comment_likes).filter(
                post_comment_likes.c.user_id == current_user_id,
                post_comment_likes.c.post_comment_id == self.id
            ).first():
                is_liked_by_current_user = True

        # --- 修改：为AI生成的评论提供专属用户信息 (与 Comment 模型保持一致) ---
        user_info_for_dict = None
        if self.is_ai_generated:
            user_info_for_dict = {
                'id': -1, 
                'nickname': 'Lynn', 
                'avatar': 'https://ui-avatars.com/api/?name=L&background=8A2BE2&color=fff&size=200&bold=true&rounded=true',
                'email': None
            }
        elif include_author and self.user: # 保留 include_author 条件给真实用户
            user_info_for_dict = {
                'id': self.user.id,
                'nickname': self.user.nickname or self.user.email.split('@')[0],
                'email': self.user.email,
                'avatar': self.user.avatar
            }
        # --- 结束修改 ---

        comment_dict = {
            'id': self.id,
            'content': '[该评论已删除]' if getattr(self, 'is_deleted', False) else self.content,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'post_id': self.post_id,
            'user_id': self.user_id if not self.is_ai_generated else -1, # AI的user_id设为-1
            'parent_id': self.parent_id,
            'replied_user_id': self.replied_user_id,
            'likes_count': self.likes_count,
            'is_deleted': getattr(self, 'is_deleted', False),
            'is_liked_by_current_user': is_liked_by_current_user,
            'user': user_info_for_dict, # 使用上面准备好的用户信息
            'is_ai_generated': getattr(self, 'is_ai_generated', False) # 保留这一行，删除重复行
        }

        # 只在需要且用户存在时添加用户信息 (此段逻辑已整合到 user_info_for_dict)
        # if include_author and self.user: 
        # comment_dict['user'] = user_info_for_dict
        
        # 恢复 post
        if include_post and self.post: 
            comment_dict['post'] = { 
                'id': self.post.id,
                'title': self.post.title,
                'slug': self.post.slug
            }
            
        # 恢复 parent
        if include_parent and self.parent: 
             parent_user_info = None 
             if self.parent.user:
                 parent_user_info = {
                     'id': self.parent.user.id,
                     'nickname': self.parent.user.nickname or self.parent.user.email.split('@')[0],
                     'email': self.parent.user.email,
                     'avatar': self.parent.user.avatar
                 }
             comment_dict['parent'] = {
                 'id': self.parent.id,
                 'user': parent_user_info
             }

        # 恢复 replied_user
        if self.replied_user: 
            comment_dict['replied_user'] = {
                'id': self.replied_user.id,
                'nickname': self.replied_user.nickname or self.replied_user.email.split('@')[0]
            }

        # 恢复 replies - 修改为递归获取所有嵌套级别的回复
        if include_replies and depth < max_depth: 
            child_comments = PostComment.query.filter_by(parent_id=self.id).order_by(PostComment.created_at.asc()).all()
            replies_data = []
            for reply in child_comments:
                 # 递归调用，增加深度计数，传递最大深度参数和 current_user_id
                 replies_data.append(reply.to_dict(
                     include_author=True, 
                     include_post=False, 
                     include_parent=False, 
                     include_replies=True,  # 关键：递归获取回复的回复
                     depth=depth+1,         # 增加深度
                     max_depth=max_depth,   # 传递最大深度限制
                     current_user_id=current_user_id # 传递 current_user_id
                 ))
            comment_dict['replies'] = replies_data

        return comment_dict
    # --- 结束恢复 ---

    def __repr__(self):
        parent_info = f" (Reply to {self.parent_id})" if self.parent_id else ""
        # --- 修改：恢复使用 user_id --- 
        user_info = f"User {self.user_id}" if self.user_id else "Anonymous"
        # --- 结束修改 ---
        return f'<PostComment {self.id} on Post {self.post_id} by {user_info}{parent_info}>' 