"""
此模块定义了处理文章 "原始评论" (使用 Comment 模型) 的 API 端点。

主要功能:
- 获取指定文章的原始评论列表 (支持嵌套回复)。
- 创建新的顶级原始评论。
- 创建对现有原始评论的回复。
- 新增：处理评论的点赞和取消点赞。

依赖模型: Comment, Article, User
使用 Flask 蓝图: original_comments_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
(注意: 这是与 comments.py 中 ParagraphComment/ActionComment 不同的评论系统。)
"""
# backend/app/routes/original_comments.py (新文件)
from flask import Blueprint, request, jsonify
from flask_login import current_user # Allow optional login
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, verify_jwt_in_request
from app import db
from app.models import Comment, Article, User, PostComment # Import Comment model
from sqlalchemy import desc, asc, func, select, literal # Remove label
from sqlalchemy import or_, and_ # <--- 添加这一行
from app.models.comment import comment_likes
import logging
from sqlalchemy.orm import joinedload # 确保 joinedload 已导入
from flask import current_app # 导入 current_app
from collections import defaultdict # 导入 defaultdict
from datetime import datetime # Ensure datetime is imported
import base64 # For cursor encoding/decoding
import json   # For cursor encoding/decoding
from app.routes.chat import generate_response_with_context
from app.tasks import generate_ai_comment_reply_task, notify_author_of_new_comment_task # <--- 导入新任务

# --- 修改：移除蓝图定义中的 url_prefix --- 
comments_api_bp = Blueprint('comments_api', __name__) # Use a more generic name and prefix

# 设置日志
# logger = logging.getLogger(__name__) # 不再需要获取特定logger
# logging.basicConfig(level=logging.DEBUG) # 不再需要 basicConfig

# --- 获取文章的原始评论 (包含回复、排序和游标分页) ---
@comments_api_bp.route('/articles/<int:article_id>/comments', methods=['GET'])
def get_article_comments(article_id):
    """获取指定文章的顶级评论列表，支持基于游标的分页和点赞状态"""
    limit = request.args.get('limit', 10, type=int)
    cursor_str = request.args.get('cursor')
    # sort_by (暂时固定为 latest，因为游标分页通常按特定顺序)
    sort_by = 'latest'

    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        if user_identity:
            current_user_id = int(user_identity)
    except Exception:
        current_user_id = None

    try:
        article = Article.query.get(article_id)
        if not article:
            return jsonify({"error": "文章未找到"}), 404

        # --- 构建基础查询 (只查顶级评论) ---
        query = Comment.query.options(
            joinedload(Comment.user) # 预加载作者
        ).filter(
            Comment.article_id == article_id,
            Comment.parent_id == None # 只获取顶级评论
        )

        # --- 处理游标 --- 
        if cursor_str:
            try:
                # 解码游标 (例如: base64 编码的 JSON {'created_at': 'isoformat_string', 'id': comment_id})
                decoded_cursor = base64.urlsafe_b64decode(cursor_str.encode()).decode()
                cursor_data = json.loads(decoded_cursor)
                cursor_created_at = datetime.fromisoformat(cursor_data['created_at'])
                cursor_id = cursor_data['id']
                
                # 应用游标过滤 (获取比游标更旧的评论)
                # (created_at < cursor_created_at) OR (created_at == cursor_created_at AND id < cursor_id)
                query = query.filter(
                    or_(
                        Comment.created_at < cursor_created_at,
                        and_(
                            Comment.created_at == cursor_created_at,
                            Comment.id < cursor_id
                        )
                    )
                )
            except Exception as e:
                current_app.logger.warning(f"无效的游标格式 '{cursor_str}': {e}")
                # 如果游标无效，可以返回错误或忽略它并从头开始
                return jsonify({"error": "无效的游标"}), 400
                
        # --- 应用排序和限制 --- 
        # 按创建时间降序，ID 降序作为 tie-breaker
        query = query.order_by(Comment.created_at.desc(), Comment.id.desc())
        # 多取一个以判断 has_more
        comments_page = query.limit(limit + 1).all()

        # --- 判断是否有更多 --- 
        has_more = len(comments_page) > limit
        # 实际返回的评论列表 (去掉多取的那个)
        comments_to_return = comments_page[:limit]

        # --- 计算下一页的游标 --- 
        next_cursor = None
        if has_more and comments_to_return:
            last_comment = comments_to_return[-1]
            next_cursor_data = json.dumps({
                'created_at': last_comment.created_at.isoformat(),
                'id': last_comment.id
            })
            next_cursor = base64.urlsafe_b64encode(next_cursor_data.encode()).decode()

        # --- 优化：获取本页评论的点赞数和当前用户的点赞状态 --- 
        comment_ids_on_page = [c.id for c in comments_to_return]
        likes_count_map = defaultdict(int)
        liked_by_current_user_ids = set()

        if comment_ids_on_page:
            # 一次性查询点赞数
            likes_query = db.session.query(
                comment_likes.c.comment_id,
                func.count(comment_likes.c.user_id).label('likes_count')
            ).filter(
                comment_likes.c.comment_id.in_(comment_ids_on_page)
            ).group_by(comment_likes.c.comment_id).all()
            for comment_id_from_query, count_from_query in likes_query:
                likes_count_map[comment_id_from_query] = count_from_query

            # 一次性查询当前用户的点赞状态
            if current_user_id:
                user_likes_query = db.session.query(comment_likes.c.comment_id).filter(
                    comment_likes.c.user_id == current_user_id,
                    comment_likes.c.comment_id.in_(comment_ids_on_page)
                ).all()
                liked_by_current_user_ids = {comment_id for comment_id, in user_likes_query}
        
        # --- 序列化评论 --- 
        serialized_comments = []
        for comment in comments_to_return:
            is_liked = comment.id in liked_by_current_user_ids
            current_likes_count = likes_count_map[comment.id]
            comment_data = comment.to_dict(include_replies=False, current_user_id=current_user_id, is_liked=is_liked)
            comment_data['likes_count'] = current_likes_count
            comment_data['replies'] = [] 
            serialized_comments.append(comment_data)
            
        # --- 返回结构化响应 --- 
        return jsonify({
            'comments': serialized_comments,
            'has_more': has_more,
            'next_cursor': next_cursor
            # 'total' 字段对于游标分页不是必需的，可以省略
        })

    except Exception as e:
        current_app.logger.error(f"获取文章评论时出错 (Article ID: {article_id}): {e}", exc_info=True)
        # 保持返回空列表的兼容性？或者返回标准错误结构
        return jsonify({'comments': [], 'has_more': False, 'next_cursor': None}), 500 # 返回标准结构体

# --- 新增：获取文章的完整评论树 (用于主评论区) ---
@comments_api_bp.route('/articles/<int:article_id>/comments/tree', methods=['GET'])
def get_article_comments_tree(article_id):
    """获取指定文章的完整评论树 (包含嵌套回复和点赞状态)，支持排序。"""
    sort_by = request.args.get('sort_by', 'latest') # Default to 'latest'
    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        if user_identity:
            current_user_id = int(user_identity)
    except Exception:
        current_user_id = None

    try:
        article = Article.query.get(article_id)
        if not article:
            return jsonify({"error": "文章未找到"}), 404
            
        # --- 获取该文章下所有评论，预加载 user (与之前非分页版本类似) ---
        likes_subquery = db.session.query(
            comment_likes.c.comment_id, 
            func.count(comment_likes.c.user_id).label('likes_count')
        ).group_by(comment_likes.c.comment_id).subquery()
        
        all_comments_query = db.session.query(
            Comment, 
            likes_subquery.c.likes_count
        ).outerjoin(
            likes_subquery, Comment.id == likes_subquery.c.comment_id
        ).options(
            joinedload(Comment.user) 
        ).filter(
            Comment.article_id == article_id
        ) # .order_by(Comment.created_at.asc()) # 获取所有，按创建时间升序排列 (移除旧的固定排序)

        # --- 新增：根据 sort_by 参数应用排序 ---
        if sort_by == 'popular':
            # 按点赞数降序，然后按创建时间降序（确保点赞数相同时有稳定排序）
            all_comments_query = all_comments_query.order_by(likes_subquery.c.likes_count.desc().nullslast(), Comment.created_at.desc())
        else: # Default to 'latest' (or any other value)
            # 按创建时间降序 (最新在前)
            all_comments_query = all_comments_query.order_by(Comment.created_at.desc())
        # --- 结束新增 ---

        all_comments_results = all_comments_query.all()
        all_comments_with_likes = [(comment, current_likes_count or 0) for comment, current_likes_count in all_comments_results]

        # --- 查询当前用户的点赞记录 (与之前非分页版本类似) ---
        liked_comment_ids = set()
        if current_user_id:
            all_comment_ids = [c.id for c, _ in all_comments_with_likes]
            if all_comment_ids:
                likes = db.session.query(comment_likes.c.comment_id).filter(
                    comment_likes.c.user_id == current_user_id,
                    comment_likes.c.comment_id.in_(all_comment_ids)
                ).all()
                liked_comment_ids = {like[0] for like in likes}

        # --- 构建评论树 (修改为两遍处理，不依赖原始顺序) ---
        comment_dict_map = {}
        # 第一遍：序列化所有评论并存入 map
        for comment, current_likes_count in all_comments_with_likes:
            is_liked = comment.id in liked_comment_ids
            # 注意：这里调用 to_dict 时 include_replies 应该为 True，以便 to_dict 内部能初始化 replies 列表
            # 或者，确保 serialize_comment 总是会添加一个空的 'replies' 键
            comment_data = comment.to_dict(include_replies=True, current_user_id=current_user_id, is_liked=is_liked)
            # 如果 to_dict 返回的 comment_data 中 replies 可能不是空列表，或没有 replies 键，则需要手动设置
            if 'replies' not in comment_data or not isinstance(comment_data['replies'], list):
                 comment_data['replies'] = [] # 确保 replies 是一个空列表，为后续填充做准备
            else:
                 comment_data['replies'] = [] # 强制清空，因为 to_dict(include_replies=True) 可能会尝试递归填充
            
            comment_data['likes_count'] = current_likes_count # 确保点赞数被正确设置或覆盖
            comment_dict_map[comment.id] = comment_data

        nested_comments = []
        # 第二遍：构建树结构
        for comment_id, comment_data in comment_dict_map.items():
            parent_id = comment_data.get('parent_id')
            if parent_id is None:
                nested_comments.append(comment_data)
            elif parent_id in comment_dict_map:
                parent_comment_data = comment_dict_map[parent_id]
                # 确保父评论的 replies 字段是列表
                if not isinstance(parent_comment_data.get('replies'), list):
                    parent_comment_data['replies'] = [] # 初始化，理论上第一遍已经做过
                parent_comment_data['replies'].append(comment_data)
            # 不需要 else 了，因为所有评论都在 map 里，孤儿评论（parent_id 指向不存在的评论）不会被挂载
        # --- 结束构建评论树的修改 ---

        # --- 对顶级评论和子评论进行排序（如果需要） ---
        if sort_by == 'popular':
            # 对顶级评论排序
            nested_comments.sort(key=lambda c: (c.get('likes_count', 0), c.get('created_at', '')), reverse=True)
            # 对每一层的子评论进行排序
            for comment_data in comment_dict_map.values():
                if isinstance(comment_data.get('replies'), list) and comment_data['replies']:
                    comment_data['replies'].sort(key=lambda r: (r.get('likes_count', 0), r.get('created_at', '')), reverse=True)
        elif sort_by == 'latest': # 对 'latest' 也进行排序，以确保顶级和子回复都是最新的在前
            nested_comments.sort(key=lambda c: c.get('created_at', ''), reverse=True)
            for comment_data in comment_dict_map.values():
                if isinstance(comment_data.get('replies'), list) and comment_data['replies']:
                    comment_data['replies'].sort(key=lambda r: r.get('created_at', ''), reverse=True)
        # 对于其他排序方式 (如果未来有)，可能也需要类似处理
        
        # --- 返回嵌套的评论数组 --- 
        return jsonify(nested_comments) # 直接返回数组

    except Exception as e:
        current_app.logger.error(f"获取文章评论树时出错 (Article ID: {article_id}): {e}", exc_info=True)
        return jsonify([]), 500 # 保持错误时返回空数组
# --- 结束新增 ---

# --- 创建新的顶级原始评论 (需要登录) ---
@comments_api_bp.route('/articles/<int:article_id>/comments', methods=['POST'])
@jwt_required()
def create_article_comment(article_id):
    data = request.get_json()

    if not data or 'content' not in data:
        return jsonify({"error": "缺少 'content' 字段"}), 400

    content = data['content'].strip()
    mention_lynn = data.get('mention_lynn', False)

    if not content:
        return jsonify({"error": "'content' 不能为空"}), 400

    try:
        user_id_from_jwt = get_jwt_identity()
        if not user_id_from_jwt: return jsonify({"error": "无法从令牌获取用户身份"}), 401
        current_user_id_int = int(user_id_from_jwt)
    except Exception as e:
        current_app.logger.error(f"Error getting JWT identity or converting to int: {e}")
        return jsonify({"error": "处理身份验证时出错"}), 500

    try:
        article = Article.query.get_or_404(article_id)
        
        new_comment = Comment(
            content=content,
            article_id=article_id,
            user_id=current_user_id_int, 
            parent_id=None
        )
        
        db.session.add(new_comment)
        # --- 重要：先提交用户评论，以便获取其 ID --- 
        db.session.commit()
        # db.session.flush() # flush might not be enough if task executes very quickly in a different session context
        user_comment_id = new_comment.id # Get ID after commit

        if mention_lynn:
            question_for_ai = ""
            try:
                mention_keyword = "@lynn"
                start_index = content.lower().find(mention_keyword)
                if start_index != -1:
                    question_for_ai = content[start_index + len(mention_keyword):].strip()
                
                if question_for_ai:
                    current_app.logger.info(f"[API_CREATE_COMMENT] User comment ID {user_comment_id} - Queueing AI reply task. Question: {question_for_ai}")
                    
                    article_title_for_task = article.title
                    article_content_for_task = article.content
                    article_summary_for_task = article.summary if hasattr(article, 'summary') and article.summary else None

                    generate_ai_comment_reply_task.delay(
                        user_comment_id=user_comment_id,
                        article_id=article_id,
                        user_question=question_for_ai,
                        article_title=article_title_for_task,
                        article_content=article_content_for_task,  # 修改：传递整篇文章内容
                        article_summary=article_summary_for_task,  # 修改：传递文章摘要（如果有）
                        original_user_id=current_user_id_int
                    )
                else:
                    current_app.logger.info(f"[API_CREATE_COMMENT] User comment ID {user_comment_id} - Mention @lynn detected, but no subsequent question found.")
            except Exception as task_e:
                # Log error in queueing task, but don't let it fail the user's comment creation
                current_app.logger.error(f"[API_CREATE_COMMENT] User comment ID {user_comment_id} - Error queueing AI reply task: {task_e}", exc_info=True)
        
        # db.session.commit() # User comment is already committed
        db.session.refresh(new_comment) # Refresh to get all fields correctly populated for the response
        # Ensure user object is loaded for to_dict if it wasn't part of the initial commit eager loading
        if new_comment.user is None and current_user_id_int is not None:
             user_obj = User.query.get(current_user_id_int)
             if user_obj:
                 new_comment.user = user_obj

        # --- 新增：调用 Celery 任务通知文章作者 ---
        try:
            notify_author_of_new_comment_task.delay(new_comment.id)
            current_app.logger.info(f"[API_CREATE_COMMENT] Queued notification task for comment {new_comment.id} on article {article_id}")
        except Exception as task_e:
            current_app.logger.error(f"[API_CREATE_COMMENT] Error queueing notification task for comment {new_comment.id}: {task_e}", exc_info=True)
        # --- 结束新增 ---

        return jsonify(new_comment.to_dict(include_replies=False, current_user_id=current_user_id_int, is_liked=False)), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"[API_CREATE_COMMENT] Error creating article comment (Article ID: {article_id}): {e}", exc_info=True)
        return jsonify({"error": f"创建评论失败: {str(e)}"}), 500

# --- 创建回复 (需要登录) ---
@comments_api_bp.route('/articles/<int:article_id>/comments/<int:parent_id>/replies', methods=['POST'])
@jwt_required()
def create_article_reply(article_id, parent_id):
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({"error": "缺少 'content' 字段"}), 400
    content = data['content'].strip()
    # 新增：获取前端传递的 @lynn 提及布尔标记 for reply
    mention_lynn_in_reply = data.get('mention_lynn', False)

    if not content:
        return jsonify({"error": "'content' 不能为空"}), 400

    try:
        user_id_from_jwt = get_jwt_identity()
        if not user_id_from_jwt: return jsonify({"error": "无法从令牌获取用户身份"}), 401
        current_user_id_int = int(user_id_from_jwt)
    except Exception as e:
        current_app.logger.error(f"Error getting JWT identity for reply: {e}")
        return jsonify({"error": "处理身份验证时出错"}), 500

    try:
        article = Article.query.get_or_404(article_id) # 确保文章存在
        parent_comment_obj = Comment.query.get_or_404(parent_id) # 确保父评论存在

        if parent_comment_obj.article_id != article_id:
             return jsonify({"error": "要回复的评论不属于此文章"}), 400

        # 创建用户的回复
        new_reply_comment = Comment(
            content=content,
            article_id=article_id,
            user_id=current_user_id_int,
            parent_id=parent_id
        )

        db.session.add(new_reply_comment)
        # --- 重要：先提交用户回复，以便获取其 ID --- 
        db.session.commit()
        user_reply_id = new_reply_comment.id # Get ID after commit

        # 如果在回复中提到了 @lynn
        if mention_lynn_in_reply:
            question_for_ai_in_reply = ""
            try:
                mention_keyword = "@lynn"
                start_index = content.lower().find(mention_keyword)
                if start_index != -1:
                    question_for_ai_in_reply = content[start_index + len(mention_keyword):].strip()
                
                if question_for_ai_in_reply:
                    current_app.logger.info(f"[API_CREATE_REPLY] User reply ID {user_reply_id} - Queueing AI reply task. Question: {question_for_ai_in_reply}")

                    article_title_for_task = article.title
                    # For replies, the primary context is the parent comment, but article context is still good.
                    # 修改: 获取整篇文章内容，而不仅是片段
                    article_content_for_task = article.content
                    article_summary_for_task = article.summary if hasattr(article, 'summary') and article.summary else None
                    # 添加父评论内容作为上下文
                    parent_comment_content = parent_comment_obj.content if parent_comment_obj else None
                    
                    # We can also consider passing parent_comment_obj.content snippet to the task for more context
                    generate_ai_comment_reply_task.delay(
                        user_comment_id=user_reply_id, # The ID of the user's *reply* becomes the parent for AI's reply
                        article_id=article_id,
                        user_question=question_for_ai_in_reply,
                        article_title=article_title_for_task,
                        article_content=article_content_for_task,  # 修改：传递整篇文章内容
                        article_summary=article_summary_for_task,  # 修改：传递文章摘要（如果有）
                        parent_comment_content=parent_comment_content,  # 新增：传递父评论内容
                        original_user_id=current_user_id_int
                    )
                else:
                    current_app.logger.info(f"[API_CREATE_REPLY] User reply ID {user_reply_id} - Mention @lynn detected, but no subsequent question found.")
            except Exception as task_e:
                current_app.logger.error(f"[API_CREATE_REPLY] User reply ID {user_reply_id} - Error queueing AI reply task: {task_e}", exc_info=True)
        
        # db.session.commit() # User reply is already committed
        db.session.refresh(new_reply_comment)
        if new_reply_comment.user is None and current_user_id_int is not None:
            user_obj = User.query.get(current_user_id_int)
            if user_obj:
                new_reply_comment.user = user_obj

        # --- 新增：调用 Celery 任务通知文章作者 (回复也通知) ---
        try:
            from app.tasks import notify_author_of_new_comment_task, notify_reply_to_comment_task
            # 通知文章作者有新回复
            notify_author_of_new_comment_task.delay(new_reply_comment.id)
            # 通知被回复的评论作者
            notify_reply_to_comment_task.delay(new_reply_comment.id)
            current_app.logger.info(f"[API_CREATE_REPLY] Queued notification tasks for reply {new_reply_comment.id} on article {article_id}")
        except Exception as task_e:
            current_app.logger.error(f"[API_CREATE_REPLY] Error queueing notification tasks for reply {new_reply_comment.id}: {task_e}", exc_info=True)
        # --- 结束新增 ---

        return jsonify(new_reply_comment.to_dict(include_replies=False, current_user_id=current_user_id_int)), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"[API_CREATE_REPLY] Error creating reply (Article ID: {article_id}, Parent: {parent_id}): {e}", exc_info=True)
        return jsonify({"error": f"创建回复失败: {str(e)}"}), 500 

# --- 新增：点赞评论 --- 
@comments_api_bp.route('/comments/<int:comment_id>/like', methods=['POST'])
@jwt_required()
def like_comment(comment_id):
    target_type = request.args.get('target_type', 'article') 
    # print(f"[DEBUG] Received like request for comment_id: {comment_id}, target_type: {target_type}") # 注释掉 print
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    comment = None
    if target_type == 'article':
        comment = Comment.query.get(comment_id)
    elif target_type == 'post':
        comment = PostComment.query.get(comment_id)
    # print(f"[DEBUG] Comment query result...: {comment}") # 注释掉 print
    
    if not comment:
        return jsonify({'error': '评论不存在'}), 404
    if not user:
         return jsonify({'error': '用户不存在'}), 404

    # 检查是否已经点赞
    if user in comment.likers:
        return jsonify({
            'message': '你已经点赞过这条评论了',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': True
        }), 200

    try:
        comment.likers.append(user)
        db.session.commit()
        # --- 新增：异步更新文章评论的点赞数 ---
        try:
            from app.tasks import update_article_comment_likes_count
            update_article_comment_likes_count.delay(comment.id)
        except Exception as task_e:
            current_app.logger.error(f"Failed to queue article comment likes count update task for comment {comment.id}: {task_e}")
        # --- 结束新增 ---
        return jsonify({
            'message': '点赞成功',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': True
        }), 201
    except Exception as e:
        db.session.rollback()
        # print(f"点赞评论 {comment_id} ({target_type}) 时出错: {e}") # 注释掉 print
        current_app.logger.error(f"点赞评论 {comment_id} ({target_type}) 时出错: {e}", exc_info=True) # 保留 logger
        return jsonify({"error": f"点赞失败: {str(e)}"}), 500

# --- 新增：取消点赞评论 ---
@comments_api_bp.route('/comments/<int:comment_id>/like', methods=['DELETE'])
@jwt_required()
def unlike_comment(comment_id):
    target_type = request.args.get('target_type', 'article') 
    # print(f"[DEBUG] Received unlike request for comment_id: {comment_id}, target_type: {target_type}") # 注释掉 print
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    comment = None
    if target_type == 'article':
        comment = Comment.query.get(comment_id)
    elif target_type == 'post':
        comment = PostComment.query.get(comment_id)
    # print(f"[DEBUG] Comment query result...: {comment}") # 注释掉 print
    
    if not comment:
        return jsonify({'error': '评论不存在'}), 404
    if not user:
         return jsonify({'error': '用户不存在'}), 404

    # 检查是否已经点赞
    if user not in comment.likers:
        return jsonify({
            'message': '你还没有点赞这条评论',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': False
        }), 200

    try:
        comment.likers.remove(user)
        db.session.commit()
        # --- 新增：异步更新文章评论的点赞数 ---
        try:
            from app.tasks import update_article_comment_likes_count
            update_article_comment_likes_count.delay(comment.id)
        except Exception as task_e:
            current_app.logger.error(f"Failed to queue article comment likes count update task for comment {comment.id} after unlike: {task_e}")
        # --- 结束新增 ---
        return jsonify({
            'message': '取消点赞成功',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': False
        }), 200
    except Exception as e:
        db.session.rollback()
        # print(f"取消点赞评论 {comment_id} ({target_type}) 时出错: {e}") # 注释掉 print
        current_app.logger.error(f"取消点赞评论 {comment_id} ({target_type}) 时出错: {e}", exc_info=True) # 保留 logger
        return jsonify({"error": f"取消点赞失败: {str(e)}"}), 500
# --- 结束新增 --- 

# --- 删除文章评论 --- 
@comments_api_bp.route('/articles/<int:article_id>/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_article_comment(article_id, comment_id):
    """软删除指定的文章评论（仅评论作者或管理员可操作）"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "无法从令牌获取用户身份"}), 401

        # 查找评论
        comment = Comment.query.get(comment_id)
        if not comment:
            return jsonify({"error": "评论未找到"}), 404

        # 检查评论是否属于指定文章
        if comment.article_id != article_id:
            return jsonify({"error": "评论不属于此文章"}), 400

        # 权限检查
        current_user = User.query.get(user_id)
        if not current_user:
             return jsonify({"error": "用户信息不存在"}), 401
        if comment.user_id != user_id and not current_user.is_admin:
            return jsonify({"error": "您没有权限删除此评论"}), 403

        # --- 核心修改：执行软删除 --- 
        if comment.is_deleted:
             return jsonify({"message": "评论已被删除"}), 200
             
        comment.is_deleted = True
        db.session.commit()
        # --- 结束核心修改 --- 
        
        current_app.logger.info(f"User {user_id} soft deleted comment {comment_id} for article {article_id}")
        return '', 204

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"软删除文章评论时出错 (Article ID: {article_id}, Comment ID: {comment_id}): {e}", exc_info=True)
        return jsonify({"error": f"删除评论失败: {str(e)}"}), 500
# --- 结束新增 --- 

# --- 新增：恢复已删除的文章评论 ---
@comments_api_bp.route('/articles/<int:article_id>/comments/<int:comment_id>/restore', methods=['POST'])
@jwt_required()
def restore_article_comment(article_id, comment_id):
    """恢复已软删除的文章评论（仅评论作者或管理员可操作）"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "无法从令牌获取用户身份"}), 401

        # 查找评论
        comment = Comment.query.get(comment_id)
        if not comment:
            return jsonify({"error": "评论未找到"}), 404

        # 检查评论是否属于指定文章
        if comment.article_id != article_id:
            return jsonify({"error": "评论不属于此文章"}), 400

        # 权限检查
        current_user = User.query.get(user_id)
        if not current_user:
             return jsonify({"error": "用户信息不存在"}), 401
        if comment.user_id != user_id and not current_user.is_admin:
            return jsonify({"error": "您没有权限恢复此评论"}), 403

        # 检查评论是否已被删除
        if not comment.is_deleted:
             return jsonify({"message": "评论未被删除，无需恢复"}), 200
             
        # 执行恢复操作
        comment.is_deleted = False
        db.session.commit()
        
        current_app.logger.info(f"User {user_id} restored comment {comment_id} for article {article_id}")
        return jsonify({"message": "评论已成功恢复"}), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"恢复文章评论时出错 (Article ID: {article_id}, Comment ID: {comment_id}): {e}", exc_info=True)
        return jsonify({"error": f"恢复评论失败: {str(e)}"}), 500
# --- 结束新增 ---

# --- 新增：编辑文章评论 --- 
@comments_api_bp.route('/articles/<int:article_id>/comments/<int:comment_id>', methods=['PUT'])
@jwt_required()
def update_article_comment(article_id, comment_id):
    """更新文章评论（仅评论作者或管理员可操作）"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "无法从令牌获取用户身份"}), 401

        data = request.get_json()
        if not data or 'content' not in data:
            return jsonify({"error": "缺少更新内容"}), 400
            
        content = data['content'].strip()
        if not content:
            return jsonify({"error": "评论内容不能为空"}), 400

        # 查找评论
        comment = Comment.query.get(comment_id)
        if not comment:
            return jsonify({"error": "评论未找到"}), 404

        # 检查评论是否属于指定文章
        if comment.article_id != article_id:
            return jsonify({"error": "评论不属于此文章"}), 400

        # 权限检查
        current_user = User.query.get(user_id)
        if not current_user:
             return jsonify({"error": "用户信息不存在"}), 401
        if comment.user_id != user_id and not current_user.is_admin:
            return jsonify({"error": "您没有权限编辑此评论"}), 403

        if comment.is_deleted:
             return jsonify({"error": "已删除的评论不能编辑"}), 400
             
        # 保存原始内容（可选，用于日志或历史记录）
        original_content = comment.content
        
        # 更新评论内容
        comment.content = content
        comment.is_edited = True  # 标记为已编辑
        db.session.commit()
        
        current_app.logger.info(f"User {user_id} edited comment {comment_id} for article {article_id}")
        return jsonify(comment.to_dict(include_replies=False, current_user_id=user_id)), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"编辑文章评论时出错 (Article ID: {article_id}, Comment ID: {comment_id}): {e}", exc_info=True)
        return jsonify({"error": f"编辑评论失败: {str(e)}"}), 500
# --- 结束新增 ---