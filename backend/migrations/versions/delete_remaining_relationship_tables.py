"""
删除剩余的关系主题相关表

Revision ID: del_rel_tables
Revises: 0ed6822d5e4c
Create Date: 2025-05-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import logging
from sqlalchemy.exc import ProgrammingError

# revision identifiers, used by Alembic.
revision = 'del_rel_tables'
down_revision = '0ed6822d5e4c'  # 修改为当前数据库的版本号
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic')

def safely_drop_constraint(table_name, constraint_name, type_='foreignkey'):
    """安全地删除约束，如果约束不存在则忽略错误"""
    try:
        op.drop_constraint(constraint_name, table_name, type_=type_)
        print(f"已删除{table_name}表上的{constraint_name}约束")
    except ProgrammingError as e:
        if 'constraint "' + constraint_name + '" of relation "' + table_name + '" does not exist' in str(e):
            print(f"约束{constraint_name}不存在，已跳过")
        else:
            raise

def safely_drop_table(table_name):
    """安全地删除表，如果表不存在则忽略错误"""
    try:
        # 使用原始SQL删除表，带CASCADE选项确保相关约束也被删除
        op.execute(f'DROP TABLE IF EXISTS {table_name} CASCADE')
        print(f"已删除表 {table_name}")
    except Exception as e:
        print(f"删除表{table_name}时出错: {e}")

def safely_drop_column(table_name, column_name):
    """安全地删除列，如果列不存在则忽略错误"""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    try:
        columns = inspector.get_columns(table_name)
        if any(col['name'] == column_name for col in columns):
            with op.batch_alter_table(table_name, schema=None) as batch_op:
                batch_op.drop_column(column_name)
            print(f"已删除{table_name}表中的{column_name}列")
        else:
            print(f"列{column_name}不存在于表{table_name}中，已跳过")
    except Exception as e:
        print(f"删除列{column_name}时出错: {e}")

def upgrade():
    """
    删除残余的关系主题相关表和列，以彻底清理数据库。
    
    使用安全的方式执行删除操作，忽略不存在的表和约束。
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    
    # 1. 先移除外键约束
    print("开始移除外键约束...")
    
    # 移除可能存在的relationship_topic_id外键约束
    if 'posts' in tables:
        safely_drop_constraint('posts', 'posts_relationship_topic_id_fkey')
    
    if 'chat_rooms' in tables:
        safely_drop_constraint('chat_rooms', 'chat_rooms_relationship_topic_id_fkey')
    
    # 2. 然后移除关联表
    print("开始移除关联表...")
    tables_to_drop = [
        'relationship_topic_participants',
        'user_favorite_relationship_topics',
        'relationship_topics',
        'topic_relations'
    ]
    
    for table in tables_to_drop:
        safely_drop_table(table)
    
    # 3. 最后移除外键列
    print("开始移除外键列...")
    if 'posts' in tables:
        safely_drop_column('posts', 'relationship_topic_id')
    
    if 'chat_rooms' in tables:
        safely_drop_column('chat_rooms', 'relationship_topic_id')
    
    print("删除关系主题相关表和字段的迁移已完成")


def downgrade():
    """
    由于这是清理操作，不提供降级功能。
    尝试恢复这些表需要完整的表结构定义。
    """
    print("不支持降级操作")
    pass 