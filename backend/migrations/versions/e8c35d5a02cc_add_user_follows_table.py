"""Add user_follows table

Revision ID: e8c35d5a02cc
Revises: f39a47ee5ca8
Create Date: 2025-04-26 19:52:43.071800

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e8c35d5a02cc'
down_revision = 'f39a47ee5ca8'
branch_labels = None
depends_on = None


def upgrade():
    # ### 手动修正迁移脚本以创建 user_follows 表 ###
    op.create_table('user_follows',
    sa.Column('follower_id', sa.Integer(), nullable=False),
    sa.Column('followed_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.current_timestamp()),
    sa.ForeignKeyConstraint(['followed_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['follower_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('follower_id', 'followed_id')
    )
    # 创建索引 (可选，但推荐)
    op.create_index(op.f('ix_user_follows_followed_id'), 'user_follows', ['followed_id'], unique=False)
    op.create_index(op.f('ix_user_follows_follower_id'), 'user_follows', ['follower_id'], unique=False)
    # ### 结束修正 ###


def downgrade():
    # ### 手动修正降级脚本以删除 user_follows 表 ###
    # 删除索引
    op.drop_index(op.f('ix_user_follows_follower_id'), table_name='user_follows')
    op.drop_index(op.f('ix_user_follows_followed_id'), table_name='user_follows')
    # 删除表
    op.drop_table('user_follows')
    # ### 结束修正 ###
