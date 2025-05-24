"""add_is_deleted_to_articles

Revision ID: 0bd7d3b5c66f
Revises: merge_heads
Create Date: 2025-05-24 19:27:36.450461

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0bd7d3b5c66f'
down_revision = 'merge_heads'
branch_labels = None
depends_on = None


def upgrade():
    # 添加is_deleted字段，默认为False（即未删除）
    op.add_column('articles', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    # 添加索引以加速查询（根据is_deleted过滤）
    op.create_index(op.f('ix_articles_is_deleted'), 'articles', ['is_deleted'], unique=False)


def downgrade():
    # 删除索引
    op.drop_index(op.f('ix_articles_is_deleted'), table_name='articles')
    # 删除is_deleted字段
    op.drop_column('articles', 'is_deleted')
