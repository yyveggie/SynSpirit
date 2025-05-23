# backend/app/models/topic_relation.py
"""
定义主题关系模型 (TopicRelation)。
用于表示知识图谱或概念地图中主题之间的连接（边），包含源主题、目标主题、标签和样式信息。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from app import db
from datetime import datetime
from sqlalchemy import ForeignKey, ForeignKeyConstraint
from sqlalchemy.orm import relationship

class TopicRelation(db.Model):
    __tablename__ = 'topic_relations'

    id = db.Column(db.Integer, primary_key=True)
    source_topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False, index=True)
    target_topic_id = db.Column(db.Integer, db.ForeignKey('topics.id'), nullable=False, index=True)
    label = db.Column(db.String(100), nullable=True)
    style_animated = db.Column(db.Boolean, default=False)
    style_thickness = db.Column(db.Integer, default=1)
    style_color = db.Column(db.String(20), default='#aaa')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 外键约束确保关系两端的主题必须存在
    __table_args__ = (ForeignKeyConstraint(['source_topic_id'], ['topics.id'], name='fk_topicrelation_source'),
                      ForeignKeyConstraint(['target_topic_id'], ['topics.id'], name='fk_topicrelation_target'))

    # Relationships defined by backref in Topic model
    # source_topic relationship established by backref='source_relations' in Topic model
    # target_topic relationship established by backref='target_relations' in Topic model

    def to_dict(self):
        return {
            'id': self.id,
            'source': self.source_topic_id,
            'target': self.target_topic_id,
            'label': self.label,
            'style': {
                'animated': self.style_animated,
                'strokeWidth': self.style_thickness,
                'stroke': self.style_color
            },
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

    def __repr__(self):
        return f'<TopicRelation {self.id} from Topic {self.source_topic_id} to Topic {self.target_topic_id}>' 