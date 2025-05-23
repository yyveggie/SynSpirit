# backend/app/models/action_interaction.py
"""
定义用户行为交互模型 (ActionInteraction)。
用于记录用户对某个用户行为 (UserAction) 的交互，例如点赞或收藏一个分享。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

class ActionInteraction(db.Model):
    __tablename__ = 'action_interactions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    action_id = db.Column(db.Integer, db.ForeignKey('user_actions.id'), nullable=False, index=True) # 目标 Action
    interaction_type = db.Column(db.String(50), nullable=False, index=True) # 'like', 'collect'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 唯一约束：确保一个用户对一个 Action 只能有一种类型的交互（例如不能重复点赞）
    __table_args__ = (UniqueConstraint('user_id', 'action_id', 'interaction_type', name='uq_user_action_interaction'),)

    # 关系
    user = db.relationship('User', backref='action_interactions')
    action = db.relationship('UserAction', backref=db.backref('interactions', lazy='dynamic', cascade="all, delete-orphan"))

    def to_dict(self):
        user_info = self.user.to_dict_basic() if self.user else None
        # Avoid fetching full action to prevent potential loops
        action_info = {'id': self.action_id} if self.action else None 
        
        return {
            'id': self.id,
            'user': user_info,
            'action': action_info,
            'interaction_type': self.interaction_type,
            'created_at': self.created_at.isoformat()
        }

    def __repr__(self):
        return f'<ActionInteraction {self.id} by User {self.user_id} - {self.interaction_type} on Action {self.action_id}>' 