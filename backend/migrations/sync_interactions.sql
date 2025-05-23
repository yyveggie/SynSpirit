-- 触发器函数：当向user_actions表插入文章点赞/收藏记录时同步到article_interactions表
CREATE OR REPLACE FUNCTION sync_article_interaction_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- 只处理文章相关的点赞和收藏操作
    IF NEW.target_type = 'article' AND (NEW.action_type = 'like' OR NEW.action_type = 'collect') THEN
        -- 检查目标文章是否存在
        IF EXISTS (SELECT 1 FROM articles WHERE id = NEW.target_id) THEN
            -- 检查记录是否已存在
            IF NOT EXISTS (
                SELECT 1 FROM article_interactions 
                WHERE user_id = NEW.user_id 
                AND article_id = NEW.target_id 
                AND interaction_type = NEW.action_type
            ) THEN
                -- 插入对应记录到article_interactions表
                INSERT INTO article_interactions (
                    user_id, 
                    article_id, 
                    interaction_type, 
                    created_at
                ) VALUES (
                    NEW.user_id,
                    NEW.target_id,
                    NEW.action_type,
                    NEW.created_at
                );
                
                -- 更新文章点赞/收藏计数
                IF NEW.action_type = 'like' THEN
                    UPDATE articles 
                    SET likes_count = likes_count + 1 
                    WHERE id = NEW.target_id;
                ELSIF NEW.action_type = 'collect' THEN
                    UPDATE articles 
                    SET collects_count = collects_count + 1 
                    WHERE id = NEW.target_id;
                END IF;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器函数：当从user_actions表删除文章点赞/收藏记录时同步删除article_interactions表中的记录
CREATE OR REPLACE FUNCTION sync_article_interaction_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- 只处理文章相关的点赞和收藏操作
    IF OLD.target_type = 'article' AND (OLD.action_type = 'like' OR OLD.action_type = 'collect') THEN
        -- 检查目标文章是否存在
        IF EXISTS (SELECT 1 FROM articles WHERE id = OLD.target_id) THEN
            -- 删除对应的记录
            DELETE FROM article_interactions 
            WHERE user_id = OLD.user_id 
            AND article_id = OLD.target_id 
            AND interaction_type = OLD.action_type;
            
            -- 更新文章的点赞/收藏计数
            IF OLD.action_type = 'like' THEN
                UPDATE articles 
                SET likes_count = GREATEST(0, likes_count - 1)
                WHERE id = OLD.target_id;
            ELSIF OLD.action_type = 'collect' THEN
                UPDATE articles 
                SET collects_count = GREATEST(0, collects_count - 1)
                WHERE id = OLD.target_id;
            END IF;
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 触发器函数：当向user_actions表插入帖子点赞/收藏记录时同步到post_interactions表
CREATE OR REPLACE FUNCTION sync_post_interaction_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- 只处理帖子相关的点赞和收藏操作
    IF NEW.target_type = 'post' AND (NEW.action_type = 'like' OR NEW.action_type = 'collect') THEN
        -- 检查目标帖子是否存在
        IF EXISTS (SELECT 1 FROM posts WHERE id = NEW.target_id) THEN
            -- 检查记录是否已存在
            IF NOT EXISTS (
                SELECT 1 FROM post_interactions 
                WHERE user_id = NEW.user_id 
                AND post_id = NEW.target_id 
                AND interaction_type = NEW.action_type
            ) THEN
                -- 插入对应记录到post_interactions表
                INSERT INTO post_interactions (
                    user_id, 
                    post_id, 
                    interaction_type, 
                    created_at
                ) VALUES (
                    NEW.user_id,
                    NEW.target_id,
                    NEW.action_type,
                    NEW.created_at
                );
                
                -- 更新帖子的点赞/收藏计数
                IF NEW.action_type = 'like' THEN
                    UPDATE posts 
                    SET likes_count = likes_count + 1 
                    WHERE id = NEW.target_id;
                ELSIF NEW.action_type = 'collect' THEN
                    UPDATE posts 
                    SET collects_count = collects_count + 1 
                    WHERE id = NEW.target_id;
                END IF;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器函数：当从user_actions表删除帖子点赞/收藏记录时同步删除post_interactions表中的记录
CREATE OR REPLACE FUNCTION sync_post_interaction_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- 只处理帖子相关的点赞和收藏操作
    IF OLD.target_type = 'post' AND (OLD.action_type = 'like' OR OLD.action_type = 'collect') THEN
        -- 检查目标帖子是否存在
        IF EXISTS (SELECT 1 FROM posts WHERE id = OLD.target_id) THEN
            -- 删除对应的记录
            DELETE FROM post_interactions 
            WHERE user_id = OLD.user_id 
            AND post_id = OLD.target_id 
            AND interaction_type = OLD.action_type;
            
            -- 更新帖子的点赞/收藏计数
            IF OLD.action_type = 'like' THEN
                UPDATE posts 
                SET likes_count = GREATEST(0, likes_count - 1)
                WHERE id = OLD.target_id;
            ELSIF OLD.action_type = 'collect' THEN
                UPDATE posts 
                SET collects_count = GREATEST(0, collects_count - 1)
                WHERE id = OLD.target_id;
            END IF;
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：用户点赞/收藏文章时
DROP TRIGGER IF EXISTS article_interaction_insert_trigger ON user_actions;
CREATE TRIGGER article_interaction_insert_trigger
AFTER INSERT ON user_actions
FOR EACH ROW
EXECUTE FUNCTION sync_article_interaction_insert();

-- 创建触发器：用户取消文章点赞/收藏时
DROP TRIGGER IF EXISTS article_interaction_delete_trigger ON user_actions;
CREATE TRIGGER article_interaction_delete_trigger
AFTER DELETE ON user_actions
FOR EACH ROW
EXECUTE FUNCTION sync_article_interaction_delete();

-- 创建触发器：用户点赞/收藏帖子时
DROP TRIGGER IF EXISTS post_interaction_insert_trigger ON user_actions;
CREATE TRIGGER post_interaction_insert_trigger
AFTER INSERT ON user_actions
FOR EACH ROW
EXECUTE FUNCTION sync_post_interaction_insert();

-- 创建触发器：用户取消帖子点赞/收藏时
DROP TRIGGER IF EXISTS post_interaction_delete_trigger ON user_actions;
CREATE TRIGGER post_interaction_delete_trigger
AFTER DELETE ON user_actions
FOR EACH ROW
EXECUTE FUNCTION sync_post_interaction_delete();

-- 初始化已有数据：将现有的user_actions表中的文章点赞/收藏记录同步到article_interactions表
INSERT INTO article_interactions (user_id, article_id, interaction_type, created_at)
SELECT 
    user_id, 
    target_id,  
    action_type,
    created_at
FROM user_actions
WHERE target_type = 'article' 
AND (action_type = 'like' OR action_type = 'collect')
AND NOT is_deleted
-- 确保目标文章存在
AND EXISTS (SELECT 1 FROM articles WHERE id = target_id)
-- 确保记录不重复
AND NOT EXISTS (
    SELECT 1 FROM article_interactions
    WHERE article_interactions.user_id = user_actions.user_id
    AND article_interactions.article_id = user_actions.target_id
    AND article_interactions.interaction_type = user_actions.action_type
);

-- 初始化已有数据：将现有的user_actions表中的帖子点赞/收藏记录同步到post_interactions表
INSERT INTO post_interactions (user_id, post_id, interaction_type, created_at)
SELECT 
    user_id, 
    target_id,  
    action_type,
    created_at
FROM user_actions
WHERE target_type = 'post' 
AND (action_type = 'like' OR action_type = 'collect')
AND NOT is_deleted
-- 确保目标帖子存在
AND EXISTS (SELECT 1 FROM posts WHERE id = target_id)
-- 确保记录不重复
AND NOT EXISTS (
    SELECT 1 FROM post_interactions
    WHERE post_interactions.user_id = user_actions.user_id
    AND post_interactions.post_id = user_actions.target_id
    AND post_interactions.interaction_type = user_actions.action_type
); 