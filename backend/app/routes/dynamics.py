"""
此模块定义了与用户动态 (基于 UserAction 模型) 相关的 API 端点。

主要功能:
- 获取分享动态列表 (`/api/dynamics/shares`):
    - 返回用户分享的文章(Article)、帖子(Post)或转发其他动态(Action)的列表。
    - 支持分页。
    - 递归地获取被转发动态的详细信息 (通过辅助函数 `fetch_action_details`)。
    - 包含分享者信息、分享评论、时间、交互计数 (点赞、收藏、转发) 以及当前用户是否已交互的状态。

辅助函数:
- `fetch_action_details(action_id)`: 获取单个动态 (UserAction) 的详细信息，包括分享者、内容、目标对象(文章/帖子/工具/被转发动态)的标题/slug、交互计数和当前用户交互状态。

依赖模型: UserAction, Article, User, Tool, Post, ActionInteraction
使用 Flask 蓝图: dynamics_bp (前缀 /api/dynamics)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
# -*- coding: utf-8 -*-
from flask import Blueprint, request, jsonify
from app import db, limiter  # 导入 limiter
from app.models import UserAction, Article, User, Tool, Post # Removed ActionInteraction
from sqlalchemy import desc, case
from sqlalchemy.orm import aliased, joinedload
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request # 导入 JWT 工具
from flask import current_app # 导入 current_app 用于日志

# 创建一个蓝图 (Blueprint) 用于组织动态相关的路由
dynamics_bp = Blueprint('dynamics_bp', __name__, url_prefix='/api/dynamics')

# --- 新增：递归辅助函数，用于获取完整的动态信息 (包括嵌套的原始分享) ---
def fetch_action_details(action_id, current_user_id_from_request=None):
    """
    递归获取单个 action 的详细信息及其嵌套的 original_action，并包含交互信息
    
    Args:
        action_id (int): 要获取详情的 UserAction ID。
        current_user_id_from_request (int, optional): 发起请求的用户 ID，用于检查交互状态。
                                                     如果为 None 或未提供 JWT，则交互状态默认为 False。
    
    Returns:
        dict or None: 包含动态详细信息的字典，如果 action 不存在则返回 None。
    """
    if not action_id:
        return None

    # 预加载分享者用户和原始分享动作（如果存在）
    action = db.session.query(UserAction)\
        .options(
            joinedload(UserAction.user), # 预加载分享者
            joinedload(UserAction.original_action).options( # 预加载原始分享
                joinedload(UserAction.user) # 预加载原始分享的分享者
            )
        )\
        .get(action_id)

    if not action:
        return None

    sharer = action.user
    # --- 修改：获取头像 URL 和 ID ---
    sharer_username = sharer.nickname if sharer and sharer.nickname else (sharer.email.split('@')[0] if sharer and sharer.email else '未知用户')
    sharer_avatar_url = sharer.avatar if sharer else None
    sharer_id = sharer.id if sharer else None
    # --- 结束修改 ---

    # --- 处理 images 字段 - 修复：确保只处理当前动态自己的图片 ---
    images = []
    if hasattr(action, 'images') and action.images:
        # 尝试解析 JSON 字符串为 Python 列表
        try:
            import json
            if isinstance(action.images, str):
                images = json.loads(action.images)
            elif isinstance(action.images, list):
                images = action.images
        except Exception as e:
            current_app.logger.error(f"Error parsing images JSON for action {action_id}: {e}")
    # --- 处理完毕 ---

    # --- 修改：使用通用 target 字段 --- 
    details = {
        'action_id': action.id,
        'share_comment': action.content,
        'shared_at': action.created_at.isoformat() + 'Z',
        'sharer_id': sharer_id, # --- 新增：添加分享者 ID ---
        'sharer_username': sharer_username,
        'sharer_avatar_url': sharer_avatar_url, 
        'is_repost': action.target_type == 'action', 
        'target_type': action.target_type, 
        'target_title': None, 
        'target_slug': None,  
        'target_id': action.target_id, # --- 新增：直接包含 target_id --- 
        'original_action': None, # 初始化
        # --- 修改：从 UserAction 表获取交互计数 ---
        'likes_count': UserAction.query.filter_by(target_id=action.id, target_type='action', action_type='like').count(),
        'collects_count': UserAction.query.filter_by(target_id=action.id, target_type='action', action_type='collect').count(),
        # --- 结束修改 ---\
        'reposts_count': UserAction.query.filter_by(action_type='share', target_type='action', target_id=action.id).count(),
        'is_liked_by_current_user': False, # 初始化状态
        'is_collected_by_current_user': False,
        'like_action_id': None, # 初始化状态
        'collect_action_id': None, # 初始化状态
        'images': images # 添加 images 字段 - 只包含动态自己的图片
    }
    # --- 结束修改 ---\

    # --- 修改：使用传入的 current_user_id_from_request 获取交互状态 --- 
    user_id = current_user_id_from_request # 直接使用传入的ID
        
    if user_id:
        # --- 修改：从 UserAction 表查询交互状态 ---
        like_action = UserAction.query.filter_by(
            user_id=user_id, target_id=action.id, target_type='action', action_type='like'
        ).first()
        if like_action:
            details['is_liked_by_current_user'] = True
            details['like_action_id'] = like_action.id # 记录 UserAction 的 ID
            
        collect_action = UserAction.query.filter_by(
            user_id=user_id, target_id=action.id, target_type='action', action_type='collect'
        ).first()
        if collect_action:
            details['is_collected_by_current_user'] = True
            details['collect_action_id'] = collect_action.id # 记录 UserAction 的 ID
        # --- 结束修改 ---

    # --- 修改：根据 target_type 填充 target_title 和 target_slug --- 
    if action.target_type == 'article':
        target_content = db.session.get(Article, action.target_id)
        if target_content:
            details['target_title'] = target_content.title
            details['target_slug'] = target_content.slug
            details['target_type'] = 'article' # 确保类型正确
        else:
            details['target_title'] = "[文章已删除]"
            details['target_slug'] = None 
            details['target_type'] = 'deleted'
            details['target_id'] = None
    elif action.target_type == 'post':
        target_content = db.session.get(Post, action.target_id) # <-- 查询 Post 模型
        if target_content:
            details['target_title'] = target_content.title
            details['target_slug'] = target_content.slug
            details['target_type'] = 'post' # 确保类型正确
        else:
            details['target_title'] = "[帖子已删除]"
            details['target_slug'] = None 
            details['target_type'] = 'deleted'
            details['target_id'] = None
    elif action.target_type == 'action' and action.original_action_id:
        # 递归调用时也传递 user_id
        details['original_action'] = fetch_action_details(action.original_action_id, current_user_id_from_request) 
        # target_id 已经是 action 的 ID，无需修改
    elif action.target_type == 'tool':
        # target_id 已经是 tool 的 ID
        # 获取 Tool title 和 slug (如果需要)
        target_tool = db.session.get(Tool, action.target_id) # 假设 Tool 模型存在
        if target_tool:
            details['target_title'] = target_tool.name
            details['target_slug'] = target_tool.slug
        else:
            details['target_title'] = "[工具已删除]"
            details['target_slug'] = None
            details['target_type'] = 'deleted'
            details['target_id'] = None
    elif action.target_type == 'user': # 处理 target_type=='user' (原创状态)
        # print(f"[DEBUG] 处理原创动态 (ID={action.id}): action_type={action.action_type}, target_type={action.target_type}, target_id={action.target_id}")
        # 对于原创动态 (action_type='create_status', target_type='user')
        # target_id 应该是动态创建者自己的 user_id
        # action.user 是动态的创建者
        if action.user:
            # print(f"[DEBUG] 原创动态的用户存在: user_id={action.user.id}, nickname={action.user.nickname}")
            
            # 放宽条件：不再严格要求 target_id == user.id
            # 因为可能存在历史数据或创建时的逻辑问题
            details['target_title'] = None 
            details['target_slug'] = None
            details['target_type'] = 'user' # 与数据库及查询逻辑一致
            
            # 确保返回必要字段
            # print(f"[DEBUG] 原创动态处理完成，返回详情信息: action_id={details['action_id']}, sharer_id={details['sharer_id']}, target_type={details['target_type']}")
            # print(f"[DEBUG] 原创动态的内容: {details['share_comment']}")
            # print(f"[DEBUG] 原创动态的图片数量: {len(details['images'])}")
        else:
            # 数据不一致或异常情况
            print(f"[DEBUG] 原创动态异常: action.user 为 None")
            current_app.logger.warning(
                f"Data inconsistency for UserAction ID {action.id}: "
                f"target_type is 'user', but action.user is None."
            )
            details['target_title'] = "[动态信息异常]"
            details['target_type'] = 'user' # 仍然保持 user 类型，避免前端判断错误
            details['target_id'] = None # 清除 target_id，避免前端误用
    # --- 结束修改 --- 

    return details
# --- 结束新增 --- 

# --- 新增一个辅助函数来构建动态详情，使用预加载的数据 ---
def build_action_detail_with_preloaded_data(action_obj, current_user_id_from_request, preloaded_targets, user_interaction_maps):
    if not action_obj:
        return None

    sharer = action_obj.user
    sharer_username = sharer.nickname if sharer and sharer.nickname else (sharer.email.split('@')[0] if sharer and sharer.email else '未知用户')
    sharer_avatar_url = sharer.avatar if sharer else None
    sharer_id = sharer.id if sharer else None

    # --- 图片处理 - 添加调试日志 ---
    images = []
    if hasattr(action_obj, 'images') and action_obj.images:
        try:
            import json
            if isinstance(action_obj.images, str):
                images = json.loads(action_obj.images)
                current_app.logger.debug(f"[DEBUG] 动态ID {action_obj.id} 解析到 {len(images)} 张字符串格式的图片")
            elif isinstance(action_obj.images, list):
                images = action_obj.images
                current_app.logger.debug(f"[DEBUG] 动态ID {action_obj.id} 直接使用 {len(images)} 张列表格式的图片")
        except Exception as e:
            current_app.logger.error(f"Error parsing images JSON for action {action_obj.id}: {e}")
    current_app.logger.debug(f"[DEBUG] 动态ID {action_obj.id} 最终图片列表长度: {len(images)}")
    # --- 图片处理结束 ---

    # 交互计数仍然是实时计算，这是一个待优化的点 (应该由 UserAction 模型直接提供)
    likes_count = UserAction.query.filter_by(target_id=action_obj.id, target_type='action', action_type='like').count()
    collects_count = UserAction.query.filter_by(target_id=action_obj.id, target_type='action', action_type='collect').count()
    reposts_count = UserAction.query.filter_by(action_type='share', target_type='action', target_id=action_obj.id).count()
    # 评论数也应该是预存的，这里暂时也实时计算 (或者从 UserAction.comments_count 如果存在)
    # 假设 ActionComment 模型存在且 UserAction 有 comments_count 字段
    comments_count = getattr(action_obj, 'comments_count', 0) # 优先使用预存字段
    if not comments_count and hasattr(action_obj, 'id'): # 如果没有，尝试计算 (这应该避免)
        try:
            from app.models import ActionComment # 确保 ActionComment 被导入
            comments_count = ActionComment.query.filter_by(action_id=action_obj.id, is_deleted=False).count()
        except Exception: # pylint: disable=broad-except
            comments_count = 0 # 无法计算则为0

    details = {
        'action_id': action_obj.id,
        'share_comment': action_obj.content,
        'shared_at': action_obj.created_at.isoformat() + 'Z',
        'sharer_id': sharer_id,
        'sharer_username': sharer_username,
        'sharer_avatar_url': sharer_avatar_url,
        'is_repost': action_obj.target_type == 'action',
        'target_type': action_obj.target_type,
        'target_title': None,
        'target_slug': None,
        'target_id': action_obj.target_id,
        'original_action': None,
        'likes_count': likes_count,
        'collects_count': collects_count,
        'reposts_count': reposts_count,
        'comments_count': comments_count, # 新增评论数
        'is_liked_by_current_user': False,
        'is_collected_by_current_user': False,
        'like_action_id': None,
        'collect_action_id': None,
        'images': images # 该动态自己的图片
    }

    if current_user_id_from_request:
        if action_obj.id in user_interaction_maps['likes']:
            details['is_liked_by_current_user'] = True
            details['like_action_id'] = user_interaction_maps['likes'][action_obj.id]
        if action_obj.id in user_interaction_maps['collects']:
            details['is_collected_by_current_user'] = True
            details['collect_action_id'] = user_interaction_maps['collects'][action_obj.id]

    # 处理目标内容
    current_target_action = action_obj # 用于获取目标内容
    target_is_deleted = False

    if action_obj.target_type == 'action':
        if action_obj.original_action:
            current_target_action = action_obj.original_action # 递归构建原始动态时使用原始动态作为目标
            # 递归构建 original_action
            details['original_action'] = build_action_detail_with_preloaded_data(
                action_obj.original_action, 
                current_user_id_from_request, 
                preloaded_targets, 
                user_interaction_maps # 交互状态是针对顶层 action_obj 的，内部的原始 action 沿用外部的map
            )
            # 对于转发，顶层卡片显示的是被转发的动态的信息
            # 因此，我们需要用 current_target_action (即 original_action) 的信息来填充顶层的 target_title 等
        else: # original_action 不存在，可能已被物理删除
            target_is_deleted = True
            details['target_title'] = "[内容已删除]"
            details['target_type'] = 'deleted' # 标记为已删除
            details['target_id'] = None


    # 根据 current_target_action (可能是 action_obj 本身或其 original_action) 的 target_type 填充 target 信息
    if not target_is_deleted: # 仅当目标未被标记为删除时才尝试获取
        if current_target_action.target_type == 'article':
            target_content = preloaded_targets['articles'].get(current_target_action.target_id)
            if target_content:
                details['target_title'] = target_content.title
                details['target_slug'] = target_content.slug
                details['target_type'] = 'article' 
                details['target_id'] = target_content.id # 使用实际目标ID
            else:
                details['target_title'] = "[文章已删除]"
                details['target_type'] = 'deleted'
                details['target_id'] = None
        elif current_target_action.target_type == 'post':
            target_content = preloaded_targets['posts'].get(current_target_action.target_id)
            if target_content:
                details['target_title'] = target_content.title
                details['target_slug'] = target_content.slug
                details['target_type'] = 'post'
                details['target_id'] = target_content.id
            else:
                details['target_title'] = "[帖子已删除]"
                details['target_type'] = 'deleted'
                details['target_id'] = None
        elif current_target_action.target_type == 'tool':
            target_content = preloaded_targets['tools'].get(current_target_action.target_id)
            if target_content:
                details['target_title'] = target_content.name
                details['target_slug'] = target_content.slug
                details['target_type'] = 'tool'
                details['target_id'] = target_content.id
            else:
                details['target_title'] = "[工具已删除]"
                details['target_type'] = 'deleted'
                details['target_id'] = None
        elif current_target_action.target_type == 'user': # 原创状态
            details['target_type'] = 'user'
            # 原创状态没有传统意义上的 title/slug，target_id 是用户自己
            details['target_id'] = current_target_action.user_id 
        # 如果是转发 (action_obj.target_type == 'action') 并且 original_action 有效，
        # 上面的 current_target_action.target_type 已经是 original_action 的 target_type，
        # 所以这里不需要额外的处理 for action_obj.target_type == 'action'

    return details

# --- 结束新增辅助函数 ---

# --- 修改：获取分享动态列表 (包括直接分享和转发)，并包含嵌套信息 --- 
@dynamics_bp.route('/shares', methods=['GET'])
@limiter.exempt  # 完全禁用速率限制，因为这是网站核心功能
def get_share_dynamics():
    """获取最新的分享动态列表，递归包含转发的原始信息"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 10, type=int)
    
    # --- 新增：尝试获取当前用户ID（即使是可选的） ---
    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        if user_identity:
            # 与 fetch_action_details 中保持一致的处理方式
            if isinstance(user_identity, dict):
                current_user_id = user_identity.get('id')
            elif isinstance(user_identity, (int, str)):
                current_user_id = int(user_identity)
    except Exception as e:
        current_app.logger.info(f"JWT optional verification failed in get_share_dynamics: {e}")
    # --- 结束新增 ---
    
    try:
        top_level_actions_query = db.session.query(UserAction.id)\
            .filter(
                UserAction.action_type == 'share',
                UserAction.target_type.in_(['article', 'post', 'action']) # 包含 post 类型
            )\
            .order_by(desc(UserAction.created_at))
        
        paginated_action_ids = top_level_actions_query.paginate(page=page, per_page=per_page, error_out=False)
        
        results = []
        for action_id_tuple in paginated_action_ids.items:
            action_id = action_id_tuple[0]
            # --- 修改：将获取到的用户ID传递给 fetch_action_details --- 
            full_details = fetch_action_details(action_id, current_user_id)
            if full_details:
                results.append(full_details)
            
        return jsonify({
            'dynamics': results,
            'total': paginated_action_ids.total,
            'page': page,
            'pages': paginated_action_ids.pages,
            'limit': per_page # 保持返回 limit
        })

    except Exception as e:
        import traceback
        current_app.logger.error(f"Error fetching share dynamics: {e}") 
        traceback.print_exc()
        return jsonify({"error": "获取分享动态失败"}), 500

# --- 新增：获取组合动态 Feed (原创 + 分享) --- 
@dynamics_bp.route('/feed', methods=['GET'])
@limiter.exempt
def get_combined_feed():
    """获取最新的动态 Feed，包括原创状态和分享动态"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 10, type=int)
    
    current_user_id = None
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        if user_identity:
            if isinstance(user_identity, dict):
                current_user_id = user_identity.get('id')
            elif isinstance(user_identity, (int, str)):
                current_user_id = int(user_identity)
    except Exception as e:
        current_app.logger.info(f"JWT optional verification failed in get_combined_feed: {e}")

    try:
        combined_actions_query = db.session.query(UserAction.id)\
            .filter(
                db.or_(
                    db.and_( # 分享的条件
                        UserAction.action_type == 'share',
                        UserAction.target_type.in_(['article', 'post', 'action', 'tool'])
                    ),
                    db.and_( # 原创状态的条件
                        UserAction.action_type == 'create_status',
                        UserAction.target_type == 'user'
                    )
                )
            )\
            .filter(UserAction.is_deleted == False)\
            .order_by(desc(UserAction.created_at))
        
        paginated_action_ids_tuples = combined_actions_query.paginate(page=page, per_page=per_page, error_out=False)
        
        action_ids = [item[0] for item in paginated_action_ids_tuples.items]
        
        results = []
        if not action_ids:
            return jsonify({
                'dynamics': [],
                'total': 0,
                'page': page,
                'pages': 0,
                'limit': per_page
            })

        # 1. 批量获取 UserAction 对象并预加载 user
        # 为了保持原始顺序 (order_by created_at desc)，我们先获取ID，再用ID查询并保持顺序
        actions_list = UserAction.query.filter(UserAction.id.in_(action_ids)) \
                                  .options(joinedload(UserAction.user), 
                                           joinedload(UserAction.original_action).options(joinedload(UserAction.user))) \
                                  .all()
        actions_map = {action.id: action for action in actions_list}
        # 按照 paginated_action_ids (action_ids) 的顺序重新组织
        sorted_actions = [actions_map[action_id] for action_id in action_ids if action_id in actions_map]

        # 2. 批量获取目标内容详情 (Article, Post, Tool)
        article_target_ids = []
        post_target_ids = []
        tool_target_ids = []
        # 也收集原始动态的目标ID (如果被转发的动态其目标是 article/post/tool)
        original_article_target_ids = []
        original_post_target_ids = []
        original_tool_target_ids = []

        for action_obj in sorted_actions:
            if action_obj.target_type == 'article':
                article_target_ids.append(action_obj.target_id)
            elif action_obj.target_type == 'post':
                post_target_ids.append(action_obj.target_id)
            elif action_obj.target_type == 'tool':
                tool_target_ids.append(action_obj.target_id)
            elif action_obj.target_type == 'action' and action_obj.original_action:
                # 如果是转发，检查原始动态的目标类型
                original = action_obj.original_action
                if original.target_type == 'article':
                    original_article_target_ids.append(original.target_id)
                elif original.target_type == 'post':
                    original_post_target_ids.append(original.target_id)
                elif original.target_type == 'tool':
                    original_tool_target_ids.append(original.target_id)
        
        # 去重
        article_ids_to_fetch = list(set(article_target_ids + original_article_target_ids))
        post_ids_to_fetch = list(set(post_target_ids + original_post_target_ids))
        tool_ids_to_fetch = list(set(tool_target_ids + original_tool_target_ids))

        articles_map = {article.id: article for article in Article.query.filter(Article.id.in_(article_ids_to_fetch)).all()} if article_ids_to_fetch else {}
        posts_map = {post.id: post for post in Post.query.filter(Post.id.in_(post_ids_to_fetch)).all()} if post_ids_to_fetch else {}
        tools_map = {tool.id: tool for tool in Tool.query.filter(Tool.id.in_(tool_ids_to_fetch)).all()} if tool_ids_to_fetch else {}
        
        preloaded_targets = {
            'articles': articles_map,
            'posts': posts_map,
            'tools': tools_map
        }

        # 3. 批量获取当前用户的交互状态 (对 UserAction 本身的点赞/收藏)
        user_likes_on_actions = {} # key: action_id, value: like_action_id
        user_collects_on_actions = {} # key: action_id, value: collect_action_id
        if current_user_id and action_ids: # 确保有用户和要检查的action
            user_interactions = UserAction.query.filter(
                UserAction.user_id == current_user_id,
                UserAction.target_type == 'action', # 交互的目标是另一个UserAction
                UserAction.target_id.in_(action_ids), # target_id 是被交互的UserAction的ID
                UserAction.action_type.in_(['like', 'collect'])
            ).all()
            for interaction in user_interactions:
                if interaction.action_type == 'like':
                    user_likes_on_actions[interaction.target_id] = interaction.id
                elif interaction.action_type == 'collect':
                    user_collects_on_actions[interaction.target_id] = interaction.id
        
        user_interaction_maps = {
            'likes': user_likes_on_actions,
            'collects': user_collects_on_actions
        }

        # 4. 遍历 sorted_actions 并调用 fetch_action_details (或内联逻辑)
        for action_obj in sorted_actions:
            # full_details = fetch_action_details(action_obj.id, current_user_id) # 旧方式
            # TODO: 修改 fetch_action_details 或在此处直接组装 full_details
            # 现在 fetch_action_details 仍然会做很多内部查询，下一步是修改它
            # 暂时保持原样，看应用了这个修改后效果如何，下一步再精细化 fetch_action_details
            # 或者，我们可以先尝试在这里直接组装，而不是修改 fetch_action_details
            
            # 尝试在此处直接组装，模仿 fetch_action_details 的逻辑，但使用预加载的数据
            detail = build_action_detail_with_preloaded_data(
                action_obj, 
                current_user_id, 
                preloaded_targets, 
                user_interaction_maps
            )
            if detail:
                results.append(detail)
            
        return jsonify({
            'dynamics': results,
            'total': paginated_action_ids_tuples.total,
            'page': page,
            'pages': paginated_action_ids_tuples.pages,
            'limit': per_page
        })

    except Exception as e:
        import traceback
        current_app.logger.error(f"Error fetching combined feed: {e}") 
        traceback.print_exc()
        return jsonify({"error": "获取动态 Feed 失败"}), 500

@dynamics_bp.route('/feed/status', methods=['GET'])
@limiter.exempt
def get_combined_feed_status():
    """
    获取最新的动态 Feed (原创 + 分享) 的新动态数量。
    查询参数:
        since_id: 从哪个 UserAction ID 之后开始计数，可选。
    """
    since_id = request.args.get('since_id', type=int)
    
    try:
        query = db.session.query(UserAction.id).filter(
            db.or_(
                db.and_(
                    UserAction.action_type == 'share',
                    UserAction.target_type.in_(['article', 'post', 'action', 'tool'])
                ),
                db.and_(
                    UserAction.action_type == 'create_status',
                    UserAction.target_type == 'user'
                )
            )
        )

        if since_id is not None:
            # 确保 since_id 对应的 action 存在，以防错误 ID 导致查询所有
            last_action = db.session.get(UserAction, since_id)
            if last_action:
                 query = query.filter(UserAction.id > since_id)
            else:
                # 如果 since_id 无效 (例如对应的动态被删了)，则认为没有新动态
                return jsonify({'new_count': 0})
            # else: 如果 since_id 无效，则返回所有新动态计数，或者也可以返回0/错误，取决于产品需求
            #     return jsonify({'new_count': 0}), 200


        new_count = query.count()
        
        return jsonify({'new_count': new_count})

    except Exception as e:
        current_app.logger.error(f"Error in get_combined_feed_status: {e}")
        return jsonify({"error": "获取动态 Feed 状态失败"}), 500

# --- 获取单个动态详情的 API 路由 ---
@dynamics_bp.route('/<int:action_id>', methods=['GET'])
@limiter.exempt
def get_dynamic_details(action_id):
    """
    获取单个动态的详细信息
    
    Args:
        action_id (int): 要获取详情的动态ID
        
    Returns:
        JSON: 包含动态详细信息的JSON响应
    """
    current_app.logger.info(f"获取动态详情 ID: {action_id}")
    
    # 检查请求中是否有 JWT Token，如有则获取用户ID，否则为None
    current_user_id = None
    try:
        # 验证 JWT 但不强制要求存在
        verify_jwt_in_request(optional=True)
        current_user_id = get_jwt_identity()
    except Exception as e:
        current_app.logger.warning(f"JWT验证出错: {e}")
        # 继续处理，但当前用户ID为None
        
    # 获取动态详情
    action_details = fetch_action_details(action_id, current_user_id)
    
    if not action_details:
        return jsonify({
            'success': False,
            'error': '未找到指定动态'
        }), 404
    
    return jsonify({
        'success': True,
        'action': action_details
    }), 200

# --- 你可能还需要一个 GET 路由来获取动态列表供首页使用 --- 
# 示例：
# @dynamics_bp.route('', methods=['GET'])
# def get_dynamics():
#     # 这里需要实现获取动态列表的逻辑，例如按时间排序、分页等
#     # 可能还需要考虑只获取关注用户的动态（如果实现了关注功能）
#     page = request.args.get('page', 1, type=int)
#     per_page = request.args.get('limit', 10, type=int)
#     
#     # 简化示例：获取所有动态按时间倒序
#     dynamics_query = Dynamic.query.order_by(Dynamic.created_at.desc())
#     paginated_dynamics = dynamics_query.paginate(page=page, per_page=per_page, error_out=False)
#     
#     return jsonify({
#         'dynamics': [d.to_dict() for d in paginated_dynamics.items],
#         'total': paginated_dynamics.total,
#         'page': page,
#         'pages': paginated_dynamics.pages
#     }) 