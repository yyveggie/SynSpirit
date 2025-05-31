"""
此模块定义了处理用户通用行为 (Actions) 的 API 端点。
这里的 "Action" 指的是用户执行的操作记录，例如点赞、收藏、分享。
它与 "Dynamic" (动态) 概念相关，但更侧重于记录交互本身。

主要功能:
- 处理通用操作 (`/actions` POST):
    - 记录用户对 Article, Post, Tool 或其他 Action 的点赞、收藏、分享行为。
    - 创建 UserAction 或 ActionInteraction 记录。
    - 处理转发 (重新分享 Action) 的逻辑。
- 单独处理对 Action 的点赞 (`/actions/<action_id>/likes` POST) 和取消点赞 (`/actions/<action_id>/likes` DELETE)。
- 单独处理对 Action 的收藏 (`/actions/<action_id>/collects` POST) 和取消收藏 (`/actions/<action_id>/collects` DELETE)。
- 删除 Action 记录 (`/actions/<action_id>` DELETE)，主要用于取消点赞/收藏。

依赖模型: UserAction, Article, Tool, ActionInteraction, Post, ActionComment, User
使用 Flask 蓝图: actions_bp (前缀 /api)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app import db
from app.models import UserAction, Article, Tool, Post, ActionComment, User # 导入所需模型
from app.models.action_comment import action_comment_likes # 导入 action_comment_likes
from app.models.action_interaction import ActionInteraction # 导入 ActionInteraction 模型
from app.models.global_interaction import GlobalInteraction  # 导入GlobalInteraction模型
from sqlalchemy.exc import IntegrityError
import json
import traceback # 导入 traceback
# --- 修改：导入 Celery 任务 --- 
from app.tasks import update_post_counts, update_article_counts, update_article_comment_likes_count, generate_ai_action_comment_reply_task, update_action_counts, calculate_action_likes_count, calculate_action_collects_count
# --- 结束修改 ---
from app.models.comment import Comment
from sqlalchemy import func
from sqlalchemy.orm import aliased # For subqueries if needed

actions_bp = Blueprint('actions_bp', __name__)

# --- 新增：辅助函数，将 UserAction 转换为前端时间线所需的字典格式 ---
def action_to_timeline_dict(action, current_user_id=None):
    """
    将 UserAction 对象转换为时间线显示所需的字典格式
    
    Args:
        action (UserAction): 要转换的动态对象
        current_user_id (int, optional): 当前用户ID，用于判断交互状态
        
    Returns:
        dict: 包含动态信息的字典
    """
    # 获取分享者信息
    sharer = action.user
    sharer_username = sharer.nickname if sharer and sharer.nickname else (sharer.email.split('@')[0] if sharer and sharer.email else '未知用户')
    sharer_avatar_url = sharer.avatar if sharer else None
    sharer_id = sharer.id if sharer else None

    # 处理图片
    images = []
    if action.images:
        try:
            if isinstance(action.images, str):
                images = json.loads(action.images)
            elif isinstance(action.images, list):
                images = action.images
        except Exception as e:
            print(f"Error parsing images for action {action.id}: {e}")

    # 判断当前用户是否点赞和收藏 - 提前获取相关状态
    is_liked_by_current_user = False
    is_collected_by_current_user = False
    current_user_like_action_id = None
    current_user_collect_action_id = None
    
    if current_user_id:
        # 使用GlobalInteraction检查用户是否点赞和收藏
        # GlobalInteraction.has_interaction返回布尔值，不是对象
        is_liked_by_current_user = GlobalInteraction.has_interaction(
            user_id=current_user_id,
            content_type='action',
            content_id=action.id,
            interaction_type='like'
        )
        
        is_collected_by_current_user = GlobalInteraction.has_interaction(
            user_id=current_user_id,
            content_type='action',
            content_id=action.id,
            interaction_type='collect'
        )
        
        # 如果点赞/收藏状态为真，需要查询实际的交互ID
        if is_liked_by_current_user:
            like_interaction = GlobalInteraction.query.filter_by(
                user_id=current_user_id,
                content_type='action',
                content_id=action.id,
                interaction_type='like'
            ).first()
            current_user_like_action_id = like_interaction.id if like_interaction else None
            
        if is_collected_by_current_user:
            collect_interaction = GlobalInteraction.query.filter_by(
                user_id=current_user_id,
                content_type='action',
                content_id=action.id,
                interaction_type='collect'
            ).first()
            current_user_collect_action_id = collect_interaction.id if collect_interaction else None

    # 获取点赞数量
    likes_count = GlobalInteraction.count_interactions(
        content_type='action',
        content_id=action.id,
        interaction_type='like'
    )
    
    # 获取收藏数量
    collects_count = GlobalInteraction.count_interactions(
        content_type='action',
        content_id=action.id,
        interaction_type='collect'
    )
    
    # 获取转发数量 (Action 引用了这个 Action)
    reposts_count = action.reposts_count if hasattr(action, 'reposts_count') and action.reposts_count is not None else \
        db.session.query(UserAction).filter(
            UserAction.target_type == 'action',
            UserAction.target_id == action.id,
            UserAction.action_type == 'share'
        ).count()
    
    # 获取评论数量
    comment_count = action.comments_count if hasattr(action, 'comments_count') and action.comments_count is not None else \
        db.session.query(ActionComment).filter(
            ActionComment.action_id == action.id,
            ActionComment.is_deleted == False
        ).count()

    # 检查动态是否已软删除
    if hasattr(action, 'is_deleted') and action.is_deleted:
        # 如果动态已软删除，则显示为已删除状态
        target_type = 'deleted'
        if action.target_type == 'article':
            target_title = "[文章已删除]"
        elif action.target_type == 'post':
            target_title = "[帖子已删除]"
        elif action.target_type == 'tool':
            target_title = "[工具已删除]"
        else:
            target_title = "[内容已删除]"
        target_slug = None
        target_id_for_dict = action.target_id
    else:
        # 初始化目标类型和信息
        target_type = action.target_type
        target_title = None
        target_slug = None
        target_id_for_dict = action.target_id

        # 根据目标类型获取具体信息
        if action.target_type == 'article':
            target = db.session.get(Article, action.target_id)
            if target:
                target_title = target.title
                target_slug = target.slug
            else:
                # 找不到文章，说明已删除
                target_type = 'deleted'
                target_title = "[文章已删除]"
                target_slug = None
        elif action.target_type == 'post':
            target = db.session.get(Post, action.target_id)
            if target:
                target_title = target.title
                target_slug = target.slug
            else:
                # 找不到帖子，说明已删除
                target_type = 'deleted'
                target_title = "[帖子已删除]"
                target_slug = None
        elif action.target_type == 'tool':
            target = db.session.get(Tool, action.target_id)
            if target:
                target_title = target.name 
                target_slug = target.slug
            else:
                # 找不到工具，说明已删除
                target_type = 'deleted'
                target_title = "[工具已删除]"
                target_slug = None
        elif action.target_type == 'action' and action.original_action_id:
            # 如果是转发，我们需要获取它转发的那个 *原始* Action 的目标信息
            original_action_details = db.session.get(UserAction, action.original_action_id)
            if original_action_details:
                # 检查原始动态是否已软删除
                if hasattr(original_action_details, 'is_deleted') and original_action_details.is_deleted:
                    target_type = 'deleted'
                    target_title = "[内容已删除]"
                    target_slug = None
                    target_id_for_dict = action.target_id
                else:
                    # 根据原始 Action 的 target_type 获取最终目标
                    if original_action_details.target_type == 'article':
                        target = db.session.get(Article, original_action_details.target_id)
                        if target:
                            target_type = 'article'
                            target_title = target.title
                            target_slug = target.slug
                            target_id_for_dict = target.id
                        else:
                            # 找不到文章，说明已删除
                            target_type = 'deleted'
                            target_title = "[文章已删除]"
                            target_slug = None
                    elif original_action_details.target_type == 'post':
                        target = db.session.get(Post, original_action_details.target_id)
                        if target:
                            target_type = 'post'
                            target_title = target.title
                            target_slug = target.slug
                            target_id_for_dict = target.id
                        else:
                            # 找不到帖子，说明已删除
                            target_type = 'deleted'
                            target_title = "[帖子已删除]"
                            target_slug = None
                    elif original_action_details.target_type == 'tool':
                        target = db.session.get(Tool, original_action_details.target_id)
                        if target:
                            target_type = 'tool'
                            target_title = target.name
                            target_slug = target.slug
                            target_id_for_dict = target.id
                        else:
                            # 找不到工具，说明已删除
                            target_type = 'deleted'
                            target_title = "[工具已删除]"
                            target_slug = None
                    elif original_action_details.target_type == 'deleted':
                        # 原始动态已标记为删除状态
                        target_type = 'deleted'
                        target_title = original_action_details.target_title or "[内容已删除]"
                        target_slug = None
            else:
                # 找不到原始动态，设置为已删除状态
                target_type = 'deleted'
                target_title = "[内容已删除]"
                target_slug = None

    # 构建返回字典
    result = {
        'action_id': action.id,
        'action_type': action.action_type,
        'share_comment': action.content,
        'shared_at': action.created_at.isoformat() + 'Z',
        'sharer_id': sharer_id,
        'sharer_username': sharer_username,
        'sharer_avatar_url': sharer_avatar_url,
        'is_repost': action.target_type == 'action',
        'target_type': target_type,
        'target_title': target_title,
        'target_slug': target_slug,
        'target_id': target_id_for_dict,
        'images': images,
        'likes_count': likes_count,
        'collects_count': collects_count,
        'repost_count': reposts_count,
        'comment_count': comment_count,  # 新增：添加评论数
        'is_liked_by_current_user': is_liked_by_current_user,
        'is_collected_by_current_user': is_collected_by_current_user,
        'current_user_like_action_id': current_user_like_action_id,
        'current_user_collect_action_id': current_user_collect_action_id,
        'is_deleted': hasattr(action, 'is_deleted') and action.is_deleted  # 添加is_deleted标志
    }

    # 如果是转发，递归获取原始动态信息
    if action.target_type == 'action' and action.original_action_id:
        original_action = db.session.get(UserAction, action.original_action_id)
        if original_action:
            # 这里不需要特殊处理，直接递归调用 action_to_timeline_dict
            # 每一层都会包含自己的转发信息和引用的下一层
            result['original_action'] = action_to_timeline_dict(original_action, current_user_id)
        else:
            # 处理原始动态不存在的情况，创建一个删除状态的占位对象
            # 这样前端仍然可以显示当前动态的内容，同时表明原动态已删除
            result['original_action'] = {
                'action_id': None,
                'action_type': 'share',
                'target_type': 'deleted',
                'target_title': '[内容已删除]',
                'shared_at': action.created_at.isoformat() + 'Z',  # 使用当前动态的时间作为占位
                'images': [],
                'is_repost': False,
                'is_deleted': True  # 明确标记为已删除
            }

    return result
# --- 结束辅助函数 ---

@actions_bp.route('', methods=['POST'], strict_slashes=False)
@jwt_required()
def handle_action():
    """记录用户操作，如点赞、收藏、分享"""
    current_user_id = get_jwt_identity()
    data = request.get_json()

    # --- 添加调试打印 ---
    print(f"--- Received Action Request ---")
    print(f"User ID: {current_user_id}")
    print(f"Request Data: {data}")
    # --- 结束调试打印 ---

    action_type = data.get('action_type') # like, collect, share
    target_type = data.get('target_type') # article, post, tool, action, comment
    target_id = data.get('target_id')     # ID of the article, post, tool, or action being interacted with
    content = data.get('content')       # Optional comment for shares/reposts
    images_data = data.get('images', []) # 从 data 中获取 images

    if not action_type: # 修改：对于 create_status，target_type 和 target_id 由后端设定，前端无需必须提供
        return jsonify({"error": "缺少必要的参数 (action_type)"}), 400

    # 基本参数校验移到各个分支内部，因为 create_status 不需要前端传 target_type/id
    # if not target_type or target_id is None: 
    #     return jsonify({"error": "缺少必要的参数 (target_type, target_id)"}), 400

    if action_type in ['like', 'collect']:
        if not target_type or target_id is None: # like/collect 必须有 target
             return jsonify({"error": "点赞/收藏操作缺少 target_type 或 target_id"}), 400
        # --- 修改：添加 'comment' 到允许的目标类型 --- 
        allowed_target_types = ['article', 'post', 'tool', 'action', 'comment'] 
        if target_type not in allowed_target_types:
            return jsonify({"error": f"不支持对 {target_type} 进行 {action_type} 操作"}), 400

        # 验证目标是否存在 (根据 target_type)
        target_object = None
        if target_type == 'article':
            target_object = db.session.get(Article, target_id)
        elif target_type == 'post':
            target_object = db.session.get(Post, target_id)
        elif target_type == 'tool':
            target_object = db.session.get(Tool, target_id)
        elif target_type == 'action': # 验证目标 Action 是否存在
            target_object = db.session.get(UserAction, target_id)
        elif target_type == 'comment': # <-- 新增对 comment 的验证
            target_object = db.session.get(Comment, target_id)
            # 确保是文章评论而不是帖子评论 (如果需要区分)
            if target_object and target_object.article_id is None:
                 # 如果 Comment 模型可能用于其他地方，这里可能需要更严格的检查
                 pass # 暂时允许
        
        if not target_object:
            return jsonify({"error": f"目标 {target_type} (ID: {target_id}) 不存在"}), 404

        # 使用ActionInteraction处理对动态的点赞和收藏
        if target_type == 'action':
            # 检查是否已存在相同的ActionInteraction
            existing_interaction = ActionInteraction.query.filter_by(
                user_id=current_user_id, 
                interaction_type=action_type,
                action_id=target_id
            ).first()
                
            if existing_interaction:
                print(f"User {current_user_id} already {action_type}d action {target_id} via ActionInteraction")
                return jsonify(action_to_timeline_dict(target_object, current_user_id)), 200
                
            # 创建新的ActionInteraction
            try:
                new_interaction = ActionInteraction(
                    user_id=current_user_id,
                    interaction_type=action_type,
                    action_id=target_id
                )
                db.session.add(new_interaction)
                db.session.commit()
                
                print(f"User {current_user_id} {action_type}d action {target_id} via ActionInteraction - New ID: {new_interaction.id}")
                
                # 处理对动态的点赞/收藏
                try:
                    # 获取动态的最新点赞/收藏计数
                    response_data = action_to_timeline_dict(target_object, current_user_id)
                    print(f"Action {action_type} for action {target_id} created successfully, returning response")
                except Exception as e:
                    print(f"Error getting timeline dict for action {target_id}: {e}")
                    response_data = {"action_id": new_interaction.id}
                
                # 返回响应数据
                return jsonify(response_data), 201
            except IntegrityError as e:
                db.session.rollback()
                print(f"IntegrityError creating {action_type} on action {target_id}: {e}")
                existing_interaction = ActionInteraction.query.filter_by(
                    user_id=current_user_id, interaction_type=action_type, action_id=target_id
                ).first()
                
                if existing_interaction:
                    response_data = action_to_timeline_dict(target_object, current_user_id)
                    return jsonify(response_data), 200
                return jsonify({"error": f"创建{action_type}失败"}), 500
            except Exception as e:
                db.session.rollback()
                print(f"Error creating {action_type} on action {target_id}: {e}")
                return jsonify({"error": f"创建{action_type}失败"}), 500
        else:
            # 对其他类型的目标使用原始的UserAction处理
            # 检查是否已存在相同的 UserAction
            existing_action = UserAction.query.filter_by(
                user_id=current_user_id, 
                action_type=action_type, 
                target_type=target_type, 
                target_id=target_id
            ).first()
            
            if existing_action:
                print(f"User {current_user_id} already {action_type}d {target_type} {target_id}")
                return jsonify(action_to_timeline_dict(existing_action, current_user_id) if target_type == 'action' else {"action_id": existing_action.id}), 200
            
            # 创建新的 UserAction
            try:
                new_action = UserAction(
                    user_id=current_user_id, 
                    action_type=action_type, 
                    target_type=target_type, 
                    target_id=target_id
                )
                db.session.add(new_action)
                db.session.commit()
                print(f"User {current_user_id} {action_type}d {target_type} {target_id} - New UserAction ID: {new_action.id}")
                
                # 修改：确保所有成功创建的action都返回完整的timeline dict，以便前端统一处理
                response_data = action_to_timeline_dict(new_action, current_user_id)

                if target_type == 'post':
                    try:
                        update_post_counts.delay(target_id)
                        print(f"Queued update_post_counts for post {target_id}")
                        
                        # --- 新增：立即获取并返回更新后的 Post 计数 (基于 UserAction 表) ---
                        current_likes = UserAction.query.filter_by(action_type='like', target_type='post', target_id=target_id).count()
                        current_collects = UserAction.query.filter_by(action_type='collect', target_type='post', target_id=target_id).count()
                        response_data['target_likes_count'] = current_likes
                        response_data['target_collects_count'] = current_collects
                        # 同时返回操作是否成功以及新的 action_id (用于取消操作)
                        response_data['is_liked'] = True if action_type == 'like' else None # 根据当前操作设置
                        response_data['is_collected'] = True if action_type == 'collect' else None # 根据当前操作设置
                        # --- 结束新增 ---
                    except Exception as e:
                        print(f"Error queueing or getting counts for post {target_id}: {e}")
                    return jsonify(response_data), 201
                elif target_type == 'article':
                    try:
                        update_article_counts.delay(target_id)
                        print(f"Queued update_article_counts for article {target_id}")
                        # --- 新增：对文章也返回计数值 (如果需要) ---
                        current_likes = UserAction.query.filter_by(action_type='like', target_type='article', target_id=target_id).count()
                        current_collects = UserAction.query.filter_by(action_type='collect', target_type='article', target_id=target_id).count()
                        response_data['target_likes_count'] = current_likes
                        response_data['target_collects_count'] = current_collects
                        response_data['is_liked'] = True if action_type == 'like' else None
                        response_data['is_collected'] = True if action_type == 'collect' else None
                        
                        # 如果是文章点赞，添加通知
                        if action_type == 'like':
                            try:
                                from app.tasks import notify_article_liked_task
                                notify_article_liked_task.delay(target_id, current_user_id)
                                current_app.logger.info(f"Queued notification for article {target_id} liked by user {current_user_id}")
                            except Exception as notify_e:
                                current_app.logger.error(f"Error queueing like notification for article {target_id}: {notify_e}")
                        # --- 结束新增 ---
                    except Exception as e:
                        print(f"Error queueing update_article_counts for article {target_id}: {e}")
                    return jsonify(response_data), 201
                elif target_type == 'action':
                    # 处理对动态的点赞/收藏
                    try:
                        # 获取动态的最新点赞/收藏计数
                        current_likes = UserAction.query.filter_by(action_type='like', target_type='action', target_id=target_id).count()
                        current_collects = UserAction.query.filter_by(action_type='collect', target_type='action', target_id=target_id).count()
                        
                        # 更新响应数据
                        response_data['target_likes_count'] = current_likes
                        response_data['target_collects_count'] = current_collects
                        response_data['is_liked'] = True if action_type == 'like' else None
                        response_data['is_collected'] = True if action_type == 'collect' else None
                        
                        print(f"Action {action_type} for {target_type} {target_id} created successfully, returning response")
                    except Exception as e:
                        print(f"Error getting counts for action {target_id}: {e}")
                    
                    # 返回响应数据
                    return jsonify(response_data), 201
                else:
                    # 对于其他类型的目标，直接返回基本响应
                    return jsonify(response_data), 201
            except IntegrityError as e: 
                db.session.rollback()
                print(f"IntegrityError creating {action_type} on {target_type} {target_id}: {e}")
                existing_action = UserAction.query.filter_by(
                    user_id=current_user_id, action_type=action_type, target_type=target_type, target_id=target_id
                ).first()
                if existing_action:
                    # 对于已存在的操作，也返回当前的计数值和 action_id
                    response_data = {"action_id": existing_action.id}
                    if target_type == 'post':
                        try:
                            update_post_counts.delay(target_id) # 确保即使是重复操作也触发一次更新，以防万一
                            current_likes = UserAction.query.filter_by(action_type='like', target_type='post', target_id=target_id).count()
                            current_collects = UserAction.query.filter_by(action_type='collect', target_type='post', target_id=target_id).count()
                            response_data['target_likes_count'] = current_likes
                            response_data['target_collects_count'] = current_collects
                            response_data['is_liked'] = (action_type == 'like')
                            response_data['is_collected'] = (action_type == 'collect')
                        except Exception as e:
                            print(f"Error queueing or getting counts for post {target_id} (existing action): {e}")
                    elif target_type == 'article':
                        try:
                            update_article_counts.delay(target_id)
                            current_likes = UserAction.query.filter_by(action_type='like', target_type='article', target_id=target_id).count()
                            current_collects = UserAction.query.filter_by(action_type='collect', target_type='article', target_id=target_id).count()
                            response_data['target_likes_count'] = current_likes
                            response_data['target_collects_count'] = current_collects
                            response_data['is_liked'] = (action_type == 'like')
                            response_data['is_collected'] = (action_type == 'collect')
                        except Exception as e:
                            print(f"Error queueing or getting counts for article {target_id} (existing action): {e}")
                    return jsonify(response_data), 200
            except Exception as e:
                db.session.rollback()
                print(f"Error creating {action_type} on {target_type} {target_id}: {e}")
                return jsonify({"error": f"创建{action_type}失败"}), 500
        
    elif action_type == 'share':
        if not target_type or target_id is None: # share 必须有 target
            return jsonify({"error": "分享操作缺少 target_type 或 target_id"}), 400
            
        target_object = None
        original_action_id_to_set = None # 初始化 original_action_id
        serialized_images = None
        if images_data and isinstance(images_data, list):
            serialized_images = json.dumps(images_data)
            print(f"分享附带 {len(images_data)} 张图片")
        
        # 1. 处理分享 Article/Post/Tool
        if target_type in ['article', 'post', 'tool']:
            target_object = None 
            if target_type == 'article':
                target_object = db.session.get(Article, target_id)
            elif target_type == 'post':
                target_object = db.session.get(Post, target_id)
            elif target_type == 'tool':
                target_object = db.session.get(Tool, target_id)

            if not target_object:
                return jsonify({"error": f"要分享的 {target_type} (ID: {target_id}) 不存在"}), 404

            try:
                new_share_action = UserAction(
                    user_id=current_user_id,
                    action_type='share',
                    target_type=target_type,
                    target_id=target_id,
                    content=content,
                    images=serialized_images
                )
                db.session.add(new_share_action)
                db.session.commit()
                print(f"User {current_user_id} shared {target_type} {target_id}")
                
                # 根据不同类型的目标，调用相应的更新任务
                if target_type == 'article':
                    # 已有的文章分享处理
                    update_article_counts.delay(target_id)
                    print(f"Queued update_article_counts for article {target_id} (share operation)")
                elif target_type == 'post':
                    # 新增：更新帖子的shares_count
                    update_post_counts.delay(target_id)
                    print(f"Queued update_post_counts for post {target_id} (share operation)")
                
                return jsonify(action_to_timeline_dict(new_share_action, current_user_id)), 201 # 确保返回值正确
            except Exception as e:
                db.session.rollback()
                print(f"Error creating share for {target_type} {target_id}: {e}")
                return jsonify({"error": "创建分享失败"}), 500

        # 2. 处理转发 Action (Repost)
        elif target_type == 'action': 
            action_to_be_forwarded = db.session.get(UserAction, target_id) # target_id 是前端传来的 action_id
            
            if not action_to_be_forwarded:
                return jsonify({"error": f"要转发的动态 (ID: {target_id}) 不存在"}), 404
            
            # 确定新转发记录的 original_action_id
            # 修改后的逻辑：
            # - original_action_id 始终指向当前被转发的这条动态
            # - 不再尝试直接指向链条的最终源头
            # - 这样可以通过递归查询构建完整的转发链
            original_action_id_for_repost = action_to_be_forwarded.id

            try:
                new_repost_action = UserAction(
                    user_id=current_user_id,
                    action_type='share',      # 明确是分享动作
                    target_type='action',     # 目标类型是另一个 action
                    target_id=action_to_be_forwarded.id, # 目标ID是被直接转发的这条动态的ID
                    original_action_id=original_action_id_for_repost, # 指向直接被转发的动态
                    content=content,          # 分享时的评论
                    images=serialized_images  # 分享时附带的图片
                )
                db.session.add(new_repost_action)
                db.session.commit()
                
                # 更新被转发动态的转发计数
                try:
                    # 获取被转发的动态
                    original_action = UserAction.query.get(action_to_be_forwarded.id)
                    if original_action:
                        # 计算最新的转发数
                        reposts_count = UserAction.query.filter_by(
                            target_type='action',
                            action_type='share',
                            target_id=original_action.id
                        ).count()
                        
                        # 更新转发计数
                        original_action.reposts_count = reposts_count
                        db.session.commit()
                except Exception as e:
                    print(f"Error updating reposts count for action {action_to_be_forwarded.id}: {e}")
                    db.session.rollback()
                
                print(f"User {current_user_id} reposted action {action_to_be_forwarded.id}, original_id set to {original_action_id_for_repost}")
                return jsonify(action_to_timeline_dict(new_repost_action, current_user_id)), 201
            except Exception as e:
                db.session.rollback()
                print(f"Error creating repost for action {action_to_be_forwarded.id}: {e}")
                return jsonify({"error": "创建转发失败"}), 500
        else:
            return jsonify({"error": f"不支持分享类型 '{target_type}'"}), 400
    elif action_type == 'create_status':
        # 对于原创状态，target_type='user' 和 target_id=current_user_id 由后端设定
        # content 和 images 来自前端
        if not content and not images_data: # content 或 images 至少有一个
            return jsonify({"error": "动态内容和图片不能同时为空"}), 400

        try:
            new_action = UserAction(
                user_id=current_user_id,
                action_type='create_status',
                target_type='user', 
                target_id=current_user_id,
                content=content,
                images=json.dumps(images_data) if images_data else None,
                original_action_id=None 
            )
            db.session.add(new_action)
            db.session.commit()
            print(f"User {current_user_id} created status - New UserAction ID: {new_action.id}")
            
            # 使用 action_to_timeline_dict 转换以便前端可以直接使用
            return jsonify(action_to_timeline_dict(new_action, current_user_id)), 201 # 201 Created

        except IntegrityError as e:
            db.session.rollback()
            current_app.logger.error(f"Database integrity error on creating status: {e}")
            return jsonify({"error": "创建动态时发生数据库错误"}), 500
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error creating status: {e}")
            traceback.print_exc()
            return jsonify({"error": "创建动态时发生未知错误"}), 500
            
    else:
        return jsonify({"error": f"不支持的操作类型: {action_type}"}), 400

    # 默认返回值，确保所有路径都有返回
    return jsonify({"error": "请求处理完成，但未返回预期结果"}), 500

@actions_bp.route('/<int:action_id>', methods=['DELETE'])
@jwt_required()
def delete_action(action_id):
    """删除指定的用户操作记录 (例如取消点赞、取消收藏文章/帖子等)
    
    注意: 此操作会进行软删除 UserAction 记录。
    如果被删除的 Action 是点赞或收藏，会尝试异步更新相关内容的计数值。
    """
    user_id_from_jwt = get_jwt_identity()
    
    # 更灵活地处理不同格式的用户身份
    user_id = None
    if isinstance(user_id_from_jwt, dict):
        user_id = user_id_from_jwt.get('id')
    elif isinstance(user_id_from_jwt, int):
        user_id = user_id_from_jwt
    elif isinstance(user_id_from_jwt, str) and user_id_from_jwt.isdigit():
        user_id = int(user_id_from_jwt)
    
    print(f"[DELETE_ACTION] 请求删除 Action {action_id}，用户ID: {user_id}")
    
    if not user_id:
        return jsonify({"error": "无效的用户身份令牌"}), 401

    try:
        # 1. 获取要删除的Action
        action_to_delete = UserAction.query.get(action_id)
        if not action_to_delete:
            print(f"[DELETE_ACTION] 未找到 Action {action_id}")
            return jsonify({"error": "找不到指定的动态"}), 404
        
        print(f"[DELETE_ACTION] 将删除 Action: {action_id}, 类型: {action_to_delete.action_type}, 目标类型: {action_to_delete.target_type}, 目标ID: {action_to_delete.target_id}")
        
        # 验证是否是动态的创建者
        if action_to_delete.user_id != user_id:
            print(f"[DELETE_ACTION] 权限错误: 用户 {user_id} 尝试删除由用户 {action_to_delete.user_id} 创建的 Action {action_id}")
            return jsonify({"error": "您没有权限删除这条动态"}), 403
        
        # 2. 查找其他引用这个Action的记录
        # 转发引用 (通过target_id)
        target_reposts = UserAction.query.filter_by(
            target_type='action',
            target_id=action_id
        ).all()
        
        # 转发链引用 (通过original_action_id)
        reposts_referencing_this = UserAction.query.filter_by(
            original_action_id=action_id
        ).all()
        
        # 查找关联的交互
        associated_interactions = ActionInteraction.query.filter_by(
            action_id=action_id
        ).all()
        
        # 3. 处理引用，但不删除它们
        # 首先，更新直接引用此动态的转发
        if target_reposts:
            print(f"Found {len(target_reposts)} direct reposts of action {action_id}. Updating them...")
            for repost in target_reposts:
                # 不修改这些转发的original_action_id，只修改它们的target_title
                if action_to_delete.target_type == 'article':
                    repost.target_title = "[文章已删除]"
                elif action_to_delete.target_type == 'post':
                    repost.target_title = "[帖子已删除]"
                elif action_to_delete.target_type == 'tool':
                    repost.target_title = "[工具已删除]"
                else:
                    repost.target_title = "[内容已删除]"
                
                db.session.add(repost)
            print("Direct reposts updated.")
        
        # 然后，更新转发链中引用此动态的转发
        if reposts_referencing_this:
            print(f"Found {len(reposts_referencing_this)} reposts referencing action {action_id} in chain. Updating them...")
            for repost in reposts_referencing_this:
                # 重要：我们保留repost的内容和图片，只标记原动态已删除
                # 根据原始动态的类型设置提示文本
                if action_to_delete.target_type == 'article':
                    repost.target_title = "[文章已删除]"
                elif action_to_delete.target_type == 'post':
                    repost.target_title = "[帖子已删除]"
                elif action_to_delete.target_type == 'tool':
                    repost.target_title = "[工具已删除]"
                else:
                    repost.target_title = "[内容已删除]"
                
                db.session.add(repost)
            print("Chain referencing reposts updated.")
        
        # --- 改进：先处理评论删除，解决约束问题 ---
        try:
            # 找出所有与该动态关联的评论
            action_comments = ActionComment.query.filter_by(action_id=action_id).all()
            
            if action_comments:
                print(f"[DELETE_ACTION] 找到 {len(action_comments)} 条与动态 {action_id} 相关的评论，将逐个处理")
                
                # 先处理点赞关系
                print(f"[DELETE_ACTION] 删除评论点赞关系...")
                for comment in action_comments:
                    try:
                        # 删除评论点赞关系
                        db.session.execute(
                            action_comment_likes.delete().where(
                                action_comment_likes.c.comment_id == comment.id
                            )
                        )
                    except Exception as e:
                        print(f"[DELETE_ACTION] 删除评论 {comment.id} 的点赞关系时出错: {e}")
                        # 记录错误但继续处理其他评论
                
                # 找出所有回复（子评论）并删除
                print(f"[DELETE_ACTION] 删除子评论...")
                replies = [comment for comment in action_comments if comment.parent_id is not None]
                for reply in replies:
                    try:
                        db.session.delete(reply)
                    except Exception as e:
                        print(f"[DELETE_ACTION] 删除回复评论 {reply.id} 时出错: {e}")
                        # 尝试继续删除其他回复
                
                # 找出所有主评论并删除
                print(f"[DELETE_ACTION] 删除主评论...")
                main_comments = [comment for comment in action_comments if comment.parent_id is None]
                for comment in main_comments:
                    try:
                        db.session.delete(comment)
                    except Exception as e:
                        print(f"[DELETE_ACTION] 删除主评论 {comment.id} 时出错: {e}")
                        # 尝试继续删除其他主评论
                
                # 提交评论删除操作
                db.session.flush()
                print(f"[DELETE_ACTION] 已处理与动态 {action_id} 相关的所有评论")
            else:
                print(f"[DELETE_ACTION] 未找到与动态 {action_id} 相关的评论")
                
        except Exception as e:
            db.session.rollback()
            error_msg = f"删除动态 {action_id} 相关评论时出错: {e}"
            print(f"[DELETE_ACTION] {error_msg}")
            traceback.print_exc()
            return jsonify({"error": error_msg}), 500
        # --- 结束改进 ---
        
        # 删除关联的交互
        if associated_interactions:
            print(f"Found {len(associated_interactions)} interactions for action {action_id}. Deleting them...")
            for interaction in associated_interactions:
                db.session.delete(interaction)
            print("Associated interactions deleted.")

        # 如果是转发类型的动态，更新原动态的转发计数
        if action_to_delete.target_type == 'action' and action_to_delete.action_type == 'share':
            try:
                # 获取原动态
                original_action = UserAction.query.get(action_to_delete.target_id)
                if original_action:
                    # 计算新的转发数（不包括即将删除的这条）
                    new_reposts_count = UserAction.query.filter(
                        UserAction.target_type == 'action',
                        UserAction.action_type == 'share',
                        UserAction.target_id == original_action.id,
                        UserAction.id != action_to_delete.id  # 排除即将删除的这条
                    ).count()
                    
                    # 更新转发计数
                    original_action.reposts_count = new_reposts_count
                    db.session.add(original_action)
            except Exception as e:
                print(f"Error updating reposts count for original action {action_to_delete.target_id}: {e}")
                # 继续删除操作，不要因为更新计数失败而中断

        # --- 修改: 不再软删除，直接物理删除 ---
        try:
            # --- 新增: 处理 ActionInteraction 表中的记录 --- 
            # 如果被删除的是点赞/收藏操作，并且目标是 article 或 post，检查是否有相关的 ActionInteraction 记录
            if action_to_delete.action_type in ['like', 'collect'] and action_to_delete.target_type in ['article', 'post']:
                # 检查是否有对应的 ActionInteraction 记录
                interaction = ActionInteraction.query.filter_by(
                    user_id=action_to_delete.user_id,
                    action_id=action_to_delete.target_id,
                    interaction_type=action_to_delete.action_type
                ).first()
                
                if interaction:
                    print(f"[DELETE_ACTION] 找到关联的 ActionInteraction 记录 (ID: {interaction.id})，将物理删除")
                    db.session.delete(interaction)  # 物理删除 ActionInteraction 记录
            # --- 结束新增 ---
            
            # 物理删除 UserAction 记录
            print(f"[DELETE_ACTION] 物理删除 UserAction 记录 (ID: {action_id})")
            db.session.delete(action_to_delete)  # 物理删除
            
            # 提交所有更改
            db.session.commit()
            print(f"[DELETE_ACTION] 已物理删除 Action {action_id}")

            # 如果被删除的 Action 是点赞或收藏，会尝试异步更新相关内容的计数值
            target_likes_count = None
            target_collects_count = None
            action_type = action_to_delete.action_type
            target_type = action_to_delete.target_type
            target_id = action_to_delete.target_id
            
            if action_type in ['like', 'collect']:
                try:
                    print(f"[DELETE_ACTION] 动作类型: {action_type}, 目标类型: {target_type}, 目标ID: {target_id}")
                    
                    if target_type == 'post' and target_id:
                        print(f"[DELETE_ACTION] 准备更新帖子 {target_id} 的计数值...")
                        # 查询真实的点赞和收藏数
                        if action_type == 'like' or action_type == 'collect':
                            # 计算点赞数
                            target_likes_count = UserAction.query.filter(
                                UserAction.action_type == 'like',
                                UserAction.target_type == 'post', 
                                UserAction.target_id == target_id,
                                UserAction.is_deleted == False
                            ).count()
                            # 计算收藏数
                            target_collects_count = UserAction.query.filter(
                                UserAction.action_type == 'collect',
                                UserAction.target_type == 'post', 
                                UserAction.target_id == target_id,
                                UserAction.is_deleted == False
                            ).count()
                            print(f"[DELETE_ACTION] 帖子 {target_id} 的真实计数: 点赞数={target_likes_count}, 收藏数={target_collects_count}")
                            
                        # 仍然使用异步任务更新数据库
                        update_post_counts.delay(target_id)
                        print(f"[DELETE_ACTION] 已将更新帖子计数的任务加入队列，帖子ID: {target_id}")
                    elif target_type == 'article' and target_id:
                        print(f"[DELETE_ACTION] 准备更新文章 {target_id} 的计数值...")
                        update_article_counts.delay(target_id)
                        print(f"[DELETE_ACTION] 已将更新文章计数的任务加入队列，文章ID: {target_id}")
                    else:
                        print(f"[DELETE_ACTION] 目标类型 {target_type} 不需要更新计数")
                except Exception as e:
                    error_msg = f"更新计数任务队列失败: Action {action_id} (目标: {target_type} {target_id}): {e}"
                    print(f"[DELETE_ACTION] {error_msg}")
                    current_app.logger.error(f"[DELETE_ACTION] {error_msg}", exc_info=True)
                    # 即使更新计数失败，我们也继续执行，不影响删除成功
            else:
                print(f"[DELETE_ACTION] Action {action_id} 不是点赞或收藏类型，不需要更新计数")

            # 返回带有最新计数的响应
            response_data = {
                "message": "动态已成功删除",
                "action_id": None  # 明确表示动作已被删除
            }
            
            if action_type == 'like':
                response_data["is_liked"] = False
                if target_likes_count is not None:
                    response_data["target_likes_count"] = target_likes_count
            elif action_type == 'collect':
                response_data["is_collected"] = False
                if target_collects_count is not None:
                    response_data["target_collects_count"] = target_collects_count
            
            # 添加调试日志记录返回值    
            print(f"[DELETE_ACTION] 返回响应数据: {response_data}")
                    
            return jsonify(response_data), 200
        except Exception as e:
            db.session.rollback()
            error_msg = f"删除 Action {action_id} 失败: {e}"
            print(f"[DELETE_ACTION] {error_msg}")
            traceback.print_exc()
            return jsonify({"error": f"删除动态失败: {str(e)}"}), 500
    
    except Exception as e:
        db.session.rollback()
        error_msg = f"删除 Action {action_id} 失败: {e}"
        print(f"[DELETE_ACTION] {error_msg}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# --- 新增：获取动态时间线的路由 ---
@actions_bp.route('/<int:action_id>/timeline', methods=['GET'])
@jwt_required(optional=True) # 允许匿名用户访问
def get_action_timeline(action_id):
    """Fetches the entire action chain for a given action ID, ordered oldest to newest."""
    current_user_id = get_jwt_identity() if get_jwt_identity() else None
    print(f"--- Fetching timeline for action {action_id}, user: {current_user_id} ---")

    timeline_actions_raw = []
    start_action = db.session.get(UserAction, action_id)

    if not start_action:
        return jsonify({"error": "指定的动态不存在"}), 404

    # 使用 current_action 向上遍历到链的起点
    current_action = start_action
    visited_ids = set()
    while current_action and current_action.id not in visited_ids:
        visited_ids.add(current_action.id)
        # 只添加未删除的动态到时间线
        if not (hasattr(current_action, 'is_deleted') and current_action.is_deleted):
            timeline_actions_raw.insert(0, current_action) # 在列表开头插入，保证顺序
        # 继续向上查找原始动态
        if current_action.target_type == 'action' and current_action.original_action_id:
            current_action = db.session.get(UserAction, current_action.original_action_id)
        else:
            break # 到达链的起点或断裂
            
    if not timeline_actions_raw:
        # 如果循环没有添加任何内容（例如，起始动作本身有问题或已被删除），返回错误
        return jsonify({"error": "无法构建时间线或所有相关动态已删除"}), 404

    # 将原始 Action 转换为字典列表
    try:
        timeline_dicts = [action_to_timeline_dict(action, current_user_id) for action in timeline_actions_raw]
        # 过滤掉转换失败的 None 值 (例如 action 不存在)
        timeline_dicts = [d for d in timeline_dicts if d is not None]
    except Exception as e:
        # 捕获转换过程中的任何错误
        print(f"Error converting actions to dicts for timeline {action_id}: {e}")
        traceback.print_exc() 
        return jsonify({"error": "处理时间线数据时出错"}), 500

    print(f"--- Timeline for action {action_id} has {len(timeline_dicts)} items ---")
    return jsonify(timeline_dicts), 200
# --- 结束新增路由 ---

# --- 新增：处理 Action 评论的路由 --- 
@actions_bp.route('/<int:action_id>/comments', methods=['GET'])
@jwt_required(optional=True) # 允许匿名访问 GET 请求
def get_action_comments(action_id):
    """获取指定动态的所有评论 (包含回复)，支持排序。"""
    try:
        verify_jwt_in_request(optional=True)
        current_user_id = get_jwt_identity()

        action = db.session.get(UserAction, action_id)
        if not action:
            return jsonify({"error": "指定的动态不存在"}), 404

        sort_by = request.args.get('sort_by', 'latest')

        # --- 修改：获取所有相关评论，并应用初步排序 ---
        # 创建一个子查询来计算每个评论的点赞数
        # ActionCommentLikes = aliased(action_comment_likes) # Not strictly needed if using relationship.count()

        all_comments_query = ActionComment.query.filter(ActionComment.action_id == action_id)

        if sort_by == 'popular':
            # 按点赞数降序 (使用关系计数)，然后按创建时间降序
            # SQLAlchemy doesn't directly support .count() in order_by for relationships like this easily.
            # A more robust way is to use a subquery or a hybrid_property on the model.
            # For now, we'll sort primarily by created_at for popular, and rely on client-side or a more complex query later if precise popular sorting is critical.
            # A simpler approach for now, given ActionComment.to_dict already calculates likes_count:
            # We will fetch all, then sort in Python after dict conversion if 'popular' is chosen,
            # or apply DB sort for 'latest'. This is a trade-off for complexity.
            # Let's try to sort by created_at first, then handle 'popular' in Python or refine query.
            # For a DB level sort by likes for 'popular':
            likes_subquery = db.session.query(
                action_comment_likes.c.comment_id,
                func.count(action_comment_likes.c.user_id).label('likes_count')
            ).group_by(action_comment_likes.c.comment_id).subquery()

            all_comments_query = all_comments_query.outerjoin(
                likes_subquery, ActionComment.id == likes_subquery.c.comment_id
            ).order_by(func.coalesce(likes_subquery.c.likes_count, 0).desc(), ActionComment.created_at.desc())
        else: # 'latest' or default
            all_comments_query = all_comments_query.order_by(ActionComment.created_at.desc())

        all_action_comments = all_comments_query.all()
        
        # --- 构建评论树 (两遍处理) ---
        comment_dict_map = {}
        # 第一遍：序列化所有评论并存入 map
        for comment in all_action_comments:
            # to_dict will handle calculating likes_count and is_liked based on current_user_id
            comment_data = comment.to_dict(include_replies=True) # include_replies=True initializes .replies key
            comment_data['replies'] = [] # Clear replies, we will build the tree manually
            comment_dict_map[comment.id] = comment_data

        # 第二遍：构建树结构
        nested_comments_tree = []
        for comment_id in comment_dict_map:
            comment_data = comment_dict_map[comment_id]
            parent_id = comment_data.get('parent_id')
            if parent_id and parent_id in comment_dict_map:
                parent_comment_data = comment_dict_map[parent_id]
                parent_comment_data['replies'].append(comment_data)
            else:
                nested_comments_tree.append(comment_data)
        
        # --- 对每一层的 replies 列表进行排序 ---
        def sort_replies_recursively(comments_list, sort_order):
            for comment_data in comments_list:
                if comment_data.get('replies'):
                    if sort_order == 'popular':
                        comment_data['replies'].sort(key=lambda r: (r.get('likes_count', 0), r.get('created_at', '')), reverse=True)
                    else: # 'latest'
                        comment_data['replies'].sort(key=lambda r: r.get('created_at', ''), reverse=True)
                    sort_replies_recursively(comment_data['replies'], sort_order)
        
        # 主列表排序 (nested_comments_tree)
        if sort_by == 'popular':
            nested_comments_tree.sort(key=lambda c: (c.get('likes_count', 0), c.get('created_at', '')), reverse=True)
        else: # 'latest' - already sorted by DB, but Python sort ensures consistency if DB sort was different
            nested_comments_tree.sort(key=lambda c: c.get('created_at', ''), reverse=True)

        sort_replies_recursively(nested_comments_tree, sort_by) # Sort replies within the built tree

        return jsonify({"comments": nested_comments_tree})

    except Exception as e:
        current_app.logger.error(f"Error fetching comments for action {action_id}: {e}", exc_info=True)
        return jsonify({"error": "获取评论失败"}), 500

@actions_bp.route('/<int:action_id>/comments', methods=['POST'])
@jwt_required()
def post_action_comment(action_id):
    """为某条动态添加评论或回复，并处理@lynn提及以触发AI回复。"""
    current_user_id_from_jwt = get_jwt_identity()
    data = request.get_json()
    content = data.get('content')
    parent_id = data.get('parent_id')
    # 新增：获取前端传递的 @lynn 提及布尔标记
    mention_lynn = data.get('mention_lynn', False)

    if not content or not content.strip():
        return jsonify({"error": "评论内容不能为空"}), 400
    
    try:
        current_user_id_int = int(current_user_id_from_jwt)
    except ValueError:
        current_app.logger.error(f"[API_POST_ACTION_COMMENT] Invalid user_id_from_jwt: {current_user_id_from_jwt}")
        return jsonify({"error": "无效的用户身份令牌"}), 401

    action = db.session.get(UserAction, action_id)
    if not action:
        return jsonify({"error": "指定的动态不存在"}), 404
    
    if parent_id:
        parent_comment = db.session.query(ActionComment).filter_by(id=parent_id, action_id=action_id).first()
        if not parent_comment:
            return jsonify({"error": "要回复的评论不存在或不属于该动态"}), 404
        if parent_comment.is_deleted:
             return jsonify({"error": "不能回复已删除的评论"}), 400
            
    try:
        new_comment = ActionComment(
            content=content.strip(),
            user_id=current_user_id_int,
            action_id=action_id,
            parent_id=parent_id
        )
        db.session.add(new_comment)
        db.session.commit() # 提交用户评论以获取 new_comment.id
        user_action_comment_id = new_comment.id
            
        # 更新动态的评论数缓存 (如果 action 对象有 comments_count 属性)
        if hasattr(action, 'comments_count') and action.comments_count is not None:
            try:
                action.comments_count = db.session.query(func.count(ActionComment.id)).filter(ActionComment.action_id == action_id, ActionComment.is_deleted == False).scalar()
                db.session.commit()
            except Exception as e_count:
                current_app.logger.error(f"[API_POST_ACTION_COMMENT] Error updating comments_count for action {action_id}: {e_count}", exc_info=True)
                db.session.rollback() # 回滚计数更新的错误，但不影响主评论
                
        # 添加异步更新动态计数的任务
        try:
            update_action_counts.delay(action_id)
            current_app.logger.info(f"[API_POST_ACTION_COMMENT] 已将更新动态计数的任务加入队列，动态ID: {action_id}")
        except Exception as e_task:
            current_app.logger.error(f"[API_POST_ACTION_COMMENT] 将更新动态计数的任务加入队列失败: {e_task}")
            # 不阻止主操作成功
        
        # 如果提到了 @lynn，则异步调用 AI 回复任务
        if mention_lynn:
            question_for_ai = ""
            content_lower = content.strip().lower()
            lynn_mention_index = content_lower.find('@lynn')
            if lynn_mention_index != -1:
                question_for_ai = content.strip()[lynn_mention_index + len('@lynn'):].strip()
            
            if question_for_ai:
                current_app.logger.info(f"[API_POST_ACTION_COMMENT] User ActionComment ID {user_action_comment_id} - Queueing AI reply task. Question: {question_for_ai}")
                
                # 获取父评论内容（如果存在）
                parent_comment_content = None
                if parent_id:
                    parent_comment_obj = db.session.get(ActionComment, parent_id)
                    if parent_comment_obj and not parent_comment_obj.is_deleted:
                        parent_comment_content = parent_comment_obj.content

                generate_ai_action_comment_reply_task.delay(
                    user_action_comment_id=user_action_comment_id,
                    action_id=action_id,
                    user_question=question_for_ai,
                    original_user_id=current_user_id_int,
                    parent_comment_content=parent_comment_content  # 添加父评论内容
                )
            else:
                current_app.logger.info(f"[API_POST_ACTION_COMMENT] User ActionComment ID {user_action_comment_id} - Mention @lynn detected, but no subsequent question found.")
        
        db.session.refresh(new_comment) # 刷新以获取完整数据
        # 确保 to_dict 时用户对象已加载
        if new_comment.user is None:
            user_obj = db.session.get(User, current_user_id_int)
            if user_obj:
                new_comment.user = user_obj

        return jsonify(new_comment.to_dict(include_replies=False)), 201 # 返回用户自己的评论

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"[API_POST_ACTION_COMMENT] Error posting comment for action {action_id}: {e}", exc_info=True)
        return jsonify({"error": "评论发表失败"}), 500

@actions_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_action_comment(comment_id):
    """删除动态评论"""
    current_user_id = get_jwt_identity()
    
    comment = ActionComment.query.get_or_404(comment_id)
    
    # 检查权限
    if comment.user_id != current_user_id:
        return jsonify({"error": "没有权限删除此评论"}), 403
        
    try:
        # 软删除评论
        comment.is_deleted = True
        comment.original_content = comment.content  # 保存原始内容
        comment.content = '[该评论已删除]'
        
        # 如果这是一个父评论，也要标记它的所有回复为已删除
        if not comment.parent_id:
            for reply in comment.replies:
                reply.is_deleted = True
                reply.original_content = reply.content
                reply.content = '[该评论已删除]'
        
        db.session.commit()
        
        # 更新评论数缓存
        try:
            action = UserAction.query.get(comment.action_id)
            if action:
                # 获取当前动态的所有未删除评论数
                total_comments = ActionComment.query.filter_by(
                    action_id=action.id,
                    is_deleted=False
                ).count()
                
                # 更新动态的评论数缓存（如果有相关字段）
                if hasattr(action, 'comments_count'):
                    action.comments_count = total_comments
                    db.session.commit()
                
                # 添加异步更新动态计数的任务
                try:
                    update_action_counts.delay(action.id)
                    print(f"[DELETE_ACTION_COMMENT] 已将更新动态计数的任务加入队列，动态ID: {action.id}")
                except Exception as e_task:
                    print(f"[DELETE_ACTION_COMMENT] 将更新动态计数的任务加入队列失败: {e_task}")
                    # 不阻止主操作成功
        except Exception as e:
            print(f"Error updating comment count for action {comment.action_id}: {e}")
            # 不要因为更新计数失败而影响主要功能
            db.session.rollback()
        
        return jsonify({"message": "评论已删除"}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting comment {comment_id}: {e}")
        return jsonify({"error": "删除评论失败"}), 500

# --- 添加：处理点赞和收藏的专用API端点 ---
@actions_bp.route('/<int:action_id>/likes', methods=['POST'])
@jwt_required()
def like_action(action_id):
    """为指定动态添加点赞"""
    current_user_id = get_jwt_identity()
    print(f"User {current_user_id} attempting to like action {action_id}...")
    
    try:
        # 检查动态是否存在
        action = UserAction.query.get(action_id)
        if not action:
            return jsonify({"error": "找不到指定的动态"}), 404
        
        # 使用GlobalInteraction检查是否已点赞
        if GlobalInteraction.has_interaction(
            user_id=current_user_id,
            content_type='action',
            content_id=action_id,
            interaction_type='like'
        ):
            print(f"User {current_user_id} already liked action {action_id}")
            return jsonify(action_to_timeline_dict(action, current_user_id)), 200
        
        # 创建新的点赞记录 - 使用ActionInteraction
        new_interaction = ActionInteraction(
            user_id=current_user_id,
            action_id=action_id,
            interaction_type='like'
        )
        db.session.add(new_interaction)
        db.session.commit()
        
        print(f"User {current_user_id} liked action {action_id}")
        
        # 触发器会自动将记录同步到global_interactions表中
        
        return jsonify(action_to_timeline_dict(action, current_user_id)), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Error liking action: {e}")
        traceback.print_exc()
        return jsonify({"error": "点赞操作失败", "details": str(e)}), 500

@actions_bp.route('/<int:action_id>/likes', methods=['DELETE'])
@jwt_required()
def unlike_action(action_id):
    """取消对指定动态的点赞"""
    current_user_id = get_jwt_identity()
    print(f"User {current_user_id} attempting to unlike action {action_id}...")
    
    try:
        # 检查动态是否存在
        action = UserAction.query.get(action_id)
        if not action:
            print(f"[UNLIKE_ACTION] 找不到动态 {action_id}")
            return jsonify({"error": "找不到指定的动态"}), 404
        
        deleted_count = 0
        
        # 删除ActionInteraction表中的记录
        interaction = ActionInteraction.query.filter_by(
            user_id=current_user_id,
            action_id=action_id,
            interaction_type='like'
        ).first()
        
        if interaction:
            print(f"[UNLIKE_ACTION] 找到并删除 ActionInteraction 记录 (ID: {interaction.id})")
            db.session.delete(interaction)
            deleted_count += 1
        
        # 删除UserAction表中的记录 - 注意这里查询所有可能的记录方式
        useraction = UserAction.query.filter_by(
            user_id=current_user_id,
            action_type='like',
            target_type='action',
            target_id=action_id
        ).first()
        
        # 如果找不到，尝试查找针对文章或帖子的点赞
        if not useraction and action:
            if action.target_type == 'article':
                print(f"[UNLIKE_ACTION] 尝试查找针对文章的点赞记录 (文章ID: {action.target_id})")
                useraction = UserAction.query.filter_by(
                    user_id=current_user_id,
                    action_type='like',
                    target_type='article',
                    target_id=action.target_id
                ).first()
            elif action.target_type == 'post':
                print(f"[UNLIKE_ACTION] 尝试查找针对帖子的点赞记录 (帖子ID: {action.target_id})")
                useraction = UserAction.query.filter_by(
                    user_id=current_user_id,
                    action_type='like',
                    target_type='post',
                    target_id=action.target_id
        ).first()
        
        if useraction:
            print(f"[UNLIKE_ACTION] 找到并删除 UserAction 记录 (ID: {useraction.id})")
            db.session.delete(useraction)  # 物理删除，而不是软删除
            deleted_count += 1
        
        if deleted_count == 0:
            print(f"[UNLIKE_ACTION] 未找到用户 {current_user_id} 对动态 {action_id} 的点赞记录")
            return jsonify({"message": "未找到点赞记录"}), 404
        
        db.session.commit()
        print(f"[UNLIKE_ACTION] 用户 {current_user_id} 成功取消点赞动态 {action_id}")
        
        # 获取目标信息用于更新计数
        target_type = action.target_type
        target_id = action.target_id
        
        # 异步更新目标的计数
        try:
            if target_type == 'article' and target_id:
                print(f"[UNLIKE_ACTION] 将更新文章 {target_id} 的计数")
                update_article_counts.delay(target_id)
                print(f"[UNLIKE_ACTION] 已将更新文章计数的任务加入队列，文章ID: {target_id}")
            elif target_type == 'post' and target_id:
                print(f"[UNLIKE_ACTION] 将更新帖子 {target_id} 的计数")
                update_post_counts.delay(target_id)
                print(f"[UNLIKE_ACTION] 已将更新帖子计数的任务加入队列，帖子ID: {target_id}")
            
            # 添加更新动态点赞计数的任务
            print(f"[UNLIKE_ACTION] 将更新动态 {action_id} 的点赞计数")
            calculate_action_likes_count.delay(action_id)
            print(f"[UNLIKE_ACTION] 已将更新动态点赞计数的任务加入队列，动态ID: {action_id}")
        except Exception as e:
            print(f"[UNLIKE_ACTION] 更新计数任务队列失败: {e}")
            # 不阻止主操作成功
        
        # 修改响应数据，明确包含状态信息
        response_data = {
            "message": "成功取消点赞",
            "is_liked": False,
            "action_id": None
        }
        
        # 如果有目标计数，也包含在响应中
        if target_type == 'post' and target_id:
            try:
                current_likes = UserAction.query.filter_by(
                    action_type='like',
                    target_type='post', 
                    target_id=target_id,
                    is_deleted=False
                ).count()
                response_data["target_likes_count"] = current_likes
            except Exception as e:
                print(f"[UNLIKE_ACTION] 获取帖子点赞计数失败: {e}")
        
        print(f"[UNLIKE_ACTION] 返回响应数据: {response_data}")
        return jsonify(response_data), 200
    
    except Exception as e:
        db.session.rollback()
        print(f"[UNLIKE_ACTION] 取消点赞动态 {action_id} 失败: {e}")
        traceback.print_exc()
        return jsonify({"error": f"取消点赞失败: {str(e)}"}), 500

@actions_bp.route('/<int:action_id>/collects', methods=['POST'])
@jwt_required()
def collect_action(action_id):
    """收藏指定动态"""
    current_user_id = get_jwt_identity()
    print(f"User {current_user_id} attempting to collect action {action_id}...")
    
    try:
        # 检查动态是否存在
        action = UserAction.query.get(action_id)
        if not action:
            return jsonify({"error": "找不到指定的动态"}), 404
        
        # 检查是否已经收藏 - 先查ActionInteraction表
        existing_interaction = ActionInteraction.query.filter_by(
            user_id=current_user_id,
            action_id=action_id,
            interaction_type='collect'
        ).first()
        
        if existing_interaction:
            print(f"User {current_user_id} already collected action {action_id}")
            return jsonify(action_to_timeline_dict(action, current_user_id)), 200
        
        # 检查是否在UserAction表中已收藏
        existing_useraction = UserAction.query.filter_by(
            user_id=current_user_id,
            target_type='action',
            target_id=action_id,
            action_type='collect'
        ).first()
        
        if existing_useraction:
            print(f"User {current_user_id} already collected action {action_id} via UserAction")
            return jsonify(action_to_timeline_dict(action, current_user_id)), 200
        
        # 创建新的收藏记录
        new_interaction = ActionInteraction(
            user_id=current_user_id,
            action_id=action_id,
            interaction_type='collect'
        )
        db.session.add(new_interaction)
        db.session.commit()
        
        print(f"User {current_user_id} collected action {action_id}")
        
        # 添加异步更新动态收藏计数的任务
        try:
            calculate_action_collects_count.delay(action_id)
            print(f"[COLLECT_ACTION] 已将更新动态收藏计数的任务加入队列，动态ID: {action_id}")
        except Exception as e:
            print(f"[COLLECT_ACTION] 将更新动态收藏计数的任务加入队列失败: {e}")
            # 不阻止主操作成功
            
        return jsonify(action_to_timeline_dict(action, current_user_id)), 201
    
    except Exception as e:
        db.session.rollback()
        print(f"Error collecting action {action_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"收藏失败: {str(e)}"}), 500

@actions_bp.route('/<int:action_id>/collects', methods=['DELETE'])
@jwt_required()
def uncollect_action(action_id):
    """取消收藏指定动态"""
    current_user_id = get_jwt_identity()
    print(f"[UNCOLLECT_ACTION] 用户 {current_user_id} 尝试取消收藏动态 {action_id}...")
    
    try:
        # 检查动态是否存在
        action = UserAction.query.get(action_id)
        if not action:
            print(f"[UNCOLLECT_ACTION] 找不到动态 {action_id}")
            return jsonify({"error": "找不到指定的动态"}), 404
        
        deleted_count = 0
        
        # 删除ActionInteraction表中的记录
        interaction = ActionInteraction.query.filter_by(
            user_id=current_user_id,
            action_id=action_id,
            interaction_type='collect'
        ).first()
        
        if interaction:
            print(f"[UNCOLLECT_ACTION] 找到并删除 ActionInteraction 记录 (ID: {interaction.id})")
            db.session.delete(interaction)
            deleted_count += 1
        
        # 删除UserAction表中的记录 - 注意这里查询所有可能的记录方式
        useraction = UserAction.query.filter_by(
            user_id=current_user_id,
            action_type='collect',
            target_type='action',
            target_id=action_id
        ).first()
        
        # 如果找不到，尝试查找针对文章或帖子的收藏
        if not useraction and action:
            if action.target_type == 'article':
                print(f"[UNCOLLECT_ACTION] 尝试查找针对文章的收藏记录 (文章ID: {action.target_id})")
                useraction = UserAction.query.filter_by(
                    user_id=current_user_id,
                    action_type='collect',
                    target_type='article',
                    target_id=action.target_id
                ).first()
            elif action.target_type == 'post':
                print(f"[UNCOLLECT_ACTION] 尝试查找针对帖子的收藏记录 (帖子ID: {action.target_id})")
                useraction = UserAction.query.filter_by(
                    user_id=current_user_id,
                    action_type='collect',
                    target_type='post',
                    target_id=action.target_id
        ).first()
        
        if useraction:
            print(f"[UNCOLLECT_ACTION] 找到并删除 UserAction 记录 (ID: {useraction.id})")
            db.session.delete(useraction)  # 物理删除，而不是软删除
            deleted_count += 1
        
        if deleted_count == 0:
            print(f"[UNCOLLECT_ACTION] 未找到用户 {current_user_id} 对动态 {action_id} 的收藏记录")
            return jsonify({"message": "未找到收藏记录"}), 404
        
        db.session.commit()
        print(f"[UNCOLLECT_ACTION] 用户 {current_user_id} 成功取消收藏动态 {action_id}")
        
        # 获取目标信息用于更新计数
        target_type = action.target_type
        target_id = action.target_id
        
        # 异步更新目标的计数
        try:
            if target_type == 'article' and target_id:
                print(f"[UNCOLLECT_ACTION] 将更新文章 {target_id} 的计数")
                update_article_counts.delay(target_id)
                print(f"[UNCOLLECT_ACTION] 已将更新文章计数的任务加入队列，文章ID: {target_id}")
            elif target_type == 'post' and target_id:
                print(f"[UNCOLLECT_ACTION] 将更新帖子 {target_id} 的计数")
                update_post_counts.delay(target_id)
                print(f"[UNCOLLECT_ACTION] 已将更新帖子计数的任务加入队列，帖子ID: {target_id}")
                
            # 添加更新动态收藏计数的任务
            print(f"[UNCOLLECT_ACTION] 将更新动态 {action_id} 的收藏计数")
            calculate_action_collects_count.delay(action_id)
            print(f"[UNCOLLECT_ACTION] 已将更新动态收藏计数的任务加入队列，动态ID: {action_id}")
        except Exception as e:
            print(f"[UNCOLLECT_ACTION] 更新计数任务队列失败: {e}")
            # 不阻止主操作成功
        
        # 修改响应数据，明确包含状态信息
        response_data = {
            "message": "成功取消收藏",
            "is_collected": False,
            "action_id": None
        }
        
        # 如果有目标计数，也包含在响应中
        if target_type == 'post' and target_id:
            try:
                current_collects = UserAction.query.filter_by(
                    action_type='collect',
                    target_type='post', 
                    target_id=target_id,
                    is_deleted=False
                ).count()
                response_data["target_collects_count"] = current_collects
            except Exception as e:
                print(f"[UNCOLLECT_ACTION] 获取帖子收藏计数失败: {e}")
        
        print(f"[UNCOLLECT_ACTION] 返回响应数据: {response_data}")
        return jsonify(response_data), 200
    
    except Exception as e:
        db.session.rollback()
        print(f"[UNCOLLECT_ACTION] 取消收藏动态 {action_id} 失败: {e}")
        traceback.print_exc()
        return jsonify({"error": f"取消收藏失败: {str(e)}"}), 500

# --- 如果下面还有其他 actions_bp 的路由，它们应该保持不变 ---
# 例如:
# @actions_bp.route('/some_other_action_route', methods=['GET'])
# def some_other_function():
#     pass