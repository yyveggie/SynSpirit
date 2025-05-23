"""
此模块定义了与帖子 (Post) 相关的 API 端点。
帖子通常与一个主题 (Topic) 关联。

主要功能:
- 帖子的 CRUD 操作 (创建、读取、更新、删除)。
- 按 ID 或 slug 获取帖子详情，包含作者、主题信息和用户交互状态 (点赞/收藏)。
- 获取所有帖子列表 (可能主要用于后台)。
- 处理帖子的点赞/取消点赞、收藏/取消收藏。
- 处理帖子评论 (PostComment 模型) 的获取、创建、回复和删除。
- 包含 slug 生成辅助函数。

依赖模型: Post, User, Topic, UserAction, PostComment
使用 Flask 蓝图: posts_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request, current_app, url_for, redirect
from app import db
from app.models import Post, User, Topic, UserAction, PostComment
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from sqlalchemy.exc import IntegrityError
import re
from sqlalchemy.orm import joinedload, contains_eager
import time
import unicodedata
from sqlalchemy import func, select, literal, desc, or_, and_
from app.models.post_comment import post_comment_likes
import logging
from app.utils.slug_generator import generate_unique_slug
from werkzeug.utils import secure_filename
import os
import uuid
# --- 新增：导入 COS 存储工具 --- 
from app.utils.cos_storage import cos_storage 
# --- 结束新增 ---
from collections import defaultdict # 需要导入
# --- 新增：导入 Celery 任务 --- 
from app.tasks import update_post_view_count, update_post_counts, update_post_comment_likes_count, generate_ai_post_comment_reply_task
# --- 结束新增 ---

# 创建蓝图
posts_bp = Blueprint('posts_bp', __name__)

# 设置日志
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG)

# --- 新增：从 articles.py 复制过来的 slugify 函数 --- 
def slugify(value, allow_unicode=True):
    """
    Convert to ASCII if 'allow_unicode' is False. Convert spaces or repeated
    dashes to single dashes. Remove characters that aren't alphanumerics,
    underscores, or hyphens. Convert to lowercase. Also strip leading and
    trailing whitespace, dashes, and underscores.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize('NFKC', value)
    else:
        value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    # 修改：使用 post- 前缀，与 article 区分
    prefix = "post-"
    timestamp = str(int(time.time() * 1000))[-6:] # last 6 digits of ms timestamp
    slug_base = re.sub(r'[-\s]+', '-', value).strip('-_')
    # Ensure slug is not empty after replacements
    if not slug_base:
        slug = f"{prefix}{timestamp}"
    else:
        # Append timestamp for uniqueness, limit total length if needed
        slug = f"{slug_base[:50]}-{timestamp}" # Limit base slug length
    return slug
# --- 结束新增 --- 

# --- 帖子 CRUD 路由 ---

# --- get_posts_by_topic_slug 函数已被移动到 topics.py --- 

# --- 新增：获取单个帖子详情 API ---
@posts_bp.route('/<int:post_id>', methods=['GET'])
def get_post_detail(post_id):
    """获取单个帖子的详细信息，包括作者和主题，并附加用户交互状态"""
    try:
        # 查询帖子，同时预加载作者和主题信息
        post = Post.query.options(
            joinedload(Post.author),
            joinedload(Post.topic)
        ).get(post_id)

        if not post:
            return jsonify({'error': '帖子未找到'}), 404

        # --- 检查用户交互状态 (点赞/收藏) ---
        is_liked = False
        is_collected = False
        like_action_id = None
        collect_action_id = None
        user_id = None
        
        try:
            # 尝试验证可选的 JWT
            verify_jwt_in_request(optional=True)
            user_identity = get_jwt_identity() 
            if user_identity:
                # 假设 get_jwt_identity() 返回的是用户 ID (int 或 str)
                user_id = int(user_identity) 
        except Exception as e:
            current_app.logger.info(f"获取帖子 {post_id} 详情时 JWT 验证失败或用户未登录: {e}")
            pass # 用户未登录或 token 无效，继续匿名访问

        if user_id:
            # 查询点赞状态
            like_action = UserAction.query.filter_by(
                user_id=user_id, 
                action_type='like', 
                target_type='post', 
                target_id=post.id
            ).first()
            if like_action:
                is_liked = True
                like_action_id = like_action.id
            
            # 查询收藏状态
            collect_action = UserAction.query.filter_by(
                user_id=user_id, 
                action_type='collect', 
                target_type='post', 
                target_id=post.id
            ).first()
            if collect_action:
                is_collected = True
                collect_action_id = collect_action.id
        # --- 结束检查用户交互状态 ---

        # --- 修改：异步更新浏览量 --- 
        # try:
        #     post.view_count = (post.view_count or 0) + 1
        #     db.session.commit()
        # except Exception as e:
        #     db.session.rollback()
        #     current_app.logger.error(f"更新帖子 {post_id} 浏览量失败: {e}")
        try:
            update_post_view_count.delay(post.id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue view count update task for post {post.id}: {e}")
        # --- 结束修改 ---

        # 序列化帖子数据，包含交互状态
        post_dict = post.to_dict(include_content=True) # 详情页需要包含内容
        post_dict['is_liked'] = is_liked
        post_dict['is_collected'] = is_collected
        post_dict['like_action_id'] = like_action_id
        post_dict['collect_action_id'] = collect_action_id
        
        return jsonify(post_dict)

    except Exception as e:
        current_app.logger.error(f"获取帖子 {post_id} 详情失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': '获取帖子详情失败'}), 500

# --- 新增：按 Slug 获取帖子详情 API --- 
@posts_bp.route('/slug/<string:slug>', methods=['GET'])
def get_post_by_slug(slug):
    """通过 slug 获取单个帖子的详细信息，包括作者和主题，并附加用户交互状态"""
    try:
        # 查询帖子，同时预加载作者和主题信息
        post = Post.query.filter_by(slug=slug).options(
            joinedload(Post.author),
            joinedload(Post.topic)
        ).first()

        if not post:
            return jsonify({'error': '帖子未找到'}), 404

        # --- 检查用户交互状态 (与 get_post_detail 逻辑相同) ---
        is_liked = False
        is_collected = False
        like_action_id = None
        collect_action_id = None
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_identity = get_jwt_identity() 
            if user_identity:
                user_id = int(user_identity) 
        except Exception as e:
            pass # 继续匿名访问
        if user_id:
            like_action = UserAction.query.filter_by(user_id=user_id, action_type='like', target_type='post', target_id=post.id).first()
            if like_action:
                is_liked = True
                like_action_id = like_action.id
            collect_action = UserAction.query.filter_by(user_id=user_id, action_type='collect', target_type='post', target_id=post.id).first()
            if collect_action:
                is_collected = True
                collect_action_id = collect_action.id
        # --- 结束检查用户交互状态 ---

        # --- 修改：异步更新浏览量 --- 
        # try:
        #     post.view_count = (post.view_count or 0) + 1
        #     db.session.commit()
        # except Exception as e:
        #     db.session.rollback()
        #     current_app.logger.error(f"更新帖子 {post.slug} 浏览量失败: {e}")
        try:
            update_post_view_count.delay(post.id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue view count update task for post {post.id} (slug: {slug}): {e}")
        # --- 结束修改 ---

        # --- 修改：序列化帖子数据，交互状态和计数从模型字段获取 ---
        post_dict = post.to_dict(include_content=True)
        post_dict['is_liked'] = is_liked
        post_dict['is_collected'] = is_collected
        post_dict['like_action_id'] = like_action_id
        post_dict['collect_action_id'] = collect_action_id
        # shares_count, likes_count, collects_count 现在由 post.to_dict() 提供
        # --- 结束修改 ---
        
        return jsonify(post_dict)

    except Exception as e:
        current_app.logger.error(f"获取帖子 (slug: {slug}) 详情失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': '获取帖子详情失败'}), 500
# --- 结束新增 ---

# 获取帖子列表 (所有帖子 - 这个路由现在可能不太需要了，或者保留用于后台管理)
@posts_bp.route('/', methods=['GET'])
def get_posts():
    try:
        # 这里可以添加按 topic_id 过滤的逻辑，如果需要一个通用获取帖子的接口
        # topic_id = request.args.get('topic_id', type=int)
        # query = Post.query
        # if topic_id:
        #     query = query.filter_by(topic_id=topic_id)
        
        posts = Post.query.order_by(Post.created_at.desc()).all()
        return jsonify([post.to_dict(include_content=False) for post in posts]) # 默认不包含内容
    except Exception as e:
        current_app.logger.error(f"Error fetching posts: {e}")
        return jsonify({'error': '获取帖子列表失败'}), 500

# 创建新帖子
@posts_bp.route('/', methods=['POST'])
@jwt_required()
def create_post():
    """创建新帖子 (支持 multipart/form-data, 图片上传至 COS)"""
    current_user_id = get_jwt_identity()
    
    if not request.form:
         return jsonify({'error': 'No form data provided'}), 400

    title = request.form.get('title')
    content = request.form.get('content')
    topic_id_str = request.form.get('topic_id')
    publication_status = 'published'
    access_level = request.form.get('access_level', 'public')
    allow_comments_str = request.form.get('allow_comments', 'true')

    if not title or not title.strip():
        return jsonify({'error': 'Title is required'}), 400
    if not content or not content.strip():
        return jsonify({'error': 'Content is required'}), 400

    topic_id = None
    topic = None

    if topic_id_str:
        try:
            topic_id = int(topic_id_str)
            if topic_id <= 0: raise ValueError()
            topic = Topic.query.get(topic_id)
            if not topic:
                return jsonify({'error': f'主题 ID {topic_id} 不存在'}), 404
        except (ValueError, TypeError):
             return jsonify({'error': '无效的主题 ID 格式'}), 400
    
    if not topic:
        return jsonify({'error': '未能找到有效的主题'}), 400
            
    # --- 修改：处理文件上传，使用 COS --- 
    cover_image_url = None
    if 'cover_image' in request.files:
        file = request.files['cover_image']
        if file and file.filename:
            # 简单的文件类型检查 (可以根据需要增强)
            allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'}
            if '.' not in file.filename or file.filename.rsplit('.', 1)[1].lower() not in allowed_extensions:
                return jsonify({'error': '无效的图片文件类型'}), 400
            
            try:
                # 使用 cos_storage 上传，指定子文件夹为 'post_covers'
                cover_image_url = cos_storage.upload_file(file, subfolder='post_covers')
                if not cover_image_url:
                    # 如果上传失败 (cos_storage 返回 None 或空字符串)
                    raise Exception("COS upload returned an empty URL.")
                current_app.logger.info(f"Post cover image uploaded to COS: {cover_image_url}")
            except Exception as e:
                current_app.logger.error(f"Failed to upload post cover image to COS: {e}")
                # 根据策略决定是否回退到本地存储或直接报错
                # 这里我们选择报错
                return jsonify({'error': '上传封面图片到云存储失败'}), 500
    # --- 结束文件上传修改 ---
            
    try:
        post_title = title.strip()
        post_slug = generate_unique_slug(post_title, Post)
        
        # 创建 Post 对象，使用 cover_image_url (可能是 None 或 COS URL)
        new_post = Post(
            title=post_title,
            content=content,
            user_id=current_user_id,
            slug=post_slug,
            cover_image=cover_image_url, # 使用 COS URL 或 None
            topic_id=topic.id,
            publication_status=publication_status,
            access_level=access_level,
            allow_comments=allow_comments_str.lower() == 'true'
        )

        db.session.add(new_post)
        db.session.commit()
        
        result = new_post.to_dict()
        
        # 创建动态的逻辑可以保持，但触发条件可能需要根据 publication_status 调整
        if new_post.publication_status == 'published':
            try:
                create_action = UserAction(
                    user_id=current_user_id,
                    action_type='create', 
                    target_type='post',
                    target_id=new_post.id
                )
                db.session.add(create_action)
                db.session.commit()
            except Exception as action_error:
                current_app.logger.error(f"Failed to create action for post: {str(action_error)}")
        
        # --- 新增：异步更新帖子计数 (虽然新建时通常为0，但保持一致性) ---
        try:
            update_post_counts.delay(new_post.id)
        except Exception as e:
             current_app.logger.error(f"Failed to queue counts update task for new post {new_post.id}: {e}")
        # --- 结束新增 ---

        return jsonify({
            'message': 'Post created successfully',
            'post': result 
        }), 201
        
    except IntegrityError as e:
        db.session.rollback()
        current_app.logger.error(f"Database integrity error creating post: {e}")
        if 'slug' in str(e).lower():
             return jsonify({'error': '生成唯一的帖子标识符失败，请稍后重试或修改标题。'}), 500
        return jsonify({'error': f'创建帖子时数据库错误: {str(e)}'}), 500
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating post: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'创建帖子失败: {str(e)}'}), 500

# 更新帖子
@posts_bp.route('/<int:post_id>', methods=['PUT'])
@jwt_required()
def update_post(post_id):
    user_id = get_jwt_identity()
    post = Post.query.get_or_404(post_id)

    # 权限检查：只有作者能修改
    if post.user_id != user_id:
        return jsonify({'error': '无权修改此帖子'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少更新数据'}), 400

    # 逐个更新字段
    post.title = data.get('title', post.title)
    post.content = data.get('content', post.content)
    
    # 处理封面图片
    if data.get('remove_cover_image'):
        post.cover_image = None
    elif 'cover_image' in data and data['cover_image']:
        post.cover_image = data['cover_image']
    
    # --- 处理封面图更新 --- 
    if 'cover_image' in request.files:
        try:
            # 可以选择删除旧的 COS 图片，如果 post.cover_image 存在且是 COS URL
            if post.cover_image and post.cover_image.startswith(cos_storage.get_base_url()):
                old_key = post.cover_image.replace(cos_storage.get_base_url() + '/', '')
                cos_storage.delete_file(old_key)

            file = request.files['cover_image']
            if file and file.filename:
                # 使用uuid生成唯一文件名，保留原始扩展名
                extension = os.path.splitext(secure_filename(file.filename))[1]
                unique_filename = f"post_cover_{uuid.uuid4()}{extension}"
                
                # 指定 COS 中的存储路径，例如 posts/covers/
                cos_path = f"posts/covers/{unique_filename}"
                
                # 上传文件到 COS
                new_cover_image_url = cos_storage.upload_file(file, cos_path)
                if new_cover_image_url:
                    post.cover_image = new_cover_image_url
                else:
                     return jsonify({'error': '更新封面图上传失败'}), 500
        except Exception as e:
            logger.error(f"更新帖子 {post_id} 封面图失败: {e}")
            return jsonify({'error': '处理更新封面图失败'}), 500
    # --- 结束封面图更新 --- 

    # --- 新增：确保更新时 publication_status 始终为 published ---
    post.publication_status = 'published'
    # --- 结束新增 ---

    try:
        db.session.commit()
        # --- 修改：更新帖子后也触发计数更新 (以防内容等影响) ---
        try:
            update_post_counts.delay(post.id)
        except Exception as e:
             current_app.logger.error(f"Failed to queue counts update task for updated post {post.id}: {e}")
        # --- 结束修改 ---
        return jsonify(post.to_dict(include_content=True))
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"更新帖子 {post_id} 失败: {e}")
        return jsonify({'error': f'更新帖子失败: {str(e)}'}), 500

# 删除帖子
@posts_bp.route('/<int:post_id>', methods=['DELETE'])
@jwt_required()
def delete_post(post_id):
    """删除帖子"""
    try:
        post = Post.query.get(post_id)
        if not post:
            return jsonify({'error': '帖子未找到'}), 404

        current_user_id = get_jwt_identity()
        # 确保是帖子的作者或管理员才能删除
        # (需要一个 is_admin 辅助函数或从 User 模型获取管理员状态)
        # 简化：假设 current_user_id 直接是整数ID
        if post.user_id != current_user_id: # and not is_admin(current_user_id):
         return jsonify({'error': '无权删除此帖子'}), 403

        # --- 新增：标记相关的 UserAction --- 
        # actions_to_update = UserAction.query.filter_by(target_type='post', target_id=post.id).all()
        # for action in actions_to_update:
        #     action.original_content_deleted = True # 移除这一行
        # current_app.logger.info(f"Marked {len(actions_to_update)} UserActions' original_content_deleted to True for post {post.id}")
        # --- 结束新增 ---

        # --- 新增：删除帖子时，尝试删除COS上的封面图 --- 
        if post.cover_image:
            # 假设 post.cover_image 存储的是完整的COS URL或可被删除服务识别的路径
            if cos_storage.delete_file(post.cover_image):
                current_app.logger.info(f"帖子 {post.id} 的封面图片 {post.cover_image} 已从COS删除")
            else:
                current_app.logger.warning(f"尝试从COS删除帖子 {post.id} 的封面图片 {post.cover_image} 失败或文件不存在")
        # --- 结束新增 ---
        
        # 在删除帖子之前，先刷新会话，确保标记 UserAction 的更改被提交（如果上面标记逻辑恢复的话）
        # db.session.flush() # 如果上面标记逻辑恢复，可以取消注释这行

        db.session.delete(post)
        db.session.commit()
        return jsonify({'message': '帖子已成功删除'}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"删除帖子 {post_id} 失败: {e}")
        return jsonify({'error': '删除帖子失败'}), 500

# --- 新增：点赞/取消点赞帖子路由 --- 
@posts_bp.route('/<int:post_id>/like', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_like_post(post_id):
    """点赞或取消点赞指定的帖子"""
    user_id = get_jwt_identity()
    post = Post.query.get_or_404(post_id)

    existing_action = UserAction.query.filter_by(
        user_id=user_id,
        action_type='like',
        target_type='post',
        target_id=post_id
    ).first()

    if request.method == 'POST':
        # 点赞
        if existing_action:
            # 已经点赞，返回成功，同时返回当前计数
            current_likes_count = UserAction.query.filter_by(
                action_type='like',
                target_type='post', 
                target_id=post_id,
                is_deleted=False
            ).count()
            
            return jsonify({
                **existing_action.to_dict(),
                'target_likes_count': current_likes_count,
                'is_liked': True
            }), 200
        else:
            try:
                new_action = UserAction(
                    user_id=user_id,
                    action_type='like',
                    target_type='post',
                    target_id=post_id
                )
                db.session.add(new_action)
                db.session.commit()
                
                # --- 计算并返回最新计数 ---
                current_likes_count = UserAction.query.filter_by(
                    action_type='like',
                    target_type='post', 
                    target_id=post_id,
                    is_deleted=False
                ).count()
                
                # --- 新增：异步更新计数 ---
                try:
                    update_post_counts.delay(post_id)
                except Exception as e:
                    current_app.logger.error(f"Failed to queue counts update task after liking post {post_id}: {e}")
                # --- 结束新增 ---
                
                return jsonify({
                    **new_action.to_dict(),
                    'target_likes_count': current_likes_count,
                    'is_liked': True
                }), 201
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"点赞帖子 {post_id} 失败: {e}")
                return jsonify({'error': '点赞失败'}), 500
    elif request.method == 'DELETE':
        # 取消点赞
        if not existing_action:
            return jsonify({'error': '未找到点赞记录'}), 404
        else:
            try:
                # 保存action_id用于返回
                action_id = existing_action.id
                
                db.session.delete(existing_action)
                db.session.commit()
                
                # --- 计算最新计数 ---
                current_likes_count = UserAction.query.filter_by(
                    action_type='like',
                    target_type='post', 
                    target_id=post_id,
                    is_deleted=False
                ).count()
                
                # --- 新增：异步更新计数 ---
                try:
                    update_post_counts.delay(post_id)
                except Exception as e:
                    current_app.logger.error(f"Failed to queue counts update task after unliking post {post_id}: {e}")
                # --- 结束新增 ---
                
                return jsonify({
                    'message': '取消点赞成功',
                    'action_id': None,
                    'is_liked': False,
                    'target_likes_count': current_likes_count
                }), 200
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"取消点赞帖子 {post_id} 失败: {e}")
                return jsonify({'error': '取消点赞失败'}), 500

# --- 新增：收藏/取消收藏帖子路由 --- 
@posts_bp.route('/<int:post_id>/collect', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_collect_post(post_id):
    """收藏或取消收藏指定的帖子"""
    user_id = get_jwt_identity()
    post = Post.query.get_or_404(post_id)

    existing_action = UserAction.query.filter_by(
        user_id=user_id,
        action_type='collect',
        target_type='post',
        target_id=post_id
    ).first()

    if request.method == 'POST':
        # 收藏
        if existing_action:
            # 已经收藏，返回成功，同时返回当前计数
            current_collects_count = UserAction.query.filter_by(
                action_type='collect',
                target_type='post', 
                target_id=post_id,
                is_deleted=False
            ).count()
            
            return jsonify({
                **existing_action.to_dict(),
                'target_collects_count': current_collects_count,
                'is_collected': True
            }), 200
        else:
            try:
                new_action = UserAction(
                    user_id=user_id,
                    action_type='collect',
                    target_type='post',
                    target_id=post_id
                )
                db.session.add(new_action)
                db.session.commit()
                
                # --- 计算并返回最新计数 ---
                current_collects_count = UserAction.query.filter_by(
                    action_type='collect',
                    target_type='post', 
                    target_id=post_id,
                    is_deleted=False
                ).count()
                
                # --- 新增：异步更新计数 ---
                try:
                    update_post_counts.delay(post_id)
                except Exception as e:
                    current_app.logger.error(f"Failed to queue counts update task after collecting post {post_id}: {e}")
                # --- 结束新增 ---
                
                return jsonify({
                    **new_action.to_dict(),
                    'target_collects_count': current_collects_count,
                    'is_collected': True
                }), 201
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"收藏帖子 {post_id} 失败: {e}")
                return jsonify({'error': '收藏失败'}), 500
    elif request.method == 'DELETE':
        # 取消收藏
        if not existing_action:
            return jsonify({'error': '未找到收藏记录'}), 404
        else:
            try:
                # 保存action_id用于返回
                action_id = existing_action.id
                
                db.session.delete(existing_action)
                db.session.commit()
                
                # --- 计算最新计数 ---
                current_collects_count = UserAction.query.filter_by(
                    action_type='collect',
                    target_type='post', 
                    target_id=post_id,
                    is_deleted=False
                ).count()
                
                # --- 新增：异步更新计数 ---
                try:
                    update_post_counts.delay(post_id)
                except Exception as e:
                    current_app.logger.error(f"Failed to queue counts update task after uncollecting post {post_id}: {e}")
                # --- 结束新增 ---
                
                return jsonify({
                    'message': '取消收藏成功',
                    'action_id': None,
                    'is_collected': False,
                    'target_collects_count': current_collects_count
                }), 200
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"取消收藏帖子 {post_id} 失败: {e}")
                return jsonify({'error': '取消收藏失败'}), 500

# --- 新增：帖子评论相关路由 ---
@posts_bp.route('/<int:post_id>/comments', methods=['GET'])
def get_post_comments(post_id):
    """获取指定帖子的完整评论树 (包含嵌套回复和点赞状态)，支持排序。"""
    post = Post.query.get_or_404(post_id)

    user_id = None
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        if user_identity:
            user_id = int(user_identity) 
    except Exception:
        pass 

    sort_by = request.args.get('sort_by', 'latest') # Default to 'latest'

    try:
        # 1. 获取所有相关评论 (顶级和回复)，并应用初步排序
        all_comments_query = PostComment.query.filter(PostComment.post_id == post_id)

        if sort_by == 'popular':
            # 子查询计算点赞数
            likes_subquery = db.session.query(
                post_comment_likes.c.post_comment_id,
                func.count(post_comment_likes.c.user_id).label('likes_count')
            ).group_by(post_comment_likes.c.post_comment_id).subquery()

            all_comments_query = all_comments_query.outerjoin(
                likes_subquery, PostComment.id == likes_subquery.c.post_comment_id
            ).order_by(func.coalesce(likes_subquery.c.likes_count, 0).desc(), PostComment.created_at.desc())
        else: # 'latest' or default
            all_comments_query = all_comments_query.order_by(PostComment.created_at.desc())
        
        # 预加载 user 信息
        all_comments = all_comments_query.options(joinedload(PostComment.user)).all()

        # 2. 构建评论树 (两遍处理)
        comment_dict_map = {}
        # 第一遍：序列化所有评论并存入 map
        for comment in all_comments:
            # to_dict 将处理 is_liked_by_current_user 和 likes_count (来自模型字段或动态计算)
            # 传递 current_user_id 以便 to_dict 正确计算 is_liked_by_current_user
            comment_data = comment.to_dict(include_author=True, include_replies=True, current_user_id=user_id) 
            # 清空 to_dict 可能已填充的 replies，我们将手动构建树
            comment_data['replies'] = [] 
            comment_dict_map[comment.id] = comment_data

        # 第二遍：构建树结构
        nested_comments_tree = []
        for comment_id_map_key in comment_dict_map: # Use a different variable name to avoid confusion
            comment_data_item = comment_dict_map[comment_id_map_key]
            parent_id_val = comment_data_item.get('parent_id')
            if parent_id_val and parent_id_val in comment_dict_map:
                parent_comment_data = comment_dict_map[parent_id_val]
                # 确保 parent_comment_data['replies'] 是一个列表
                if not isinstance(parent_comment_data.get('replies'), list):
                    parent_comment_data['replies'] = []
                parent_comment_data['replies'].append(comment_data_item)
            else:
                nested_comments_tree.append(comment_data_item)
        
        # 3. 对每一层的 replies 列表进行排序 (在树构建完成后)
        def sort_replies_recursively(comments_list, sort_order):
            for c_data in comments_list: # Use a different variable name
                if c_data.get('replies') and isinstance(c_data['replies'], list):
                    if sort_order == 'popular':
                        # 使用 comment_data 中的 likes_count 和 created_at
                        c_data['replies'].sort(key=lambda r: (r.get('likes_count', 0), r.get('created_at', '')), reverse=True)
                    else: # 'latest'
                        c_data['replies'].sort(key=lambda r: r.get('created_at', ''), reverse=True)
                    sort_replies_recursively(c_data['replies'], sort_order)
        
        # 主列表排序 (nested_comments_tree) - 基于从 comment_data 中获取的值
        if sort_by == 'popular':
            nested_comments_tree.sort(key=lambda c_item: (c_item.get('likes_count', 0), c_item.get('created_at', '')), reverse=True)
        else: # 'latest' 
            # DB层面已经按 created_at desc() 排序了顶级评论的获取顺序，
            # 但这里用Python再排一次是为了确保一致性，特别是如果DB排序不完全符合预期或map迭代顺序不保证时
            nested_comments_tree.sort(key=lambda c_item: c_item.get('created_at', ''), reverse=True)

        # 递归排序所有子回复
        sort_replies_recursively(nested_comments_tree, sort_by)

        current_app.logger.info(f"[get_post_comments] Returning {len(nested_comments_tree)} top-level comments for post {post_id} sorted by {sort_by}")
        return jsonify({"comments": nested_comments_tree}) # 返回新的结构

    except Exception as e:
        current_app.logger.error(f"Error fetching or processing comments for post {post_id}: {e}", exc_info=True)
        return jsonify({'error': '获取或处理评论数据时出错'}), 500

@posts_bp.route('/<int:post_id>/comments', methods=['POST'])
@jwt_required()
def create_post_comment(post_id):
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({'error': '缺少评论内容'}), 400
    
    post = Post.query.get_or_404(post_id)
    user_id_from_jwt = get_jwt_identity()
    try:
        current_user_id_int = int(user_id_from_jwt)
    except ValueError:
        current_app.logger.error(f"[API_CREATE_POST_COMMENT] Invalid user_id format: {user_id_from_jwt}")
        return jsonify({'error': '无效的用户ID格式'}), 400

    content = data['content'].strip()
    # --- 新增：接收 mention_lynn 标记 ---
    mention_lynn = data.get('mention_lynn', False)

    if not content:
         return jsonify({'error': '评论内容不能为空'}), 400

    try:
        new_comment = PostComment(
            content=content, 
            user_id=current_user_id_int, 
            post_id=post_id
        )
        db.session.add(new_comment)
        db.session.commit() # 先提交用户评论以获取ID
        user_comment_id = new_comment.id

        # --- 新增：如果提及 Lynn，则异步调用 AI 回复任务 ---
        if mention_lynn:
            question_for_ai = ""
            try:
                mention_keyword = "@lynn"
                start_index = content.lower().find(mention_keyword)
                if start_index != -1:
                    question_for_ai = content[start_index + len(mention_keyword):].strip()
                
                if question_for_ai:
                    current_app.logger.info(f"[API_CREATE_POST_COMMENT] User PostComment ID {user_comment_id} - Queueing AI reply task for post {post_id}. Question: {question_for_ai}")
                    
                    # 获取帖子完整内容
                    post_title = post.title
                    post_content = post.content
                    
                    generate_ai_post_comment_reply_task.delay(
                        user_post_comment_id=user_comment_id,
                        post_id=post_id,
                        user_question=question_for_ai,
                        post_title=post_title,
                        post_content=post_content,  # 传递整篇帖子内容
                        original_user_id=current_user_id_int
                    )
                else:
                    current_app.logger.info(f"[API_CREATE_POST_COMMENT] User PostComment ID {user_comment_id} - Mention @lynn detected for post {post_id}, but no subsequent question found.")
            except Exception as task_e:
                current_app.logger.error(f"[API_CREATE_POST_COMMENT] User PostComment ID {user_comment_id} - Error queueing AI reply task for post {post_id}: {task_e}", exc_info=True)
        # --- 结束 AI 调用 ---

        try:
            update_post_counts.delay(post_id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue counts update task after creating comment for post {post_id}: {e}")

        db.session.refresh(new_comment)
        comment_dict = new_comment.to_dict(include_author=True, current_user_id=current_user_id_int)
        return jsonify(comment_dict), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"创建帖子 {post_id} 的评论失败: {e}")
        return jsonify({'error': '创建评论失败'}), 500

# --- 新增：创建帖子评论的回复 --- 
@posts_bp.route('/<int:post_id>/comments/<int:parent_id>/replies', methods=['POST'])
@jwt_required()
def create_post_comment_reply(post_id, parent_id):
    data = request.get_json()
    if not data or 'content' not in data:
        return jsonify({'error': '缺少评论内容'}), 400
    
    post = Post.query.get_or_404(post_id)
    parent_comment = PostComment.query.filter_by(id=parent_id, post_id=post_id).first_or_404()
    
    user_id_from_jwt = get_jwt_identity()
    try:
        current_user_id_int = int(user_id_from_jwt)
    except ValueError:
        current_app.logger.error(f"[API_CREATE_POST_REPLY] Invalid user_id format: {user_id_from_jwt}")
        return jsonify({'error': '无效的用户ID格式'}), 400
        
    content = data['content'].strip()
    # --- 新增：接收 mention_lynn 标记 ---
    mention_lynn = data.get('mention_lynn', False)

    if not content:
         return jsonify({'error': '评论内容不能为空'}), 400

    try:
        new_reply = PostComment(
            content=content, 
            user_id=current_user_id_int, 
            post_id=post_id,
            parent_id=parent_id
        )
        db.session.add(new_reply)
        db.session.commit() # 先提交用户回复以获取ID
        user_reply_id = new_reply.id

        # --- 新增：如果提及 Lynn，则异步调用 AI 回复任务 ---
        if mention_lynn:
            question_for_ai = ""
            try:
                mention_keyword = "@lynn"
                start_index = content.lower().find(mention_keyword)
                if start_index != -1:
                    question_for_ai = content[start_index + len(mention_keyword):].strip()
                
                if question_for_ai:
                    current_app.logger.info(f"[API_CREATE_POST_REPLY] User PostReply ID {user_reply_id} - Queueing AI reply task for post {post_id}. Question: {question_for_ai}")
                    
                    # 获取帖子完整内容和父评论内容
                    post_title = post.title
                    post_content = post.content
                    parent_comment_content = parent_comment.content if parent_comment else None
                    
                    generate_ai_post_comment_reply_task.delay(
                        user_post_comment_id=user_reply_id, # ID of the user's reply
                        post_id=post_id,
                        user_question=question_for_ai,
                        post_title=post_title,
                        post_content=post_content,  # 传递整篇帖子内容
                        parent_comment_content=parent_comment_content,  # 传递父评论内容
                        original_user_id=current_user_id_int
                    )
                else:
                    current_app.logger.info(f"[API_CREATE_POST_REPLY] User PostReply ID {user_reply_id} - Mention @lynn detected for post {post_id}, but no subsequent question found.")
            except Exception as task_e:
                current_app.logger.error(f"[API_CREATE_POST_REPLY] User PostReply ID {user_reply_id} - Error queueing AI reply task for post {post_id}: {task_e}", exc_info=True)
        # --- 结束 AI 调用 ---

        try:
            update_post_counts.delay(post_id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue counts update task after replying to comment for post {post_id}: {e}")

        db.session.refresh(new_reply)
        reply_dict = new_reply.to_dict(include_author=True, current_user_id=current_user_id_int)
        return jsonify(reply_dict), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"创建帖子 {post_id} 评论 {parent_id} 的回复失败: {e}")
        return jsonify({'error': '创建回复失败'}), 500
# --- 结束新增 --- 

# --- 新增：删除帖子评论的路由 (软删除) ---
@posts_bp.route('/<int:post_id>/comments/<int:comment_id>', methods=['DELETE'])
@jwt_required()
def delete_post_comment(post_id, comment_id):
    """软删除指定的帖子评论 (仅评论作者或管理员可操作)"""
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 401

    comment = PostComment.query.filter_by(id=comment_id, post_id=post_id).first()

    if not comment:
        return jsonify({'error': '评论未找到或不属于该帖子'}), 404

    # 权限检查: 评论作者或管理员
    if comment.user_id != current_user_id and not user.is_admin:
        return jsonify({'error': '无权删除此评论'}), 403

    if comment.is_deleted:
        return jsonify({'message': '评论已被删除'}), 200

    try:
        comment.is_deleted = True
        # 如果需要，可以清除内容或保留原始内容到另一个字段
        # comment.content = "[评论已删除]" 
        db.session.add(comment) # 标记对象已更改
        db.session.commit()
        
        # 异步更新帖子的总评论数
        try:
            update_post_counts.delay(post_id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue post counts update task after deleting comment {comment_id} for post {post_id}: {e}")

        return jsonify({'message': '评论已成功删除'}), 200 # 或者返回 204 No Content
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"软删除帖子评论 {comment_id} 失败: {e}")
        return jsonify({'error': '删除评论失败'}), 500
# --- 结束新增 --- 

@posts_bp.route('post_comments/<int:comment_id>/like', methods=['POST'])
@jwt_required()
def like_post_comment(comment_id):
    """点赞帖子评论"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
        
    comment = PostComment.query.get_or_404(comment_id)
    
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
        
        # 异步更新点赞计数
        try:
            from app.tasks import update_post_comment_likes_count
            update_post_comment_likes_count.delay(comment_id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue comment likes count update task for comment {comment_id}: {e}")
            
        return jsonify({
            'message': '点赞成功',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': True
        }), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"点赞帖子评论 {comment_id} 失败: {e}", exc_info=True)
        return jsonify({'error': f'点赞失败: {str(e)}'}), 500

@posts_bp.route('post_comments/<int:comment_id>/like', methods=['DELETE'])
@jwt_required()
def unlike_post_comment(comment_id):
    """取消点赞帖子评论"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
        
    comment = PostComment.query.get_or_404(comment_id)
    
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
        
        # 异步更新点赞计数
        try:
            from app.tasks import update_post_comment_likes_count
            update_post_comment_likes_count.delay(comment_id)
        except Exception as e:
            current_app.logger.error(f"Failed to queue comment likes count update task for comment {comment_id}: {e}")
            
        return jsonify({
            'message': '取消点赞成功',
            'likes_count': comment.likers.count(),
            'is_liked_by_current_user': False
        }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"取消点赞帖子评论 {comment_id} 失败: {e}", exc_info=True)
        return jsonify({'error': f'取消点赞失败: {str(e)}'}), 500