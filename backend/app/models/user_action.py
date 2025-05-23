# backend/app/models/user_action.py
"""
定义用户行为模型 (UserAction)。
用于记录用户的通用行为，如点赞、收藏、分享等，可作用于文章、工具、评论或其他行为（转发）。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

class UserAction(db.Model):
    __tablename__ = 'user_actions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    action_type = db.Column(db.String(50), nullable=False, index=True) # e.g., 'like', 'collect', 'share'
    target_type = db.Column(db.String(50), nullable=False, index=True) # e.g., 'article', 'tool', 'comment', 'action'
    target_id = db.Column(db.Integer, nullable=False, index=True)      # ID of the target object
    content = db.Column(db.Text, nullable=True)                      # Optional content (e.g., share comment)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # --- 新增：用于记录转发来源 --- 
    original_action_id = db.Column(db.Integer, db.ForeignKey('user_actions.id', ondelete='SET NULL'), nullable=True, index=True)
    
    # --- 新增：存储分享图片列表 --- 
    images = db.Column(db.Text, nullable=True)  # 存储JSON格式的图片URL列表

    # 新增：评论计数字段
    comments_count = db.Column(db.Integer, default=0, nullable=False)
    
    # 新增：转发计数字段
    reposts_count = db.Column(db.Integer, default=0, nullable=False)

    # 新增：软删除标记
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)

    # Relationships
    user = db.relationship('User', backref=db.backref('actions', lazy='dynamic'))
    
    # --- 新增：关系到原始分享动作 --- 
    original_action = db.relationship('UserAction', remote_side=[id], backref='reposts')
    
    # Relationship to interactions defined via backref in ActionInteraction model
    # interactions relationship established by backref='action' in ActionInteraction model

    # Relationship to comments defined via backref in ActionComment model
    # comments relationship established by backref='action' in ActionComment model

    def to_dict(self):
        import json
        
        user_info = self.user.to_dict_basic() if self.user else None
        original_action_info = self.original_action.to_dict() if self.original_action else None # Avoid infinite recursion if needed
        
        # 处理图片列表
        image_list = []
        if self.images:
            try:
                image_list = json.loads(self.images)
            except Exception as e:
                print(f"Error parsing image JSON for action {self.id}: {e}")
        
        # TODO: Optionally fetch the target object (article, tool, etc.) based on target_type and target_id
        # This requires importing other models and querying, might be better done in the route/service layer.
        target_object_preview = f"{self.target_type}:{self.target_id}" 

        return {
            'id': self.id,
            'user': user_info,
            'action_type': self.action_type,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'target_object_preview': target_object_preview, # Placeholder for actual target
            'content': self.content,
            'images': image_list,  # 添加图片列表到返回数据
            'original_action': original_action_info,
            'created_at': self.created_at.isoformat(),
            'comments_count': self.comments_count,  # 添加评论数到返回数据
            'reposts_count': self.reposts_count,  # 添加转发数到返回数据
        }

    def __repr__(self):
        return f'<UserAction {self.id} by User {self.user_id} - {self.action_type} on {self.target_type}:{self.target_id}>' 