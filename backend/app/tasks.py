from .celery_utils import celery_app
from . import db # 需要访问数据库
from .models import Post, PostComment, UserAction, Article, Comment, User, ActionComment
from sqlalchemy import func
import logging
from celery.utils.log import get_task_logger
from sqlalchemy.exc import OperationalError
# --- 重新修改导入：确保模型和关联表都被导入，删除段落评论相关导入 ---
from .models.post_comment import PostComment, post_comment_likes 
from .models.comment import Comment, comment_likes
from .models.article import Article # 需要 Article 模型用于 update_article_counts
from .models.post import Post # 需要 Post 模型用于 update_post_counts
from .models.user_action import UserAction # 需要 UserAction 模型用于 update_post_counts 和 update_article_counts
from .models.action_interaction import ActionInteraction # 导入 ActionInteraction 用于处理点赞和收藏
# --- 结束修改导入 ---
from .routes.chat import generate_response_with_context
from . import create_app  # 只导入create_app，不导入celery
from flask import current_app
from sqlalchemy.orm import Session, load_only
from .models.notification import Notification
from datetime import datetime

logger = get_task_logger(__name__)

# 定义重试策略，例如最多重试3次，延迟时间逐渐增加
RETRY_KWARGS = {
    'max_retries': 3,
    'default_retry_delay': 60,  # 1 minute
    'autoretry_for': (Exception,), # 对所有 Exception 自动重试
    'retry_backoff': True, # 使用指数退避
    'retry_backoff_max': 60, # 最大退避时间60秒
    'retry_jitter': True # 添加随机抖动防止任务集中爆发
}

# --- Post 相关计数任务 --- 

@celery_app.task(bind=True, **RETRY_KWARGS)
def update_post_view_count(self, post_id):
    """异步更新帖子浏览量 (简单增加)"""
    logger.info(f"[TASK_STARTED] update_post_view_count for post_id: {post_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.post import Post
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            post = session.get(Post, post_id)
            if post:
                post.view_count = (post.view_count or 0) + 1
                session.commit()
                logger.info(f"Successfully updated view count for post {post_id}")
            else:
                logger.warning(f"Post {post_id} not found for view count update.")
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating view count for post {post_id}: {e}", exc_info=True)
            # 自动重试将由 RETRY_KWARGS 处理
            raise # 重新抛出异常以触发 Celery 的重试机制
        finally:
            session.close()

@celery_app.task(bind=True, **RETRY_KWARGS)
def update_post_counts(self, post_id):
    """
    Celery task to update likes_count and collects_count for a given Post.
    Retries on OperationalError.
    """
    logger.info(f"[TASK_STARTED] update_post_counts for post_id: {post_id}")
    
    # 创建应用上下文和新的数据库会话
    from app import create_app
    from app.models.post import Post
    from app.models.user_action import UserAction
    from app.models.post_comment import PostComment
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            # 使用会话查询数据 - 使用session.query而不是直接用Post.query
            post = session.query(Post).filter(Post.id == post_id).first()
            
            if not post:
                logger.warning(f"[TASK_WARN] Post with id {post_id} not found. Skipping count update.")
                return f"Post {post_id} not found."

            logger.info(f"[TASK_INFO] Found post: {post.title if post else 'N/A'}, current likes: {post.likes_count}, current collects: {post.collects_count}")

            # 计算点赞数 - 明确使用session.query
            likes_count = session.query(UserAction).filter(
                UserAction.action_type == 'like',
                UserAction.target_type == 'post', 
                UserAction.target_id == post_id,
                UserAction.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 帖子 {post_id} 计算得到的点赞数: {likes_count}")
            
            # 计算收藏数 - 明确使用session.query
            collects_count = session.query(UserAction).filter(
                UserAction.action_type == 'collect',
                UserAction.target_type == 'post', 
                UserAction.target_id == post_id,
                UserAction.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 帖子 {post_id} 计算得到的收藏数: {collects_count}")

            # 计算评论数 - 明确使用session.query
            comments_count = session.query(PostComment).filter(
                PostComment.post_id == post_id, 
                PostComment.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 帖子 {post_id} 计算得到的评论数: {comments_count}")

            # 计算分享数 - 明确使用session.query
            shares_count = session.query(UserAction).filter(
                UserAction.action_type == 'share',
                UserAction.target_type == 'post', 
                UserAction.target_id == post_id,
                UserAction.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 帖子 {post_id} 计算得到的分享数: {shares_count}")

            # 检查是否需要更新
            changed = False
            
            if post.likes_count != likes_count:
                logger.info(f"[DEBUG] 更新点赞数: {post.likes_count} -> {likes_count}")
                post.likes_count = likes_count
                changed = True
                
            if post.collects_count != collects_count:
                logger.info(f"[DEBUG] 更新收藏数: {post.collects_count} -> {collects_count}")
                post.collects_count = collects_count
                changed = True

            # 如果 Post 模型有 comments_count 和 shares_count 字段，也更新它们
            if hasattr(post, 'comments_count'):
                if post.comments_count != comments_count:
                    logger.info(f"[DEBUG] 更新评论数: {post.comments_count} -> {comments_count}")
                    post.comments_count = comments_count
                    changed = True
                    
            if hasattr(post, 'shares_count'):
                if post.shares_count != shares_count:
                    logger.info(f"[DEBUG] 更新分享数: {post.shares_count} -> {shares_count}")
                    post.shares_count = shares_count
                    changed = True

            if changed:
                logger.info(f"[TASK_UPDATE] 帖子 {post_id} 的计数已更新，正在提交到数据库")
                # 确保更新后将post添加到会话中
                session.add(post)
                session.commit()
                logger.info(f"[TASK_DB_COMMIT] Count changes committed for post {post_id}.")
            else:
                logger.info(f"[TASK_NO_CHANGE] No count changes detected for post {post_id}.")
                
            # 获取最终状态用于日志记录
            final_likes_count = post.likes_count
            final_collects_count = post.collects_count
            
            logger.info(f"[TASK_COMPLETED] update_post_counts for post_id: {post_id}. Likes: {final_likes_count}, Collects: {final_collects_count}")
            return f"Post {post_id} counts updated. Likes: {final_likes_count}, Collects: {final_collects_count}"

        except Exception as e:
            session.rollback()
            logger.error(f"[TASK_FAILED] Unexpected error updating counts for post {post_id}: {e}", exc_info=True)
            # 对于未预期的错误，我们可以选择重试或者直接返回错误
            if isinstance(e, OperationalError):
                raise self.retry(exc=e)
            return f"Failed to update counts for post {post_id} due to unexpected error: {str(e)}"
        finally:
            # 确保会话始终关闭，避免资源泄漏
            session.close()

# --- PostComment 相关计数任务 --- 

@celery_app.task(bind=True, **RETRY_KWARGS)
def update_post_comment_likes_count(self, comment_id):
    """异步更新帖子评论的点赞总数"""
    logger.info(f"[TASK_STARTED] update_post_comment_likes_count for comment_id: {comment_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.post_comment import PostComment, post_comment_likes
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            # 使用 session.get 获取对象，更适合Celery任务中的会话管理
            comment = session.get(PostComment, comment_id)
            if not comment:
                logger.warning(f"[TASK_WARN] PostComment {comment_id} not found for likes count update. Skipping.")
                return f"PostComment {comment_id} not found."

            # 计算实际的点赞数
            current_db_likes_count = session.query(func.count(post_comment_likes.c.user_id)).filter(
                post_comment_likes.c.post_comment_id == comment_id
            ).scalar() or 0 # 如果没有任何点赞记录，scalar()可能返回None，确保为0
            
            logger.info(f"[TASK_INFO] Comment {comment_id}: current DB field likes_count = {comment.likes_count}, calculated from likes table = {current_db_likes_count}")

            # 只有当计算出的点赞数与数据库中存储的值不同时才更新
            if comment.likes_count != current_db_likes_count:
                comment.likes_count = current_db_likes_count
                session.commit()
                logger.info(f"[TASK_DB_COMMIT] Likes count for PostComment {comment_id} updated to {current_db_likes_count}")
            else:
                logger.info(f"[TASK_NO_CHANGE] Likes count for PostComment {comment_id} is already {current_db_likes_count}. No database update performed.")
            
            logger.info(f"[TASK_COMPLETED] update_post_comment_likes_count for comment_id: {comment_id}. Final likes_count in DB (expected): {current_db_likes_count}")
            return f"PostComment {comment_id} likes count processed. Final expected count: {current_db_likes_count}"

        except OperationalError as exc:
            session.rollback()
            logger.error(f"[TASK_RETRY] OperationalError for comment_id {comment_id}: {exc}. Retrying...")
            raise self.retry(exc=exc)
        except Exception as e:
            session.rollback()
            logger.error(f"[TASK_FAILED] update_post_comment_likes_count for comment {comment_id} failed: {e}", exc_info=True)
            return f"Failed to update likes count for PostComment {comment_id}: {str(e)}"
        finally:
            session.close()

# --- 新增：更新文章计数的 Celery 任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def update_article_counts(self, article_id):
    """
    Celery task to update likes_count, collects_count, shares_count, 
    and comments_count for a given Article.
    Retries on OperationalError.
    """
    logger.info(f"[TASK_STARTED] update_article_counts for article_id: {article_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.article import Article
    from app.models.user_action import UserAction
    from app.models.comment import Comment
    from sqlalchemy.orm import Session, load_only
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        # 创建新的session来避免映射器的冲突问题
        session = Session(db.engine)
        
        try:
            # 使用select指定加载特定列，避免加载所有关系
            article = session.query(Article).options(
                load_only(
                    Article.id, Article.title, Article.likes_count, 
                    Article.collects_count, Article.shares_count, Article.comments_count
                )
            ).filter(Article.id == article_id).first()
            
            if not article:
                logger.warning(f"[TASK_WARN] Article with id {article_id} not found. Skipping count update.")
                return f"Article {article_id} not found."

            # 保留原始日志，以便了解任务开始时文章的状态
            logger.info(f"[TASK_INFO] Found article: {article.title if article else 'N/A'}, current likes: {article.likes_count}, current collects: {article.collects_count}, current shares: {article.shares_count}, current comments: {article.comments_count}")

            # 简化计数逻辑，关键修改：使用正确的表结构和字段名
            logger.info(f"[DEBUG] 开始计算文章 {article_id} 的点赞和收藏数...")
            
            # 计算点赞数 - 从 UserAction 表中查询
            likes_count = session.query(UserAction).filter(
                UserAction.action_type == 'like',
                UserAction.target_type == 'article', 
                UserAction.target_id == article_id,
                UserAction.is_deleted == False  # 只计算未软删除的记录
            ).count()
            logger.info(f"[DEBUG] 文章 {article_id} 计算得到的点赞数: {likes_count}")
            
            # 计算收藏数 - 从 UserAction 表中查询
            collects_count = session.query(UserAction).filter(
                UserAction.action_type == 'collect',
                UserAction.target_type == 'article', 
                UserAction.target_id == article_id,
                UserAction.is_deleted == False  # 只计算未软删除的记录
            ).count()
            logger.info(f"[DEBUG] 文章 {article_id} 计算得到的收藏数: {collects_count}")
            
            # 计算分享数
            shares_count = session.query(UserAction).filter(
                UserAction.action_type == 'share',
                UserAction.target_type == 'article', 
                UserAction.target_id == article_id,
                UserAction.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 文章 {article_id} 计算得到的分享数: {shares_count}")
            
            # 计算评论数
            comments_count = session.query(Comment).filter(
                Comment.article_id == article_id, 
                Comment.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 文章 {article_id} 计算得到的评论数: {comments_count}")

            # 检查是否需要更新
            changed = False
            
            if article.likes_count != likes_count:
                logger.info(f"[DEBUG] 更新点赞数: {article.likes_count} -> {likes_count}")
                article.likes_count = likes_count
                changed = True
                
            if article.collects_count != collects_count:
                logger.info(f"[DEBUG] 更新收藏数: {article.collects_count} -> {collects_count}")
                article.collects_count = collects_count
                changed = True

            if article.shares_count != shares_count:
                logger.info(f"[DEBUG] 更新分享数: {article.shares_count} -> {shares_count}")
                article.shares_count = shares_count
                changed = True

            if article.comments_count != comments_count:
                logger.info(f"[DEBUG] 更新评论数: {article.comments_count} -> {comments_count}")
                article.comments_count = comments_count
                changed = True
            
            if changed:
                logger.info(f"[TASK_UPDATE] 文章 {article_id} 的计数已更新，正在提交到数据库")
                # 确保更新后将article对象添加到会话中
                session.add(article)
                session.commit()
                logger.info(f"[TASK_DB_COMMIT] Count changes committed for article {article_id}.")
            else:
                logger.info(f"[TASK_NO_CHANGE] No count changes detected for article {article_id}.")
            
            final_likes_count = article.likes_count
            final_collects_count = article.collects_count
            final_shares_count = article.shares_count
            final_comments_count = article.comments_count

            logger.info(f"[TASK_COMPLETED] update_article_counts for article_id: {article_id}. Likes: {final_likes_count}, Collects: {final_collects_count}, Shares: {final_shares_count}, Comments: {final_comments_count}")
            return f"Article {article_id} counts updated. Likes: {final_likes_count}, Collects: {final_collects_count}, Shares: {final_shares_count}, Comments: {final_comments_count}"

        except OperationalError as exc:
            session.rollback()
            logger.error(f"[TASK_RETRY] OperationalError for article_id {article_id}: {exc}. Retrying...")
            raise self.retry(exc=exc)
        except Exception as e:
            session.rollback()
            logger.error(f"[TASK_FAILED] update_article_counts for article_id {article_id} failed: {e}", exc_info=True)
            # Optionally, re-raise to mark the task as failed if not retrying
            return f"Failed to update counts for article {article_id}: {str(e)}"
        finally:
            # 确保会话始终关闭，避免资源泄漏
            session.close()

# --- 新增：更新文章评论计数的 Celery 任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def update_article_comment_likes_count(self, comment_id):
    """异步更新文章评论 (Comment 模型) 的点赞总数"""
    logger.info(f"[TASK_STARTED] update_article_comment_likes_count for comment_id: {comment_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.comment import Comment, comment_likes
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            # 假设文章评论的模型是 Comment
            comment = session.get(Comment, comment_id)
            if not comment:
                logger.warning(f"[TASK_WARN] Article Comment (Comment model) with id {comment_id} not found. Skipping likes count update.")
                return f"Article Comment {comment_id} not found."
            
            new_likes_count = session.query(func.count(comment_likes.c.user_id)).filter(
                comment_likes.c.comment_id == comment_id
            ).scalar()
            logger.info(f"[TASK_INFO] Calculated new_likes_count for article comment {comment_id}: {new_likes_count}")

            final_comment_likes_count = comment.likes_count # 获取初始值

            # 更新 Comment 对象的 likes_count 字段
            if comment.likes_count != new_likes_count:
                comment.likes_count = new_likes_count
                final_comment_likes_count = new_likes_count # 更新 final 值
                session.commit()
                logger.info(f"[TASK_DB_COMMIT] Likes count for article comment {comment_id} updated to {new_likes_count}")
            else:
                logger.info(f"[TASK_NO_CHANGE] Likes count for article comment {comment_id} is already {new_likes_count}.")
                
            logger.info(f"[TASK_COMPLETED] update_article_comment_likes_count for comment_id: {comment_id}. Likes: {final_comment_likes_count}")
            return f"Article Comment {comment_id} likes count updated to {final_comment_likes_count}"

        except OperationalError as exc:
            session.rollback()
            logger.error(f"[TASK_RETRY] OperationalError for article comment {comment_id}: {exc}. Retrying...")
            raise self.retry(exc=exc)
        except Exception as e:
            session.rollback()
            logger.error(f"[TASK_FAILED] update_article_comment_likes_count for comment {comment_id} failed: {e}", exc_info=True)
            return f"Failed to update likes count for article comment {comment_id}: {str(e)}"
        finally:
            session.close()

# --- 确保导入所有需要的模型和表对象 ---
# (检查文件顶部，确保 Comment 和 comment_likes 能被正确导入)

# --- 其他可能的异步任务 ---
# 例如：发送通知、处理图片、调用第三方 API 等
# @celery_app.task(bind=True, **RETRY_KWARGS)
# def send_notification(self, user_id, message):
#     try:
#         # ... 发送通知的逻辑 ...
#         logger.info(f"Sent notification to user {user_id}")
#     except Exception as e:
#         logger.error(f"Error sending notification to user {user_id}: {e}", exc_info=True)
#         raise 

@celery_app.task(bind=True, max_retries=3, default_retry_delay=120) # Increased retry delay
def generate_ai_comment_reply_task(self, user_comment_id: int, article_id: int, user_question: str, 
                                   article_title: str, article_content: str = None, article_summary: str = None, 
                                   parent_comment_content: str = None, original_user_id: int = None):
    """
    Celery task to generate and save an AI reply to a user's comment or reply.
    
    Parameters:
    - user_comment_id: 用户评论ID
    - article_id: 文章ID
    - user_question: 用户提问内容
    - article_title: 文章标题
    - article_content: 完整的文章内容
    - article_summary: 文章摘要(如果有)
    - parent_comment_content: 父评论内容(对于回复)
    - original_user_id: 原始用户ID
    """
    flask_app = create_app()
    with flask_app.app_context():
        try:
            current_app.logger.info(f"[TASK_AI_REPLY] Started for user_comment_id: {user_comment_id}, article_id: {article_id}")

            # 构建系统提示词
            system_prompt_str = f"""你是 Lynn，一个友好且乐于助人的 AI 助手。
用户在一篇标题为 \"{article_title}\" 的文章下发表了评论或回复 (ID: {user_comment_id})。"""

            # 优先使用文章内容，如果太长则添加摘要
            article_context = ""
            if article_content:
                # 获取文章内容的前2000字符作为上下文
                content_preview = article_content[:2000] + ("..." if len(article_content) > 2000 else "")
                article_context = f"\n文章的主要内容是：\"{content_preview}\""
            elif article_summary:
                article_context = f"\n文章的摘要是：\"{article_summary}\""
            
            system_prompt_str += article_context

            # 如果是回复，添加原始评论作为上下文
            if parent_comment_content:
                system_prompt_str += f"\n用户是在回复以下评论：\"{parent_comment_content}\""
                
            system_prompt_str += f"""\n用户在其留言中向你提问：\"{user_question}\"。
请直接针对用户的问题进行回答，参考文章内容提供有价值的答复。语气可以略带俏皮和亲和力，但保持内容专业和有帮助."""
            
            current_app.logger.debug(f"[TASK_AI_REPLY] System prompt for user_comment_id {user_comment_id}: {system_prompt_str[:200]}...")

            ai_reply_content = generate_response_with_context(
                user_message=user_question,
                context_messages=[], # Keeping context_messages empty for now
                system_prompt=system_prompt_str
            )

            if ai_reply_content and not ai_reply_content.lower().startswith("抱歉"):
                current_app.logger.info(f"[TASK_AI_REPLY] AI raw response for user_comment_id {user_comment_id}: {ai_reply_content[:150]}...")
                
                # 使用 `db` 而不是 `app_db`
                parent_comment_for_ai = db.session.get(Comment, user_comment_id)
                if not parent_comment_for_ai:
                    current_app.logger.error(f"[TASK_AI_REPLY] Parent comment with ID {user_comment_id} not found. Skipping AI reply.")
                    return

                ai_db_comment = Comment(
                    content=ai_reply_content,
                    article_id=article_id,
                    user_id=None, # AI reply, user_id is None (or -1 as per to_dict)
                    parent_id=user_comment_id, 
                    is_ai_generated=True
                )
                db.session.add(ai_db_comment) # 使用 `db`
                db.session.commit() # 使用 `db`
                current_app.logger.info(f"[TASK_AI_REPLY] AI reply saved for user_comment_id: {user_comment_id}. New AI comment ID: {ai_db_comment.id}")
            
            elif ai_reply_content: # AI returned a polite refusal or similar
                current_app.logger.warning(f"[TASK_AI_REPLY] AI returned a non-committal response for user_comment_id {user_comment_id}: {ai_reply_content}")
            else:
                current_app.logger.error(f"[TASK_AI_REPLY] AI response was empty or null for user_comment_id {user_comment_id}.")

        except Exception as e:
            current_app.logger.error(f"[TASK_AI_REPLY] Error processing user_comment_id {user_comment_id}: {e}", exc_info=True)
            # 回滚数据库会话以防部分提交或错误状态
            db.session.rollback() # 使用 `db`
            raise self.retry(exc=e)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=180) # 可以调整重试参数
def generate_ai_post_comment_reply_task(self, user_post_comment_id: int, post_id: int, user_question: str, 
                                       post_title: str = None, post_content: str = None, 
                                       parent_comment_content: str = None, original_user_id: int = None):
    """
    Celery 异步任务：为帖子评论生成并保存 AI 回复。
    
    Parameters:
    - user_post_comment_id: 用户帖子评论ID
    - post_id: 帖子ID
    - user_question: 用户提问内容
    - post_title: 帖子标题
    - post_content: 完整的帖子内容
    - parent_comment_content: 父评论内容(对于回复)
    - original_user_id: 原始用户ID
    """
    flask_app = create_app() # 创建 Flask app 实例以便使用 app_context
    with flask_app.app_context():
        try:
            current_app.logger.info(f"[TASK_AI_POST_REPLY] Started for user_post_comment_id: {user_post_comment_id}, post_id: {post_id}")

            target_post = db.session.get(Post, post_id)
            if not target_post:
                current_app.logger.error(f"[TASK_AI_POST_REPLY] Post with ID {post_id} not found. Aborting for comment {user_post_comment_id}.")
                return

            original_comment = db.session.get(PostComment, user_post_comment_id)
            if not original_comment:
                current_app.logger.error(f"[TASK_AI_POST_REPLY] Original PostComment with ID {user_post_comment_id} not found. Aborting.")
                return

            # 使用传递的帖子标题，或者从数据库获取
            post_title_for_prompt = post_title or target_post.title
            
            # 构建系统提示词
            system_prompt_str = f"""你是 Lynn，一个友好且乐于助人的 AI 助手。
用户在一篇标题为 \"{post_title_for_prompt}\" 的帖子下发表了评论或回复 (ID: {user_post_comment_id})。"""

            # 优先使用传递的完整帖子内容，如果太长则截取
            post_context = ""
            if post_content:
                # 获取帖子内容的前2000字符作为上下文
                content_preview = post_content[:2000] + ("..." if len(post_content) > 2000 else "")
                post_context = f"\n帖子的主要内容是：\"{content_preview}\""
            elif target_post.content:
                # 如果没有传递post_content，则从target_post获取
                content_preview = target_post.content[:2000] + ("..." if len(target_post.content) > 2000 else "")
                post_context = f"\n帖子的主要内容是：\"{content_preview}\""
            
            system_prompt_str += post_context

            # 如果是回复，添加原始评论作为上下文
            if parent_comment_content:
                system_prompt_str += f"\n用户是在回复以下评论：\"{parent_comment_content}\""
                
            system_prompt_str += f"""\n用户在其留言中向你提问：\"{user_question}\"。
请直接针对用户的问题进行回答，参考帖子内容提供有价值的答复。语气可以略带俏皮和亲和力，但保持内容专业和有帮助。"""
            
            current_app.logger.debug(f"[TASK_AI_POST_REPLY] System prompt for PostComment {user_post_comment_id}: {system_prompt_str[:200]}...")

            # 构建上下文消息列表
            context_messages = []
            
            # 如果有父评论，将其作为用户消息添加到上下文
            if parent_comment_content:
                context_messages.append({
                    "role": "user",
                    "content": f"用户评论：{parent_comment_content}"
                })
            
            # 调用 AI 生成回复
            ai_response_text = generate_response_with_context(
                user_message=user_question,
                context_messages=context_messages,
                system_prompt=system_prompt_str
            )

            if not ai_response_text or not ai_response_text.strip():
                current_app.logger.warning(f"[TASK_AI_POST_REPLY] AI returned empty response for PostComment {user_post_comment_id}. Question: {user_question}")
                return

            current_app.logger.info(f"[TASK_AI_POST_REPLY] AI response for PostComment {user_post_comment_id}: {ai_response_text[:100]}...") # Log a snippet

            # 保存 AI 回复为新的 PostComment
            ai_reply = PostComment(
                content=ai_response_text,
                post_id=post_id,
                user_id=None,  # AI 没有 User ID，或者使用一个特定的 AI 用户 ID
                parent_id=user_post_comment_id, # AI 的回复是针对用户评论的
                is_ai_generated=True,
                # replied_user_id 可以是发起提问的原始用户 original_user_id
                replied_user_id=original_user_id 
            )
            db.session.add(ai_reply)
            db.session.commit()
            current_app.logger.info(f"[TASK_AI_POST_REPLY] AI reply (PostComment ID: {ai_reply.id}) saved for user_post_comment_id: {user_post_comment_id}")

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[TASK_AI_POST_REPLY] Error processing AI reply for PostComment {user_post_comment_id}: {e}", exc_info=True)
            # Celery 会根据配置自动重试
            self.retry(exc=e)

@celery_app.task(bind=True, max_retries=3, default_retry_delay=240) # 可以调整重试参数
def generate_ai_action_comment_reply_task(self, user_action_comment_id: int, action_id: int, user_question: str, 
                                         original_user_id: int, parent_comment_content: str = None):
    """
    Celery 异步任务：为动态评论生成并保存 AI 回复。
    
    Parameters:
    - user_action_comment_id: 用户评论ID
    - action_id: 动态ID
    - user_question: 用户提问内容
    - original_user_id: 原始用户ID
    - parent_comment_content: 父评论内容(如果是回复)
    """
    flask_app = create_app() # 创建 Flask app 实例以便使用 app_context
    with flask_app.app_context():
        try:
            current_app.logger.info(f"[TASK_AI_ACTION_REPLY] Started for user_action_comment_id: {user_action_comment_id}, action_id: {action_id}")

            target_action = db.session.get(UserAction, action_id)
            if not target_action:
                current_app.logger.error(f"[TASK_AI_ACTION_REPLY] UserAction with ID {action_id} not found. Aborting for comment {user_action_comment_id}.")
                return

            original_comment = db.session.get(ActionComment, user_action_comment_id)
            if not original_comment:
                current_app.logger.error(f"[TASK_AI_ACTION_REPLY] Original ActionComment with ID {user_action_comment_id} not found. Aborting.")
                return

            # 1. 构建更详细的 system_prompt
            system_prompt_base = "你是 Lynn，一个友好且乐于助人的 AI 助手。\n"
            action_context_description = ""

            if target_action.action_type == 'create_status':
                status_text = target_action.content if target_action.content and target_action.content.strip() else "这条动态没有文字内容"
                has_images = False
                if target_action.images and target_action.images.strip():
                    try:
                        import json
                        parsed_images = json.loads(target_action.images)
                        if isinstance(parsed_images, list) and len(parsed_images) > 0:
                            has_images = True
                    except json.JSONDecodeError:
                        if target_action.images not in ['[]', '{}', 'null', '']:
                            has_images = True
                
                image_notice = " (注意：这条动态似乎包含图片，但我无法直接查看图片内容)" if has_images else ""
                
                action_context_description = (
                    f"用户在TA自己发布的一条动态 (ID: {target_action.id}) 的评论区收到了一个问题。"
                    f"该动态的文本内容是：\"{status_text[:500]}...\"{image_notice}"
                )

            elif target_action.action_type == 'share':
                shared_item_description = "一个项目" # 默认描述
                shared_item_content_snippet = "无法获取被分享项目的具体内容摘要。" # 默认摘要
                user_share_comment = f"用户分享时评论道：\"{target_action.content[:200]}...\"。" if target_action.content and target_action.content.strip() else "用户分享时未附加评论。"

                if target_action.target_type == 'article':
                    shared_article = db.session.get(Article, target_action.target_id)
                    if shared_article:
                        shared_item_description = f"一篇标题为 \"{shared_article.title}\" 的文章 (ID: {shared_article.id})"
                        article_body_snippet = shared_article.body[:300].strip() if hasattr(shared_article, 'body') and shared_article.body and shared_article.body.strip() else None
                        article_summary_snippet = shared_article.summary[:300].strip() if hasattr(shared_article, 'summary') and shared_article.summary and shared_article.summary.strip() else None
                        snippet = article_body_snippet or article_summary_snippet or "文章没有提供可供摘要的文本内容。"
                        shared_item_content_snippet = f"被分享的文章部分内容摘要是：\"{snippet}\"。"
                elif target_action.target_type == 'post':
                    shared_post = db.session.get(Post, target_action.target_id)
                    if shared_post:
                        post_title = shared_post.title if hasattr(shared_post, 'title') and shared_post.title else "无标题帖子"
                        shared_item_description = f"一篇标题为 \"{post_title}\" 的帖子 (ID: {shared_post.id})"
                        snippet = shared_post.content[:300].strip() if hasattr(shared_post, 'content') and shared_post.content and shared_post.content.strip() else "帖子没有提供可供摘要的文本内容。"
                        shared_item_content_snippet = f"被分享的帖子部分内容摘要是：\"{snippet}\"。"
                
                action_context_description = (
                    f"用户分享了{shared_item_description}。{user_share_comment}\n"
                    f"{shared_item_content_snippet}\n现在，在关于这个分享的评论区中，"
                )
            else: 
                _action_desc_temp = f"类型为 '{target_action.action_type}' 的动态 (ID: {target_action.id})"
                if target_action.content and target_action.content.strip(): 
                    _action_desc_temp += f"，附带内容：\"{target_action.content[:200]}...\""
                elif target_action.target_type and target_action.target_id:
                    _action_desc_temp += f"，该操作指向目标类型 '{target_action.target_type}' (ID: {target_action.target_id})"
                action_context_description = f"用户在一个{_action_desc_temp}的上下文中收到了一个问题。"

            # 添加父评论上下文（如果存在）
            parent_comment_context = ""
            if parent_comment_content:
                parent_comment_context = f"\n用户是在回复以下评论：\"{parent_comment_content[:300]}{'...' if len(parent_comment_content) > 300 else ''}\"\n"

            system_prompt_str = (
                f"{system_prompt_base}"
                f"{action_context_description}\n"
                f"{parent_comment_context}"
                f"针对上述背景，评论者 (用户ID: {original_user_id}) 在其评论 (ID: {user_action_comment_id}) 中向你提问：\"{user_question}\"。\n"
                f"请直接针对该问题进行回答，语气可以略带俏皮和亲和力，但保持内容专业和有帮助。"
            )
            
            current_app.logger.debug(f"[TASK_AI_ACTION_REPLY] System prompt for ActionComment {user_action_comment_id}: {system_prompt_str}")

            # 构建上下文消息
            context_messages = []
            # 如果有父评论，将其作为用户消息添加到上下文
            if parent_comment_content:
                context_messages.append({
                    "role": "user",
                    "content": f"上一条评论：{parent_comment_content}"
                })
            
            # 调用 AI 生成回复
            ai_response_text = generate_response_with_context(
                user_message=user_question,
                context_messages=context_messages,
                system_prompt=system_prompt_str
            )

            if not ai_response_text or not ai_response_text.strip():
                current_app.logger.warning(f"[TASK_AI_ACTION_REPLY] AI returned empty response for ActionComment {user_action_comment_id}. Question: {user_question}")
                return

            current_app.logger.info(f"[TASK_AI_ACTION_REPLY] AI response for ActionComment {user_action_comment_id}: {ai_response_text[:100]}...")

            # 3. 保存 AI 回复为新的 ActionComment
            ai_reply = ActionComment(
                content=ai_response_text,
                action_id=action_id,
                user_id=-1, 
                parent_id=user_action_comment_id, 
                is_ai_generated=True,
                replied_user_id=original_user_id 
            )
            db.session.add(ai_reply)
            db.session.commit()
            current_app.logger.info(f"[TASK_AI_ACTION_REPLY] AI reply (ActionComment ID: {ai_reply.id}) saved for user_action_comment_id: {user_action_comment_id}")

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[TASK_AI_ACTION_REPLY] Error processing AI reply for ActionComment {user_action_comment_id}: {e}", exc_info=True)
            self.retry(exc=e) 

# --- 新增：通知文章作者新评论的任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def notify_author_of_new_comment_task(self, comment_id: int):
    """
    When a new comment (top-level or reply) is created, notify the article author.
    """
    logger.info(f"[TASK_STARTED] notify_author_of_new_comment_task for comment_id: {comment_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.comment import Comment
    from app.models.article import Article
    from app.models.user import User
    from app.models.notification import Notification
    from datetime import datetime
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            comment = session.get(Comment, comment_id)
            if not comment:
                logger.warning(f"[TASK_WARN] Comment with id {comment_id} not found. Skipping notification.")
                return f"Comment {comment_id} not found."

            if comment.is_deleted:
                logger.info(f"[TASK_INFO] Comment {comment_id} is marked as deleted. Skipping notification.")
                return f"Comment {comment_id} is deleted."

            article = session.get(Article, comment.article_id)
            if not article:
                logger.warning(f"[TASK_WARN] Article with id {comment.article_id} (for comment {comment_id}) not found. Skipping notification.")
                return f"Article {comment.article_id} not found for comment {comment_id}."

            # Get article author
            article_author = session.get(User, article.user_id) # Article.user_id stores the author's ID
            if not article_author:
                logger.warning(f"[TASK_WARN] Author (User ID: {article.user_id}) for article {article.id} not found. Skipping notification.")
                return f"Author for article {article.id} not found."

            # Get commenter information
            commenter = session.get(User, comment.user_id)
            commenter_name = commenter.nickname if commenter else "Anonymous User"

            # Check if it's a self-comment (if so, no notification needed)
            if article_author.id == comment.user_id:
                logger.info(f"[TASK_INFO] Article author {article_author.id} commented on their own article {article.id}. Skipping notification.")
                return f"Author commented on own article. No notification needed for comment {comment_id}."

            # 创建通知记录
            notification_content = f"{commenter_name}评论了您的文章《{article.title}》"
            related_url = f"/articles/{article.id}#comment-{comment.id}"
            
            # 创建通知记录到数据库
            notification = Notification(
                recipient_user_id=article_author.id,
                actor_user_id=comment.user_id,
                action_type='new_comment',
                target_type='article',
                target_id=article.id,
                content=notification_content,
                related_url=related_url,
                created_at=datetime.utcnow()
            )
            
            session.add(notification)
            session.commit()
            
            logger.info(f"[NOTIFICATION_CREATED] ID: {notification.id}, To: User {article_author.id}, Content: {notification_content}")
            logger.info(f"[TASK_COMPLETED] notify_author_of_new_comment_task for comment_id: {comment_id}")
            
            return f"Notification created for comment {comment_id} on article {article.id} to author {article_author.id}."

        except OperationalError as exc:
            logger.error(f"[TASK_RETRY] OperationalError for comment_id {comment_id}: {exc}. Retrying...")
            session.rollback()
            raise self.retry(exc=exc)
        except Exception as e:
            logger.error(f"[TASK_FAILED] notify_author_of_new_comment_task for comment_id {comment_id} failed: {e}", exc_info=True)
            session.rollback()
            raise self.retry(exc=e) # Or directly raise e if you don't want to retry for all Exceptions
        finally:
            session.close()

# --- 新增：更新动态计数的 Celery 任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def update_action_counts(self, action_id):
    """
    Celery task to update comments_count for a given UserAction (dynamic post).
    Note: UserAction model only has comments_count field, not likes_count or collects_count.
    Retries on OperationalError.
    """
    logger.info(f"[TASK_STARTED] update_action_counts for action_id: {action_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.user_action import UserAction
    from app.models.action_comment import ActionComment
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            action = session.get(UserAction, action_id)
            if not action:
                logger.warning(f"[TASK_WARN] UserAction with id {action_id} not found. Skipping count update.")
                return f"UserAction {action_id} not found."

            # 打印当前状态的日志
            current_comments = getattr(action, 'comments_count', 0)
            logger.info(f"[TASK_INFO] Found action: {action.id}, type: {action.action_type}, current comments: {current_comments}")

            # 计算评论数 - 从 ActionComment 表中查询
            comments_count = session.query(ActionComment).filter(
                ActionComment.action_id == action_id,
                ActionComment.is_deleted == False
            ).count()
            logger.info(f"[DEBUG] 动态 {action_id} 计算得到的评论数: {comments_count}")

            # 检查是否需要更新评论数
            changed = False
            if hasattr(action, 'comments_count') and action.comments_count != comments_count:
                logger.info(f"[DEBUG] 更新评论数: {action.comments_count} -> {comments_count}")
                action.comments_count = comments_count
                changed = True
            
            if changed:
                logger.info(f"[TASK_UPDATE] 动态 {action_id} 的评论数已更新，正在提交到数据库")
                session.commit()
                logger.info(f"[TASK_DB_COMMIT] Comment count change committed for action {action_id}.")
            else:
                logger.info(f"[TASK_NO_CHANGE] No comment count changes detected for action {action_id}.")
            
            final_comments_count = getattr(action, 'comments_count', 0)

            logger.info(f"[TASK_COMPLETED] update_action_counts for action_id: {action_id}. Comments: {final_comments_count}")
            return f"Action {action_id} counts updated. Comments: {final_comments_count}"

        except OperationalError as exc:
            session.rollback()
            logger.error(f"[TASK_RETRY] OperationalError for action_id {action_id}: {exc}. Retrying...")
            raise self.retry(exc=exc)
        except Exception as e:
            session.rollback()
            logger.error(f"[TASK_FAILED] update_action_counts for action_id {action_id} failed: {e}", exc_info=True)
            return f"Failed to update counts for action {action_id}: {str(e)}"
        finally:
            session.close()

# --- 新增：计算动态点赞数的 Celery 任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def calculate_action_likes_count(self, action_id):
    """
    Celery task to calculate likes count for a given UserAction (dynamic post).
    Note: This does not update any field in UserAction as there is no likes_count field,
    but calculates and returns the count from ActionInteraction table.
    """
    logger.info(f"[TASK_STARTED] calculate_action_likes_count for action_id: {action_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.user_action import UserAction
    from app.models.action_interaction import ActionInteraction
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            action = session.get(UserAction, action_id)
            if not action:
                logger.warning(f"[TASK_WARN] UserAction with id {action_id} not found. Skipping likes count calculation.")
                return f"UserAction {action_id} not found."

            # 计算点赞数 - 从 ActionInteraction 表中查询
            likes_count = session.query(ActionInteraction).filter(
                ActionInteraction.action_id == action_id,
                ActionInteraction.interaction_type == 'like'
            ).count()
            
            logger.info(f"[TASK_CALCULATED] Action {action_id} likes count: {likes_count}")
            return f"Action {action_id} likes count: {likes_count}"

        except Exception as e:
            logger.error(f"[TASK_FAILED] calculate_action_likes_count for action_id {action_id} failed: {e}", exc_info=True)
            return f"Failed to calculate likes count for action {action_id}: {str(e)}"
        finally:
            session.close()

# --- 新增：计算动态收藏数的 Celery 任务 ---
@celery_app.task(bind=True, **RETRY_KWARGS)
def calculate_action_collects_count(self, action_id):
    """
    Celery task to calculate collects count for a given UserAction (dynamic post).
    Note: This does not update any field in UserAction as there is no collects_count field,
    but calculates and returns the count from ActionInteraction table.
    """
    logger.info(f"[TASK_STARTED] calculate_action_collects_count for action_id: {action_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.user_action import UserAction
    from app.models.action_interaction import ActionInteraction
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            action = session.get(UserAction, action_id)
            if not action:
                logger.warning(f"[TASK_WARN] UserAction with id {action_id} not found. Skipping collects count calculation.")
                return f"UserAction {action_id} not found."

            # 计算收藏数 - 从 ActionInteraction 表中查询
            collects_count = session.query(ActionInteraction).filter(
                ActionInteraction.action_id == action_id,
                ActionInteraction.interaction_type == 'collect'
            ).count()
            
            logger.info(f"[TASK_CALCULATED] Action {action_id} collects count: {collects_count}")
            return f"Action {action_id} collects count: {collects_count}"

        except Exception as e:
            logger.error(f"[TASK_FAILED] calculate_action_collects_count for action_id {action_id} failed: {e}", exc_info=True)
            return f"Failed to calculate collects count for action {action_id}: {str(e)}"
        finally:
            session.close()

@celery_app.task(bind=True, **RETRY_KWARGS)
def notify_reply_to_comment_task(self, comment_id: int):
    """
    当一个评论回复了另一个评论时，通知被回复的评论作者
    """
    logger.info(f"[TASK_STARTED] notify_reply_to_comment_task for comment_id: {comment_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.comment import Comment
    from app.models.article import Article
    from app.models.user import User
    from app.models.notification import Notification
    from datetime import datetime
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            # 获取回复评论
            reply = session.get(Comment, comment_id)
            if not reply:
                logger.warning(f"[TASK_WARN] Reply comment with id {comment_id} not found. Skipping notification.")
                return f"Reply comment {comment_id} not found."

            if reply.is_deleted:
                logger.info(f"[TASK_INFO] Reply comment {comment_id} is marked as deleted. Skipping notification.")
                return f"Reply comment {comment_id} is deleted."

            # 检查回复的父评论ID
            parent_comment_id = reply.parent_id
            if not parent_comment_id:
                logger.info(f"[TASK_INFO] Comment {comment_id} is not a reply. Skipping reply notification.")
                return f"Comment {comment_id} is not a reply to another comment."
            
            # 获取父评论
            parent_comment = session.get(Comment, parent_comment_id)
            if not parent_comment:
                logger.warning(f"[TASK_WARN] Parent comment {parent_comment_id} for reply {comment_id} not found. Skipping notification.")
                return f"Parent comment {parent_comment_id} not found."
            
            if parent_comment.is_deleted:
                logger.info(f"[TASK_INFO] Parent comment {parent_comment_id} is marked as deleted. Skipping notification.")
                return f"Parent comment {parent_comment_id} is deleted."

            # 获取父评论作者
            parent_author = session.get(User, parent_comment.user_id)
            if not parent_author:
                logger.warning(f"[TASK_WARN] Parent comment author (User ID: {parent_comment.user_id}) not found. Skipping notification.")
                return f"Parent comment author {parent_comment.user_id} not found."

            # 获取回复作者
            replier = session.get(User, reply.user_id)
            if not replier:
                logger.warning(f"[TASK_WARN] Replier (User ID: {reply.user_id}) not found. Skipping notification.")
                return f"Replier {reply.user_id} not found."

            # 检查是否是自己回复自己
            if parent_author.id == replier.id:
                logger.info(f"[TASK_INFO] User {replier.id} replied to their own comment. Skipping notification.")
                return f"Self-reply. No notification needed for reply {comment_id}."

            # 获取文章信息
            article = session.get(Article, reply.article_id)
            article_title = article.title if article else "未知文章"
            
            # 创建通知内容
            replier_name = replier.nickname or replier.username or f"用户{replier.id}"
            notification_content = f"{replier_name}回复了您在《{article_title}》中的评论"
            related_url = f"/articles/{reply.article_id}#comment-{comment_id}"
            
            # 创建通知记录
            notification = Notification(
                recipient_user_id=parent_author.id,
                actor_user_id=replier.id,
                action_type='new_reply',
                target_type='comment',
                target_id=parent_comment_id,
                content=notification_content,
                related_url=related_url,
                created_at=datetime.utcnow()
            )
            
            session.add(notification)
            session.commit()
            
            logger.info(f"[NOTIFICATION_CREATED] ID: {notification.id}, To: User {parent_author.id}, Content: {notification_content}")
            logger.info(f"[TASK_COMPLETED] notify_reply_to_comment_task for comment_id: {comment_id}")
            
            return f"Reply notification created for comment {comment_id} to parent comment author {parent_author.id}."
            
        except OperationalError as exc:
            logger.error(f"[TASK_RETRY] OperationalError for comment_id {comment_id}: {exc}. Retrying...")
            session.rollback()
            raise self.retry(exc=exc)
        except Exception as e:
            logger.error(f"[TASK_FAILED] notify_reply_to_comment_task for comment_id {comment_id} failed: {e}", exc_info=True)
            session.rollback()
            raise self.retry(exc=e)
        finally:
            session.close()

@celery_app.task(bind=True, **RETRY_KWARGS)
def notify_article_liked_task(self, article_id: int, liker_id: int):
    """
    当文章被点赞时，通知文章作者
    """
    logger.info(f"[TASK_STARTED] notify_article_liked_task for article_id: {article_id}, liker_id: {liker_id}")
    
    # 创建应用上下文
    from app import create_app
    from app.models.article import Article
    from app.models.user import User
    from app.models.notification import Notification
    from datetime import datetime
    
    app = create_app()
    with app.app_context():
        # 获取应用的数据库实例
        from app import db
        session = db.session
        
        try:
            # 获取文章信息
            article = session.get(Article, article_id)
            if not article:
                logger.warning(f"[TASK_WARN] Article with id {article_id} not found. Skipping notification.")
                return f"Article {article_id} not found."
            
            # 获取文章作者
            author = session.get(User, article.user_id)
            if not author:
                logger.warning(f"[TASK_WARN] Article author (User ID: {article.user_id}) not found. Skipping notification.")
                return f"Article author {article.user_id} not found."
            
            # 获取点赞用户
            liker = session.get(User, liker_id)
            if not liker:
                logger.warning(f"[TASK_WARN] Liker (User ID: {liker_id}) not found. Skipping notification.")
                return f"Liker {liker_id} not found."
            
            # 检查是否是自己点赞自己的文章
            if author.id == liker.id:
                logger.info(f"[TASK_INFO] User {liker.id} liked their own article. Skipping notification.")
                return f"Self-like. No notification needed for article {article_id}."
            
            # 创建通知内容
            liker_name = liker.nickname or liker.username or f"用户{liker.id}"
            notification_content = f"{liker_name}点赞了您的文章《{article.title}》"
            related_url = f"/articles/{article.id}"
            
            # 创建通知记录
            notification = Notification(
                recipient_user_id=author.id,
                actor_user_id=liker.id,
                action_type='like_article',
                target_type='article',
                target_id=article.id,
                content=notification_content,
                related_url=related_url,
                created_at=datetime.utcnow()
            )
            
            session.add(notification)
            session.commit()
            
            logger.info(f"[NOTIFICATION_CREATED] ID: {notification.id}, To: User {author.id}, Content: {notification_content}")
            logger.info(f"[TASK_COMPLETED] notify_article_liked_task for article_id: {article_id}")
            
            return f"Like notification created for article {article_id} to author {author.id}."
            
        except OperationalError as exc:
            logger.error(f"[TASK_RETRY] OperationalError for article_id {article_id}: {exc}. Retrying...")
            session.rollback()
            raise self.retry(exc=exc)
        except Exception as e:
            logger.error(f"[TASK_FAILED] notify_article_liked_task for article_id {article_id} failed: {e}", exc_info=True)
            session.rollback()
            raise self.retry(exc=e)
        finally:
            session.close()