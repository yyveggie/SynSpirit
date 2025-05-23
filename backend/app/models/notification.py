from datetime import datetime
from app import db

class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    recipient_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    actor_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action_type = db.Column(db.String(50), nullable=False)
    target_type = db.Column(db.String(50), nullable=True)
    target_id = db.Column(db.Integer, nullable=True)
    content = db.Column(db.Text, nullable=False)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    related_url = db.Column(db.String(255), nullable=True)

    # 关联关系
    recipient = db.relationship('User', foreign_keys=[recipient_user_id], backref=db.backref('notifications', lazy='dynamic'))
    actor = db.relationship('User', foreign_keys=[actor_user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'recipient_user_id': self.recipient_user_id,
            'actor_user_id': self.actor_user_id,
            'actor': self.actor.to_public_dict() if self.actor else None,
            'action_type': self.action_type,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'content': self.content,
            'is_read': self.read_at is not None,
            'created_at': self.created_at.isoformat(),
            'related_url': self.related_url
        } 