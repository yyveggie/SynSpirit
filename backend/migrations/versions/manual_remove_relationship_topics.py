"""
删除关系社区相关表和字段

Revision ID: manual_remove_relationship_topics
Revises: 0ed6822d5e4c
Create Date: 2025-05-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import logging

# revision identifiers, used by Alembic.
revision = 'manual_remove_relationship_topics'
down_revision = '0ed6822d5e4c'
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic')

def upgrade():
    """
    此迁移已修改为空迁移，仅用于满足版本历史记录的连续性。
    实际的表删除操作将通过merge_heads迁移完成。
    """
    logger.info("这是一个空迁移，无需执行任何操作。")
    pass

def downgrade():
    """
    不支持降级操作
    """
    pass 