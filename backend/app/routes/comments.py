"""
此模块定义了处理动态评论的 API 端点:
动态评论 (ActionComment): 针对用户行为/动态 (UserAction) 的评论。

主要功能:
- 获取指定动态的所有评论 (包含回复)。
- 为指定动态添加评论或回复。

依赖模型: Article, User, ActionComment, UserAction
使用 Flask 蓝图: comments_bp (前缀 /api)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, request, jsonify, current_app
# --- 修改：移除 flask_login, 导入 flask_jwt_extended ---
# from flask_login import login_required, current_user 
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from flask_cors import cross_origin # 导入 cross_origin
from app import db
from app.models import Article, User, ActionComment, UserAction, Comment, PostComment # 删除ParagraphComment导入
from app.models.comment import comment_likes # 导入文章评论点赞表
from sqlalchemy import desc
from sqlalchemy.sql import text
from sqlalchemy import Table, Column, Integer, ForeignKey, DateTime
from datetime import datetime
from app.models.action_comment import action_comment_likes

# 删除段落评论蓝图
# paragraph_comments_bp = Blueprint('paragraph_comments', __name__)
comments_bp = Blueprint('comments_bp', __name__)

# print("!!! backend/app/routes/comments.py loaded and comments_bp defined !!!") # REMOVE THIS DIAGNOSTIC PRINT

# --- 删除段落评论相关的路由和函数 --- 

# --- 获取某条动态的所有评论 (包含回复) ---
# @comments_bp.route('/actions/<int:action_id>/comments', methods=['GET'])
# def get_action_comments(action_id):
#     try:
#         # 尝试获取当前用户ID (可选的JWT验证)
#         current_user_id = None
#         try:
#             verify_jwt_in_request(optional=True)
#             current_user_id = get_jwt_identity()
#         except:
#             pass  # 无需处理异常，未登录用户仍然可以查看评论
#             
#         # 找到对应的 Action
#         action = UserAction.query.get(action_id)
#         if not action:
#             return jsonify({"error": "指定的动态不存在"}), 404
#         
#         # 查询该 Action 下的所有顶级评论 (parent_id 为 NULL)
#         top_level_comments = ActionComment.query.filter_by(action_id=action_id, parent_id=None).order_by(ActionComment.created_at).all()
#         
#         # 如果用户已登录，一次性查询该用户对所有评论的点赞状态
#         liked_comment_ids = set()
#         if current_user_id:
#             # 收集所有评论ID (包括回复)
#             all_comment_ids = []
#             
#             def collect_comment_ids(comments):
#                 for comment in comments:
#                     all_comment_ids.append(comment.id)
#                     if comment.replies:
#                         collect_comment_ids(comment.replies.all())
#             
#             collect_comment_ids(top_level_comments)
#             
#             # 查询用户点赞记录
#             if all_comment_ids:
#                 likes = db.session.query(action_comment_likes).filter(
#                     action_comment_likes.c.user_id == current_user_id,
#                     action_comment_likes.c.comment_id.in_(all_comment_ids)
#                 ).all()
#                 liked_comment_ids = {like[0] for like in likes}
#         
#         # 递归处理评论及其回复，添加点赞信息
#         def process_comment_with_likes(comment):
#             comment_dict = comment.to_dict()
#             
#             # 添加点赞信息
#             like_count = db.session.query(action_comment_likes).filter(
#                 action_comment_likes.c.comment_id == comment.id
#             ).count()
#             
#             comment_dict['likes_count'] = like_count
#             
#             # 查询当前用户是否点赞过该评论
#             if current_user_id:
#                 is_liked = db.session.query(action_comment_likes).filter(
#                     action_comment_likes.c.user_id == current_user_id,
#                     action_comment_likes.c.comment_id == comment.id
#                 ).first() is not None
#                 comment_dict['is_liked'] = is_liked
#             else:
#                 comment_dict['is_liked'] = False
#             
#             # 递归处理回复
#             if 'replies' in comment_dict and comment_dict['replies']:
#                 for i, reply in enumerate(comment_dict['replies']):
#                     reply_obj = comment.replies.all()[i]
#                     comment_dict['replies'][i] = process_comment_with_likes(reply_obj)
#                     
#             return comment_dict
#         
#         # 处理所有顶级评论
#         results = [process_comment_with_likes(comment) for comment in top_level_comments]
#         
#         return jsonify({"comments": results})
#
#     except Exception as e:
#         print(f"Error fetching comments for action {action_id}: {e}")
#         import traceback
#         traceback.print_exc()
#         return jsonify({"error": "获取评论失败"}), 500

# --- 为某条动态添加评论或回复 ---
# @comments_bp.route('/actions/<int:action_id>/comments', methods=['POST'])
# @jwt_required()
# def post_action_comment(action_id):
#     current_user_id = get_jwt_identity()
#     data = request.get_json()
#     content = data.get('content')
#     parent_id = data.get('parent_id') # 可选，用于回复
#
#     if not content:
#         return jsonify({"error": "评论内容不能为空"}), 400
#     
#     # 检查 Action 是否存在
#     action = UserAction.query.get(action_id)
#     if not action:
#         return jsonify({"error": "指定的动态不存在"}), 404
#     
#     # 如果是回复，检查父评论是否存在且属于同一 Action
#     if parent_id:
#         parent_comment = ActionComment.query.filter_by(id=parent_id, action_id=action_id).first()
#         if not parent_comment:
#             return jsonify({"error": "要回复的评论不存在或不属于该动态"}), 404
#             
#     try:
#         new_comment = ActionComment(
#             content=content,
#             user_id=current_user_id,
#             action_id=action_id,
#             parent_id=parent_id
#         )
#         db.session.add(new_comment)
#         db.session.commit()
#         
#         # 返回新创建的评论 (包含用户信息)
#         return jsonify(new_comment.to_dict(include_replies=False)), 201 # 回复暂时不需要在响应中包含
#
#     except Exception as e:
#         db.session.rollback()
#         print(f"Error posting comment for action {action_id}: {e}")
#         return jsonify({"error": "评论发表失败"}), 500

# --- 启用并完善删除动态评论 (ActionComment) 的路由 --- 
@comments_bp.route('/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_action_comment(comment_id):
    """标记删除指定的动态评论 (ActionComment)"""
    current_user_id = get_jwt_identity()
    comment = ActionComment.query.get(comment_id)
    
    if not comment:
        print(f"Attempted to delete non-existent ActionComment with ID: {comment_id}")
        return jsonify({"error": "评论不存在"}), 404
        
    # 权限检查：确保用户只能删除自己的评论 (管理员逻辑可以稍后添加)
    if comment.user_id != current_user_id:
        print(f"User {current_user_id} attempt to delete comment {comment_id} owned by {comment.user_id}")
        # 在实际应用中，可能还需要允许管理员删除
        # current_user_obj = User.query.get(current_user_id)
        # if not current_user_obj or not current_user_obj.is_admin:
        return jsonify({"error": "无权删除此评论"}), 403
        
    # --- 核心修改：执行软删除 --- 
    try:
        # 检查是否已经被删除了 (避免重复操作)
        if comment.is_deleted:
            print(f"ActionComment {comment_id} is already marked as deleted.")
            # 即使已删除，也返回成功，保持幂等性
            return jsonify(comment.to_dict(include_replies=False)), 200 
            
        print(f"Soft deleting ActionComment {comment_id} by user {current_user_id}")
        # 标记为已删除
        comment.is_deleted = True
        # (可选) 备份原始内容，如果模型中有相应字段
        if hasattr(comment, 'original_content'):
             comment.original_content = comment.content
        # 更新数据库记录
        db.session.add(comment)
        db.session.commit()
        
        print(f"ActionComment {comment_id} marked as deleted successfully.")
        # 返回更新后的评论数据 (包含 is_deleted=True 和处理后的 content)
        return jsonify(comment.to_dict(include_replies=False)), 200 # 返回 200 OK 和更新后的数据
        
    except Exception as e:
        db.session.rollback()
        print(f"Error soft deleting ActionComment {comment_id}: {e}")
        return jsonify({"error": "删除评论失败"}), 500
# --- 结束启用和完善 ---

# --- 新增: 评论点赞 API (统一处理多种评论类型) ---
@comments_bp.route('/<int:comment_id>/like', methods=['POST'])
@jwt_required()
def like_comment(comment_id):
    target_type = request.args.get('target_type')
    # current_app.logger.debug(f"[LIKE_COMMENT] Received request: comment_id={comment_id}, target_type='{target_type}'") # REMOVE

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    # current_app.logger.debug(f"[LIKE_COMMENT] User ID from JWT: {user_id}, User object: {user}") # REMOVE

    if not user:
        # current_app.logger.warning(f"[LIKE_COMMENT] User with id {user_id} not found. Returning 404.") # REMOVE
        return jsonify({'error': '用户不存在'}), 404
    
    if target_type == 'action':
        # current_app.logger.debug(f"[LIKE_COMMENT] Processing target_type 'action' for comment_id {comment_id}") # REMOVE
        comment = ActionComment.query.get(comment_id)
        # current_app.logger.debug(f"[LIKE_COMMENT] ActionComment query result for id {comment_id}: {comment}") # REMOVE

        if not comment:
            # current_app.logger.warning(f"[LIKE_COMMENT] ActionComment with id {comment_id} not found. Returning 404.") # REMOVE
            return jsonify({'error': '评论不存在'}), 404
        
        existing_like = db.session.query(action_comment_likes).filter(
            action_comment_likes.c.user_id == user_id,
            action_comment_likes.c.comment_id == comment_id
        ).first()
        # current_app.logger.debug(f"[LIKE_COMMENT] Existing like for user {user_id} on comment {comment_id}: {existing_like}") # REMOVE

        if existing_like:
            # current_app.logger.info(f"[LIKE_COMMENT] User {user_id} already liked comment {comment_id}. Returning 200.") # REMOVE
            like_count = db.session.query(action_comment_likes).filter(
                action_comment_likes.c.comment_id == comment_id
            ).count()
            return jsonify({
                'message': '你已经点赞过这条评论了',
                'like_count': like_count,
                'is_liked': True
            }), 200
        
        try:
            stmt = action_comment_likes.insert().values(
                user_id=user_id,
                comment_id=comment_id,
                created_at=datetime.utcnow()
            )
            db.session.execute(stmt)
            db.session.commit()
            like_count = db.session.query(action_comment_likes).filter(
                action_comment_likes.c.comment_id == comment_id
            ).count()
            # current_app.logger.info(f"[LIKE_COMMENT] Successfully liked ActionComment {comment_id} for user {user_id}. New like count: {like_count}. Returning 201.") # REMOVE
            return jsonify({
                'message': '点赞成功',
                'like_count': like_count,
                'is_liked': True
            }), 201
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[LIKE_COMMENT] Error liking ActionComment {comment_id} for user {user_id}: {e}", exc_info=True) # KEEP THIS ERROR LOG
            return jsonify({'error': f'点赞失败: {str(e)}'}), 500
            
    elif target_type == 'article':
        # current_app.logger.debug(f"[LIKE_COMMENT] Processing target_type 'article' for comment_id {comment_id}") # REMOVE
        comment = Comment.query.get(comment_id)
        if not comment:
            return jsonify({'error': '评论不存在'}), 404
            
        if user in comment.likers:
            return jsonify({
                'message': '你已经点赞过这条评论了',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': True
            }), 200
            
        try:
            comment.likers.append(user)
            db.session.commit()
            return jsonify({
                'message': '点赞成功',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': True
            }), 201
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[LIKE_COMMENT] Error liking ArticleComment {comment_id} for user {user_id}: {e}", exc_info=True)
            return jsonify({'error': f'点赞失败: {str(e)}'}), 500
            
    elif target_type == 'post':
        # current_app.logger.debug(f"[LIKE_COMMENT] Processing target_type 'post' for comment_id {comment_id}") # REMOVE
        comment = PostComment.query.get(comment_id)
        if not comment:
            return jsonify({'error': '评论不存在'}), 404
            
        if user in comment.likers:
            return jsonify({
                'message': '你已经点赞过这条评论了',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': True
            }), 200
            
        try:
            comment.likers.append(user)
            db.session.commit()
            try:
                from app.tasks import update_post_comment_likes_count
                update_post_comment_likes_count.delay(comment_id)
            except Exception as e:
                current_app.logger.error(f"Failed to queue post comment likes count update task for comment {comment_id}: {e}")
            return jsonify({
                'message': '点赞成功',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': True
            }), 201
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[LIKE_COMMENT] Error liking PostComment {comment_id} for user {user_id}: {e}", exc_info=True)
            return jsonify({'error': f'点赞失败: {str(e)}'}), 500
    else:
        # current_app.logger.warning(f"[LIKE_COMMENT] Unsupported target_type: '{target_type}' for comment_id {comment_id}. Returning 400.") # REMOVE
        return jsonify({"error": "不支持的评论类型"}), 400

# --- 新增: 取消评论点赞 API (统一处理多种评论类型) ---
@comments_bp.route('/<int:comment_id>/like', methods=['DELETE'])
@jwt_required()
def unlike_comment(comment_id):
    target_type = request.args.get('target_type')
    # current_app.logger.debug(f"[UNLIKE_COMMENT] Received request: comment_id={comment_id}, target_type='{target_type}'") # REMOVE

    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    # current_app.logger.debug(f"[UNLIKE_COMMENT] User ID from JWT: {user_id}, User object: {user}") # REMOVE

    if not user:
        # current_app.logger.warning(f"[UNLIKE_COMMENT] User with id {user_id} not found. Returning 404.") # REMOVE
        return jsonify({'error': '用户不存在'}), 404
    
    if target_type == 'action':
        # current_app.logger.debug(f"[UNLIKE_COMMENT] Processing target_type 'action' for comment_id {comment_id}") # REMOVE
        comment = ActionComment.query.get(comment_id)
        # current_app.logger.debug(f"[UNLIKE_COMMENT] ActionComment query result for id {comment_id}: {comment}") # REMOVE

        if not comment:
            # current_app.logger.warning(f"[UNLIKE_COMMENT] ActionComment with id {comment_id} not found. Returning 404.") # REMOVE
            return jsonify({'error': '评论不存在'}), 404
        
        existing_like = db.session.query(action_comment_likes).filter(
            action_comment_likes.c.user_id == user_id,
            action_comment_likes.c.comment_id == comment_id
        ).first()
        # current_app.logger.debug(f"[UNLIKE_COMMENT] Existing like for user {user_id} on comment {comment_id}: {existing_like}") # REMOVE
        
        if not existing_like:
            # current_app.logger.info(f"[UNLIKE_COMMENT] User {user_id} had not liked comment {comment_id}. Returning 200.") # REMOVE
            like_count = db.session.query(action_comment_likes).filter(
                action_comment_likes.c.comment_id == comment_id
            ).count()
            return jsonify({
                'message': '你还没有点赞这条评论',
                'like_count': like_count,
                'is_liked': False
            }), 200
        
        try:
            stmt = action_comment_likes.delete().where(
                (action_comment_likes.c.user_id == user_id) & 
                (action_comment_likes.c.comment_id == comment_id)
            )
            db.session.execute(stmt)
            db.session.commit()
            like_count = db.session.query(action_comment_likes).filter(
                action_comment_likes.c.comment_id == comment_id
            ).count()
            # current_app.logger.info(f"[UNLIKE_COMMENT] Successfully unliked ActionComment {comment_id} for user {user_id}. New like count: {like_count}. Returning 200.") # REMOVE
            return jsonify({
                'message': '取消点赞成功',
                'like_count': like_count,
                'is_liked': False
            }), 200
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[UNLIKE_COMMENT] Error unliking ActionComment {comment_id} for user {user_id}: {e}", exc_info=True) # KEEP THIS ERROR LOG
            return jsonify({'error': f'取消点赞失败: {str(e)}'}), 500
            
    elif target_type == 'article':
        # current_app.logger.debug(f"[UNLIKE_COMMENT] Processing target_type 'article' for comment_id {comment_id}") # REMOVE
        comment = Comment.query.get(comment_id)
        if not comment:
            return jsonify({'error': '评论不存在'}), 404
            
        if user not in comment.likers:
            return jsonify({
                'message': '你还没有点赞这条评论',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': False
            }), 200
            
        try:
            comment.likers.remove(user)
            db.session.commit()
            return jsonify({
                'message': '取消点赞成功',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': False
            }), 200
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[UNLIKE_COMMENT] Error unliking ArticleComment {comment_id} for user {user_id}: {e}", exc_info=True)
            return jsonify({'error': f'取消点赞失败: {str(e)}'}), 500
            
    elif target_type == 'post':
        # current_app.logger.debug(f"[UNLIKE_COMMENT] Processing target_type 'post' for comment_id {comment_id}") # REMOVE
        comment = PostComment.query.get(comment_id)
        if not comment:
            return jsonify({'error': '评论不存在'}), 404
            
        if user not in comment.likers:
            return jsonify({
                'message': '你还没有点赞这条评论',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': False
            }), 200
        try:
            comment.likers.remove(user)
            db.session.commit()
            try:
                from app.tasks import update_post_comment_likes_count
                update_post_comment_likes_count.delay(comment_id)
            except Exception as e:
                current_app.logger.error(f"Failed to queue post comment likes count update task for comment {comment_id} after unlike: {e}")
            return jsonify({
                'message': '取消点赞成功',
                'like_count': comment.likers.count(),
                'is_liked_by_current_user': False
            }), 200
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"[UNLIKE_COMMENT] Error unliking PostComment {comment_id} for user {user_id}: {e}", exc_info=True)
            return jsonify({'error': f'取消点赞失败: {str(e)}'}), 500
    else:
        # current_app.logger.warning(f"[UNLIKE_COMMENT] Unsupported target_type: '{target_type}' for comment_id {comment_id}. Returning 400.") # REMOVE
        return jsonify({"error": "不支持的评论类型"}), 400

# --- 下面是原来的动态评论点赞API，已被上面的统一API替代，但保留代码注释作为参考 ---
# @comments_bp.route('/comments/<int:comment_id>/like', methods=['POST'])
# @jwt_required()
# def like_action_comment(comment_id):
#     """点赞动态评论"""
#     target_type = request.args.get('target_type')
#     
#     # 只处理动态评论类型，其他类型让原有路由处理
#     if target_type != 'action':
#         return jsonify({"error": "不支持的评论类型"}), 400
#         
#     user_id = get_jwt_identity()
#     user = User.query.get(user_id)
#     if not user:
#         return jsonify({'error': '用户不存在'}), 404
#     
#     # 查找评论
#     comment = ActionComment.query.get(comment_id)
#     if not comment:
#         return jsonify({'error': '评论不存在'}), 404
#     
#     # 检查是否已经点赞
#     existing_like = db.session.query(action_comment_likes).filter(
#         action_comment_likes.c.user_id == user_id,
#         action_comment_likes.c.comment_id == comment_id
#     ).first()
#     
#     if existing_like:
#         return jsonify({
#             'message': '你已经点赞过这条评论了',
#             'like_count': db.session.query(action_comment_likes).filter(
#                 action_comment_likes.c.comment_id == comment_id
#             ).count(),
#             'is_liked': True
#         }), 200
#     
#     try:
#         # 添加点赞记录
#         stmt = action_comment_likes.insert().values(
#             user_id=user_id,
#             comment_id=comment_id
#         )
#         db.session.execute(stmt)
#         db.session.commit()
#         
#         # 获取当前点赞数
#         like_count = db.session.query(action_comment_likes).filter(
#             action_comment_likes.c.comment_id == comment_id
#         ).count()
#         
#         return jsonify({
#             'message': '点赞成功',
#             'like_count': like_count,
#             'is_liked': True
#         }), 201
#     except Exception as e:
#         db.session.rollback()
#         print(f"点赞动态评论 {comment_id} 失败: {e}")
#         return jsonify({'error': f'点赞失败: {str(e)}'}), 500

# --- 原来的取消动态评论点赞API，已被上面的统一API替代，但保留代码注释作为参考 ---
# @comments_bp.route('/comments/<int:comment_id>/like', methods=['DELETE'])
# @jwt_required()
# def unlike_action_comment(comment_id):
#     """取消点赞动态评论"""
#     target_type = request.args.get('target_type')
#     
#     # 只处理动态评论类型，其他类型让原有路由处理
#     if target_type != 'action':
#         return jsonify({"error": "不支持的评论类型"}), 400
#         
#     user_id = get_jwt_identity()
#     
#     # 查找评论
#     comment = ActionComment.query.get(comment_id)
#     if not comment:
#         return jsonify({'error': '评论不存在'}), 404
#     
#     # 检查是否已经点赞
#     existing_like = db.session.query(action_comment_likes).filter(
#         action_comment_likes.c.user_id == user_id,
#         action_comment_likes.c.comment_id == comment_id
#     ).first()
#     
#     if not existing_like:
#         return jsonify({
#             'message': '你还没有点赞这条评论',
#             'like_count': db.session.query(action_comment_likes).filter(
#                 action_comment_likes.c.comment_id == comment_id
#             ).count(),
#             'is_liked': False
#         }), 200
#     
#     try:
#         # 删除点赞记录
#         stmt = action_comment_likes.delete().where(
#             (action_comment_likes.c.user_id == user_id) & 
#             (action_comment_likes.c.comment_id == comment_id)
#         )
#         db.session.execute(stmt)
#         db.session.commit()
#         
#         # 获取当前点赞数
#         like_count = db.session.query(action_comment_likes).filter(
#             action_comment_likes.c.comment_id == comment_id
#         ).count()
#         
#         return jsonify({
#             'message': '取消点赞成功',
#             'like_count': like_count,
#             'is_liked': False
#         }), 200
#     except Exception as e:
#         db.session.rollback()
#         print(f"取消点赞动态评论 {comment_id} 失败: {e}")
#         return jsonify({'error': f'取消点赞失败: {str(e)}'}), 500