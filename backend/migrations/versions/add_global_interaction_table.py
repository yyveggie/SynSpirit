"""Add global_interactions table for unified interaction tracking

Revision ID: add_global_interaction_table
Revises: HEAD
Create Date: 2025-05-21 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime


# revision identifiers, used by Alembic.
revision = 'add_global_interaction_table'
down_revision = None  # 请替换为当前最新的迁移版本ID
branch_labels = None
depends_on = None


def upgrade():
    # 创建全局交互表
    op.create_table('global_interactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('content_type', sa.String(length=20), nullable=False, comment='交互内容类型: article, post, action'),
        sa.Column('content_id', sa.Integer(), nullable=False, comment='内容ID'),
        sa.Column('interaction_type', sa.String(length=20), nullable=False, comment='交互类型: like, collect'),
        sa.Column('created_at', sa.DateTime(), nullable=False, default=datetime.utcnow),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'content_type', 'content_id', 'interaction_type', name='unique_global_interaction')
    )
    
    # 添加索引以提高查询性能
    with op.batch_alter_table('global_interactions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_global_interactions_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_global_interactions_content_type'), ['content_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_global_interactions_content_id'), ['content_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_global_interactions_interaction_type'), ['interaction_type'], unique=False)
        batch_op.create_index(
            batch_op.f('ix_global_interactions_combined'), 
            ['user_id', 'content_type', 'content_id', 'interaction_type'], 
            unique=True
        )
    
    # 添加触发器函数，同步现有表中的交互数据到新表中
    op.execute('''
    -- 同步功能: 当在 article_interactions 表中插入记录时，同步到 global_interactions
    CREATE OR REPLACE FUNCTION sync_article_interaction_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        -- 防止冲突：检查记录是否已存在
        IF NOT EXISTS (
            SELECT 1 FROM global_interactions 
            WHERE user_id = NEW.user_id 
            AND content_type = 'article' 
            AND content_id = NEW.article_id
            AND interaction_type = NEW.interaction_type
        ) THEN
            -- 插入到全局交互表
            INSERT INTO global_interactions (
                user_id, 
                content_type,
                content_id,
                interaction_type,
                created_at
            ) VALUES (
                NEW.user_id,
                'article',
                NEW.article_id,
                NEW.interaction_type,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 同步功能: 当在 post_interactions 表中插入记录时，同步到 global_interactions
    CREATE OR REPLACE FUNCTION sync_post_interaction_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        -- 防止冲突：检查记录是否已存在
        IF NOT EXISTS (
            SELECT 1 FROM global_interactions 
            WHERE user_id = NEW.user_id 
            AND content_type = 'post' 
            AND content_id = NEW.post_id
            AND interaction_type = NEW.interaction_type
        ) THEN
            -- 插入到全局交互表
            INSERT INTO global_interactions (
                user_id, 
                content_type,
                content_id,
                interaction_type,
                created_at
            ) VALUES (
                NEW.user_id,
                'post',
                NEW.post_id,
                NEW.interaction_type,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 同步功能: 当在 action_interactions 表中插入记录时，同步到 global_interactions
    CREATE OR REPLACE FUNCTION sync_action_interaction_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        -- 防止冲突：检查记录是否已存在
        IF NOT EXISTS (
            SELECT 1 FROM global_interactions 
            WHERE user_id = NEW.user_id 
            AND content_type = 'action' 
            AND content_id = NEW.action_id
            AND interaction_type = NEW.interaction_type
        ) THEN
            -- 插入到全局交互表
            INSERT INTO global_interactions (
                user_id, 
                content_type,
                content_id,
                interaction_type,
                created_at
            ) VALUES (
                NEW.user_id,
                'action',
                NEW.action_id,
                NEW.interaction_type,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 触发器：从 article_interactions 同步到 global_interactions
    DROP TRIGGER IF EXISTS sync_article_interaction_to_global_trigger ON article_interactions;
    CREATE TRIGGER sync_article_interaction_to_global_trigger
    AFTER INSERT ON article_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_article_interaction_to_global();

    -- 触发器：从 post_interactions 同步到 global_interactions
    DROP TRIGGER IF EXISTS sync_post_interaction_to_global_trigger ON post_interactions;
    CREATE TRIGGER sync_post_interaction_to_global_trigger
    AFTER INSERT ON post_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_post_interaction_to_global();

    -- 触发器：从 action_interactions 同步到 global_interactions
    DROP TRIGGER IF EXISTS sync_action_interaction_to_global_trigger ON action_interactions;
    CREATE TRIGGER sync_action_interaction_to_global_trigger
    AFTER INSERT ON action_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_action_interaction_to_global();

    -- 删除同步: 当从 article_interactions 删除记录时，同步删除 global_interactions
    CREATE OR REPLACE FUNCTION sync_article_interaction_delete_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        DELETE FROM global_interactions 
        WHERE user_id = OLD.user_id 
        AND content_type = 'article' 
        AND content_id = OLD.article_id
        AND interaction_type = OLD.interaction_type;
        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    -- 删除同步: 当从 post_interactions 删除记录时，同步删除 global_interactions
    CREATE OR REPLACE FUNCTION sync_post_interaction_delete_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        DELETE FROM global_interactions 
        WHERE user_id = OLD.user_id 
        AND content_type = 'post' 
        AND content_id = OLD.post_id
        AND interaction_type = OLD.interaction_type;
        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    -- 删除同步: 当从 action_interactions 删除记录时，同步删除 global_interactions
    CREATE OR REPLACE FUNCTION sync_action_interaction_delete_to_global()
    RETURNS TRIGGER AS $$
    BEGIN
        DELETE FROM global_interactions 
        WHERE user_id = OLD.user_id 
        AND content_type = 'action' 
        AND content_id = OLD.action_id
        AND interaction_type = OLD.interaction_type;
        RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    -- 触发器：从 article_interactions 同步删除到 global_interactions
    DROP TRIGGER IF EXISTS sync_article_interaction_delete_to_global_trigger ON article_interactions;
    CREATE TRIGGER sync_article_interaction_delete_to_global_trigger
    AFTER DELETE ON article_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_article_interaction_delete_to_global();

    -- 触发器：从 post_interactions 同步删除到 global_interactions
    DROP TRIGGER IF EXISTS sync_post_interaction_delete_to_global_trigger ON post_interactions;
    CREATE TRIGGER sync_post_interaction_delete_to_global_trigger
    AFTER DELETE ON post_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_post_interaction_delete_to_global();

    -- 触发器：从 action_interactions 同步删除到 global_interactions
    DROP TRIGGER IF EXISTS sync_action_interaction_delete_to_global_trigger ON action_interactions;
    CREATE TRIGGER sync_action_interaction_delete_to_global_trigger
    AFTER DELETE ON action_interactions
    FOR EACH ROW
    EXECUTE FUNCTION sync_action_interaction_delete_to_global();
    ''')
    
    # 迁移现有数据到新表
    op.execute('''
    -- 迁移文章交互数据
    INSERT INTO global_interactions (user_id, content_type, content_id, interaction_type, created_at)
    SELECT user_id, 'article', article_id, interaction_type, created_at
    FROM article_interactions
    ON CONFLICT DO NOTHING;
    
    -- 迁移帖子交互数据
    INSERT INTO global_interactions (user_id, content_type, content_id, interaction_type, created_at)
    SELECT user_id, 'post', post_id, interaction_type, created_at
    FROM post_interactions
    ON CONFLICT DO NOTHING;
    
    -- 迁移动态交互数据
    INSERT INTO global_interactions (user_id, content_type, content_id, interaction_type, created_at)
    SELECT user_id, 'action', action_id, interaction_type, created_at
    FROM action_interactions
    ON CONFLICT DO NOTHING;
    ''')


def downgrade():
    # 删除触发器和函数
    op.execute('''
    DROP TRIGGER IF EXISTS sync_article_interaction_to_global_trigger ON article_interactions;
    DROP TRIGGER IF EXISTS sync_post_interaction_to_global_trigger ON post_interactions;
    DROP TRIGGER IF EXISTS sync_action_interaction_to_global_trigger ON action_interactions;
    DROP TRIGGER IF EXISTS sync_article_interaction_delete_to_global_trigger ON article_interactions;
    DROP TRIGGER IF EXISTS sync_post_interaction_delete_to_global_trigger ON post_interactions;
    DROP TRIGGER IF EXISTS sync_action_interaction_delete_to_global_trigger ON action_interactions;
    
    DROP FUNCTION IF EXISTS sync_article_interaction_to_global();
    DROP FUNCTION IF EXISTS sync_post_interaction_to_global();
    DROP FUNCTION IF EXISTS sync_action_interaction_to_global();
    DROP FUNCTION IF EXISTS sync_article_interaction_delete_to_global();
    DROP FUNCTION IF EXISTS sync_post_interaction_delete_to_global();
    DROP FUNCTION IF EXISTS sync_action_interaction_delete_to_global();
    ''')
    
    # 删除表
    op.drop_table('global_interactions') 