"""
模型包初始化文件。

导入所有模型类，使其可以通过 app.models.ModelName 的方式被访问。
同时定义一些跨模型的数据库对象，例如复合索引。

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from .category import Category
from .tool import Tool
from .article import Article
from .feedback import Feedback
from .comment import Comment
from .user import User, load_user, UserFavoriteTopic, UserFollow
from .conversation import Conversation
from .message import Message
from .dynamic import Dynamic
from .user_action import UserAction
from .action_interaction import ActionInteraction
from .action_comment import ActionComment
from .topic import Topic, UserTopicPosition
from .answer import Answer
from .post import Post
from .post_comment import PostComment
# 导入聊天室相关模型
from .chat_room import ChatRoom
from .chat_message import ChatMessage
# 导入新增的交互模型
from .article_interaction import ArticleInteraction
from .post_interaction import PostInteraction
# 导入全局交互模型
from .global_interaction import GlobalInteraction
# 导入通知模型
from .notification import Notification

# Re-import db and Index if necessary for defining indexes here
from app import db
from sqlalchemy import Index
from datetime import datetime

# Define composite indexes or other database-level objects that span models
# Make sure the models (e.g., Article) are imported before defining the index
Index('ix_article_user_series', Article.user_id, Article.series_name)

__all__ = [
    'Category',
    'Tool',
    'Article',
    'Feedback',
    'Comment',
    # 删除段落评论模型
    # 'ParagraphComment',
    'User',
    'load_user', # Export if needed elsewhere
    'Conversation',
    'Message',
    'Dynamic',
    'UserAction',
    'ActionInteraction',
    'ActionComment',
    'Topic',
    'UserTopicPosition',
    'UserFavoriteTopic',
    'UserFollow',
    'Answer',
    'Post',
    'PostComment',
    # 添加新增模型到 __all__ 列表
    'ChatRoom',
    'ChatMessage',
    # 新增的交互模型
    'ArticleInteraction',
    'PostInteraction',
    'GlobalInteraction',
    # 通知模型
    'Notification',
] 

def init_app(app):
    """
    可以在这里添加模型相关的初始化逻辑，如果需要的话。
    例如，创建特定的数据库扩展或执行初始数据填充。
    """
    pass

# 可以在模型定义之后添加检查函数或辅助函数
def check_relationships():
    """
    示例：检查模型关系是否按预期设置 (仅用于开发/调试)
    """
    print("Checking model relationships...")
    # Add checks here, e.g., print(User.query.first().articles.all())
    pass

# --- 确保 Flask-Migrate 能看到所有模型 ---
# The imports above should be sufficient. 