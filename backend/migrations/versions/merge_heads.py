"""
合并多个迁移头，并删除关系主题相关表

Revision ID: merge_heads
Revises: del_rel_tables, manual_remove_relationship_topics
Create Date: 2025-05-23 00:10:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import logging
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = 'merge_heads'
down_revision = None
branch_labels = None
depends_on = ('del_rel_tables', 'manual_remove_relationship_topics')

logger = logging.getLogger('alembic')

def safely_drop_table(table_name):
    """安全地删除表，如果表不存在则忽略错误"""
    try:
        op.execute(f'DROP TABLE IF EXISTS {table_name} CASCADE')
        print(f"已删除表 {table_name}")
    except Exception as e:
        print(f"删除表{table_name}时出错: {e}")


def upgrade():
    """
    合并迁移头，并确保关系主题相关表已被删除。
    """
    # 确保关系主题相关表已被删除
    tables_to_check = [
        'relationship_topic_participants',
        'user_favorite_relationship_topics',
        'relationship_topics',
        'topic_relations'
    ]
    
    for table in tables_to_check:
        safely_drop_table(table)
    
    print("合并迁移头并删除关系主题相关表的操作已完成")


def downgrade():
    """
    由于这是清理操作，不提供降级功能。
    """
    print("不支持降级操作")
    pass 