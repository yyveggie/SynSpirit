"""
此模块定义了与用户 (User) 相关的 API 端点。
包括用户信息获取、更新，关注/取消关注，以及用户内容检索等功能。

主要功能：
- 获取/更新用户个人资料
- 获取用户关注列表和粉丝列表
- 关注/取消关注其他用户
- 获取用户发布的文章、帖子、行为和动态
- 收藏/取消收藏主题
- 获取用户收藏状态

依赖模型: User, Article, UserAction, Post, Topic, UserFavoriteTopic
使用 Flask 蓝图: user_bp (前缀 /api/users)

"""
from flask import Blueprint, jsonify, request, current_app, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app import db
from app.models import User, Article, UserAction, Post, Topic, UserFavoriteTopic
from werkzeug.security import generate_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import desc, or_
from sqlalchemy.orm import joinedload, aliased
import os
from datetime import datetime
import json

user_bp = Blueprint('user_bp', __name__, url_prefix='/api/users')

@user_bp.route('/profile', methods=['GET'])
def get_profile():
    """获取当前登录用户的个人资料"""
    try:
        # 打印请求头以进行调试
        print("\n=== 请求头信息 ===")
        for key, value in request.headers.items():
            if key.lower() == 'authorization':
                # 只显示令牌的一部分，出于安全考虑
                value_part = value[:20] + "..." if len(value) > 20 else value
                print(f"{key}: {value_part}")
            else:
                print(f"{key}: {value}")
        print("==================\n")
        
        verify_jwt_in_request()
        current_user_id = get_jwt_identity()
        
        print(f"从JWT中获取的用户ID: {current_user_id}")
        
        # 检查是否获取到用户ID
        if not current_user_id:
            current_app.logger.error("未能从JWT中获取用户ID")
            return jsonify({'error': '无法识别用户身份'}), 401
        
        # 根据ID查询用户
        user = User.query.get(current_user_id)
        
        if not user:
            current_app.logger.error(f"找不到ID为{current_user_id}的用户")
            return jsonify({'error': '用户不存在'}), 404
        
        user_data = user.to_dict()
        print(f"返回的用户数据: {user_data}")
        
        return jsonify({
            'message': '获取用户资料成功',
            'user': user_data
        }), 200
    except Exception as e:
        import traceback
        current_app.logger.error(f"获取用户资料时出错：{str(e)}")
        print(f"获取用户资料时出错：{str(e)}")
        print(traceback.format_exc())  # 打印完整的错误堆栈
        return jsonify({'error': f'获取用户资料失败：{str(e)}'}), 500 

@user_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """更新当前登录用户的个人资料 (昵称, 简介)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    updated_fields = []

    # Update nickname
    if 'nickname' in data:
        nickname = data['nickname']
        if nickname is None or isinstance(nickname, str):
            # Optional: Add length check
            if nickname and len(nickname) > 50:
                return jsonify({"error": "Nickname cannot exceed 50 characters"}), 400
            # Optional: Add uniqueness check (more complex, requires query)
            # existing_user = User.query.filter(User.nickname == nickname, User.id != user_id).first()
            # if existing_user:
            #     return jsonify({"error": "Nickname already taken"}), 400
            user.nickname = nickname if nickname else None # Store empty string as None
            updated_fields.append('nickname')
        else:
            return jsonify({"error": "Nickname must be a string or null"}), 400

    # Update bio
    if 'bio' in data:
        if data['bio'] is None or isinstance(data['bio'], str):
            user.bio = data['bio']
            updated_fields.append('bio')
        else:
            return jsonify({"error": "Bio must be a string or null"}), 400

    if not updated_fields:
         return jsonify({"message": "No fields provided for update"}), 400

    try:
        db.session.commit()
        return jsonify({
            "message": f"Profile fields ({', '.join(updated_fields)}) updated successfully", 
            "user": user.to_dict()
            }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating profile for user {user_id}: {e}")
        return jsonify({"error": "Failed to update profile"}), 500

@user_bp.route('/series', methods=['GET'])
@jwt_required()
def get_user_series():
    """获取当前用户创建的所有系列名称"""
    user_id = get_jwt_identity()
    if not user_id:
         return jsonify({"error": "无法从令牌中获取用户身份"}), 401
    
    # 查询用户的所有非空且不重复的系列名称
    series_query = db.session.query(Article.series_name)\
                            .filter(Article.user_id == user_id, Article.series_name.isnot(None))\
                            .distinct()\
                            .order_by(Article.series_name)
                            
    series_names = [row[0] for row in series_query.all()]
    
    return jsonify({"series": series_names}) 

@user_bp.route('/my-content', methods=['GET'])
@jwt_required()
def get_my_content():
    """获取当前用户创建的文章和系列信息"""
    user_id = get_jwt_identity()
    if not user_id:
         return jsonify({"error": "无法从令牌中获取用户身份"}), 401
    
    # --- 获取用户文章 (包含系列信息) ---
    user_articles_query = Article.query.filter_by(user_id=user_id)\
                                   .order_by(desc(Article.created_at))
    # TODO: Add pagination later if needed
    user_articles_from_db = user_articles_query.all()
    
    articles_with_series = []
    for article in user_articles_from_db:
        article_dict = article.to_dict()
        series_list_for_frontend = []
        # If it belongs to a series, fetch the series info
        if article.series_name: # Already filtered by user_id
             series_query = Article.query.filter(
                Article.user_id == user_id, # Explicitly ensure user_id match
                Article.series_name == article.series_name,
                Article.is_published == True # Or maybe show unpublished too on profile?
            ).order_by(Article.series_order, Article.created_at).all()

             for series_item in series_query:
                 series_list_for_frontend.append({
                    'id': series_item.id,
                    'title': series_item.title,
                    'slug': series_item.slug,
                    'series_order': series_item.series_order or 0,
                    'is_current': series_item.id == article.id
                 })
        article_dict['series_articles'] = series_list_for_frontend
        articles_with_series.append(article_dict)
        
    # --- 获取用户系列名称 --- 
    series_names_query = db.session.query(Article.series_name)\
                            .filter(Article.user_id == user_id, Article.series_name.isnot(None))\
                            .distinct()\
                            .order_by(Article.series_name)
                            
    series_names = [row[0] for row in series_names_query.all()]
    
    return jsonify({
        "articles": articles_with_series,
        "series_names": series_names
    }) 

@user_bp.route('/<int:user_id>/articles', methods=['GET'])
def get_user_articles(user_id):
    """获取指定用户发表的文章列表（不包含帖子）"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 10, type=int)
    
    user = User.query.get_or_404(user_id) # 确保用户存在
    
    articles_query = Article.query.filter(
        Article.user_id == user_id,
        Article.is_published == True # 通常只显示已发布的
    ).options(joinedload(Article.author_user)).order_by(Article.created_at.desc()) # 预加载作者信息
    
    paginated_articles = articles_query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'articles': [article.to_dict(include_content=False) for article in paginated_articles.items],
        'total': paginated_articles.total,
        'page': page,
        'pages': paginated_articles.pages
    })

@user_bp.route('/<int:user_id>/posts', methods=['GET'])
def get_user_posts(user_id):
    """获取指定用户发表的帖子列表（关联到 Topic）"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 10, type=int)
    
    user = User.query.get_or_404(user_id) # 确保用户存在
    
    posts_query = Post.query.filter(
        Post.user_id == user_id,
        Post.publication_status == 'published' 
    ).options(joinedload(Post.author), joinedload(Post.topic)).order_by(Post.created_at.desc()) # 预加载 Post 的作者和主题
    
    paginated_posts = posts_query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'posts': [post.to_dict(include_content=False) for post in paginated_posts.items],
        'total': paginated_posts.total,
        'page': page,
        'pages': paginated_posts.pages
    })

@user_bp.route('/<int:user_id>/dynamics', methods=['GET'])
def get_user_dynamics(user_id):
    """获取指定用户的分享动态列表"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 10, type=int)

    user = User.query.get_or_404(user_id)

    # 获取当前请求的用户ID (可能是游客，也可能是登录用户)
    current_request_user_id = None
    if verify_jwt_in_request(optional=True): # 检查JWT是否存在且有效（如果提供的话）
        current_user_identity = get_jwt_identity()
        if isinstance(current_user_identity, dict):
            current_request_user_id = current_user_identity.get('id')
        elif isinstance(current_user_identity, (int, str)):
            try:
                current_request_user_id = int(current_user_identity)
            except ValueError:
                pass # ID无法转换为整数

    # 导入 fetch_action_details
    try:
        from app.routes.dynamics import fetch_action_details
    except ImportError:
        # 处理导入错误，可能需要调整路径或返回错误
        return jsonify({"error": "无法加载动态处理模块"}), 500

    # 修改查询：获取用户的所有原创动态 (create_status) 和所有分享类型的动态 (share)
    dynamics_query = UserAction.query.filter(
        UserAction.user_id == user_id, # 动态必须是这个用户发起的
        or_(
            UserAction.action_type == 'create_status', # 1. 原创动态
            UserAction.action_type == 'share'          # 2. 或者任何分享类型的动态
        ),
        UserAction.is_deleted == False  # 添加过滤条件，排除已软删除的动态
    ).order_by(UserAction.created_at.desc())

    paginated_actions = dynamics_query.paginate(page=page, per_page=per_page, error_out=False)

    results = []
    for action in paginated_actions.items:
        try:
            full_details = fetch_action_details(action.id, current_request_user_id)
            
            if full_details:
                is_share_of_deleted_with_no_comment = (
                    full_details.get('action_type') == 'share' and
                    full_details.get('target_type') == 'deleted' and
                    not full_details.get('share_comment', '').strip()
                )

                # 修改短原创动态的过滤：只过滤完全为空的
                is_truly_empty_status = (
                    full_details.get('action_type') == 'create_status' and
                    len(full_details.get('share_comment', '').strip()) == 0 
                )
                
                if is_share_of_deleted_with_no_comment or is_truly_empty_status:
                    continue

                results.append(full_details)
        except Exception as fetch_err: # 添加异常处理，防止一个动态错误导致整个列表失败
            print(f"Error fetching details for action {action.id}: {fetch_err}")
            import traceback
            traceback.print_exc()
            # 注意：这里发生错误时，这个action会被跳过，但循环会继续
            
    # 将 return 语句移到 for 循环外部
    return jsonify({
        'dynamics': results,
        'total': paginated_actions.total, # 注意这里的 total 仍然是分页对象的 total
        'page': page,
        'pages': paginated_actions.pages
    }) 

# --- 普通主题收藏 API (保持不变) ---
@user_bp.route('/favorites/topics', methods=['GET'])
@jwt_required()
def get_favorite_topics():
    """获取用户收藏的普通主题列表"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # 通过 UserFavoriteTopic 关联查询
    fav_topics = db.session.query(Topic).join(UserFavoriteTopic).filter(UserFavoriteTopic.user_id == user_id).all()
    
    return jsonify({"favorite_topics": [topic.to_minimal_dict() for topic in fav_topics]})

@user_bp.route('/favorites/topics', methods=['POST'])
@jwt_required()
def add_favorite_topic():
    """添加普通主题到用户收藏"""
    user_id = get_jwt_identity()
    data = request.get_json()
    if not data or 'topic_id' not in data:
        return jsonify({"error": "Missing topic_id in request body"}), 400

    topic_id = data['topic_id']

    # 检查主题是否存在
    topic = Topic.query.get(topic_id)
    if not topic:
        return jsonify({"error": "Topic not found"}), 404

    # 检查是否已收藏
    existing_fav = UserFavoriteTopic.query.filter_by(user_id=user_id, topic_id=topic_id).first()
    if existing_fav:
        return jsonify({"message": "Topic already favorited"}), 200 # 或者返回 409 Conflict
        
    # 创建收藏记录
    new_fav = UserFavoriteTopic(user_id=user_id, topic_id=topic_id)
    db.session.add(new_fav)
    try:
        db.session.commit()
        return jsonify({"message": f"Topic '{topic.name}' added to favorites"}), 201
    except IntegrityError: # 处理并发等可能导致的唯一约束冲突
        db.session.rollback()
        return jsonify({"error": "Failed to add favorite, possibly already exists"}), 409
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error adding favorite topic {topic_id} for user {user_id}: {e}")
        return jsonify({"error": "Failed to add favorite"}), 500

@user_bp.route('/favorites/topics/<int:topic_id>', methods=['DELETE'])
@jwt_required()
def remove_favorite_topic(topic_id):
    """从用户收藏移除普通主题"""
    user_id = get_jwt_identity()
    fav = UserFavoriteTopic.query.filter_by(user_id=user_id, topic_id=topic_id).first()
    if not fav:
        return jsonify({"error": "Favorite not found"}), 404

    db.session.delete(fav)
    try:
        db.session.commit()
        # 获取主题名称用于返回消息
        topic = Topic.query.get(topic_id)
        topic_name = topic.name if topic else f"ID {topic_id}"
        return jsonify({"message": f"Topic '{topic_name}' removed from favorites"}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error removing favorite topic {topic_id} for user {user_id}: {e}")
        return jsonify({"error": "Failed to remove favorite"}), 500

@user_bp.route('/favorites/topics/<int:topic_id>/status', methods=['GET'])
@jwt_required()
def check_favorite_topic_status(topic_id):
    """检查用户是否收藏了特定普通主题"""
    user_id = get_jwt_identity()
    is_favorited = UserFavoriteTopic.query.filter_by(user_id=user_id, topic_id=topic_id).count() > 0
    return jsonify({"isFavorited": is_favorited})

# --- 用户标签管理 API ---
@user_bp.route('/update-tags', methods=['PUT'])
@jwt_required()
def update_user_tags():
    """更新当前登录用户的标签"""
    current_user_id = get_jwt_identity()
    user = User.query.get_or_404(current_user_id)
    
    data = request.get_json()
    if not data or 'tags' not in data:
        return jsonify({'error': '缺少标签数据'}), 400
    
    tags = data['tags']
    
    # 验证标签格式
    if not isinstance(tags, list):
        return jsonify({'error': '标签必须是数组格式'}), 400
    
    # 验证标签数量
    if len(tags) > 20:
        return jsonify({'error': '标签数量不能超过20个'}), 400
    
    # 验证每个标签的长度和内容
    for tag in tags:
        if not isinstance(tag, str):
            return jsonify({'error': '每个标签必须是字符串'}), 400
        if len(tag) > 15:
            return jsonify({'error': '单个标签不能超过15个字符'}), 400
        if ',' in tag:
            return jsonify({'error': '标签不能包含逗号'}), 400
    
    try:
        # 更新用户标签
        user.tags = tags
        db.session.commit()
        
        # 返回更新后的用户数据
        return jsonify({
            'message': '标签更新成功',
            'user': user.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"更新用户 {current_user_id} 的标签失败: {e}")
        return jsonify({'error': f'更新标签失败: {str(e)}'}), 500

# --- 用户头像上传 API ---
@user_bp.route('/avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    """上传用户头像到腾讯云COS"""
    current_user_id = get_jwt_identity()
    user = User.query.get_or_404(current_user_id)
    
    # 检查是否上传了文件
    if 'avatar' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400
    
    file = request.files['avatar']
    
    # 检查文件是否为空
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    # 检查文件类型（只允许图片）
    allowed_extensions = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'}
    if not ('.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
        return jsonify({'error': '不支持的文件类型，只允许上传图片'}), 400
    
    # 检查文件大小（限制为5MB）
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)  # 重置文件指针到开头
    
    if file_size > 5 * 1024 * 1024:  # 5MB
        return jsonify({'error': '文件太大，最大允许5MB'}), 400
    
    try:
        # 导入COS存储工具
        from app.utils.cos_storage import cos_storage
        
        # 上传文件到COS的avatars子文件夹
        avatar_url = cos_storage.upload_file(file, subfolder='avatars')
        
        if not avatar_url:
            return jsonify({'error': '头像上传到云存储失败'}), 500
        
        # 更新用户头像字段
        user.avatar = avatar_url
        db.session.commit()
        
        return jsonify({
            'message': '头像上传成功',
            'avatar_url': avatar_url,
            'user': user.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"用户 {current_user_id} 上传头像失败: {e}")
        return jsonify({'error': f'头像上传失败: {str(e)}'}), 500

# --- 新增：获取用户公开信息的路由 ---
@user_bp.route('/public/<int:user_id>', methods=['GET'])
def get_public_profile(user_id):
    """获取指定用户的公开个人资料"""
    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': '用户不存在'}), 404
        
        # 使用 User 模型中新增的 to_public_dict 方法
        public_user_data = user.to_public_dict()
        
        return jsonify(public_user_data), 200 # 直接返回公开信息字典

    except Exception as e:
        current_app.logger.error(f"获取用户 {user_id} 公开资料时出错：{str(e)}")
        print(f"获取用户 {user_id} 公开资料时出错：{str(e)}")
        print(traceback.format_exc()) # 打印详细错误
        return jsonify({'error': f'获取用户公开资料失败：{str(e)}'}), 500
# --- 结束新增 ---

# === 用户关注/粉丝功能 API ===

# --- 导入 UserFollow 模型 ---
# 假设 UserFollow 定义在 app.models.user 中
from app.models.user import UserFollow
from datetime import datetime # 确保导入 datetime

@user_bp.route('/<int:user_id>/follow', methods=['POST'])
@jwt_required()
def follow_user(user_id):
    """当前登录用户关注指定用户"""
    current_user_id = get_jwt_identity()
    if current_user_id == user_id:
        return jsonify({'error': '不能关注自己'}), 400

    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({'error': '目标用户不存在'}), 404

    # 检查是否已经关注
    existing_follow = UserFollow.query.filter_by(follower_id=current_user_id, followed_id=user_id).first()
    if existing_follow:
        # 如果已经关注，直接返回成功状态
        return jsonify({'message': '已经关注该用户', 'isFollowing': True}), 200

    new_follow = UserFollow(follower_id=current_user_id, followed_id=user_id)
    try:
        db.session.add(new_follow)
        db.session.commit()
        return jsonify({'message': '关注成功', 'isFollowing': True}), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"用户 {current_user_id} 关注 {user_id} 失败: {e}")
        return jsonify({'error': '关注操作失败'}), 500

@user_bp.route('/<int:user_id>/follow', methods=['DELETE'])
@jwt_required()
def unfollow_user(user_id):
    """当前登录用户取消关注指定用户"""
    current_user_id = get_jwt_identity()
    if current_user_id == user_id:
        return jsonify({'error': '不能取消关注自己'}), 400

    follow_rel = UserFollow.query.filter_by(follower_id=current_user_id, followed_id=user_id).first()
    if not follow_rel:
        # 如果未关注，直接返回成功状态 (幂等性)
        return jsonify({'message': '未关注该用户', 'isFollowing': False}), 200

    try:
        db.session.delete(follow_rel)
        db.session.commit()
        return jsonify({'message': '取消关注成功', 'isFollowing': False}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"用户 {current_user_id} 取消关注 {user_id} 失败: {e}")
        return jsonify({'error': '取消关注操作失败'}), 500

@user_bp.route('/<int:user_id>/follow-status', methods=['GET'])
@jwt_required(optional=True) # 允许匿名用户访问，但需要检查身份
def get_follow_status(user_id):
    """检查当前登录用户（如果已登录）是否关注了目标用户"""
    current_user_id = get_jwt_identity()
    is_following = False
    if current_user_id: # 只有登录用户才能有关注状态
        is_following = db.session.query(
            UserFollow.query.filter_by(follower_id=current_user_id, followed_id=user_id).exists()
        ).scalar()
    return jsonify({'isFollowing': is_following})

@user_bp.route('/<int:user_id>/followers/count', methods=['GET'])
def get_follower_count(user_id):
    """获取目标用户的粉丝数量"""
    # 确保目标用户存在
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    count = UserFollow.query.filter_by(followed_id=user_id).count()
    return jsonify({'count': count})

@user_bp.route('/<int:user_id>/following/count', methods=['GET'])
def get_following_count(user_id):
    """获取目标用户关注的人数"""
    # 确保目标用户存在
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    count = UserFollow.query.filter_by(follower_id=user_id).count()
    return jsonify({'count': count})

# === 结束 关注/粉丝 API ===

# --- 新增：获取关注/粉丝列表 API ---

@user_bp.route('/<int:user_id>/following', methods=['GET'])
def get_following_list(user_id):
    """获取指定用户关注的人的列表 (分页)"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 20, type=int) # 每页默认显示20个

    # 确保目标用户存在
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    # 查询该用户关注的所有 UserFollow 记录，并预加载被关注者的信息
    following_query = UserFollow.query.filter_by(follower_id=user_id)\
                                  .options(joinedload(UserFollow.followed).load_only(User.id, User.nickname, User.avatar))\
                                  .order_by(UserFollow.created_at.desc())
    
    paginated_follows = following_query.paginate(page=page, per_page=per_page, error_out=False)
    
    # 提取被关注者的信息
    following_users = [
        follow.followed.to_dict_basic() # 使用 basic dict 获取 id, nickname, avatar
        for follow in paginated_follows.items
        if follow.followed # 确保关联的用户存在
    ]
    
    return jsonify({
        'users': following_users,
        'total': paginated_follows.total,
        'page': page,
        'pages': paginated_follows.pages
    })

@user_bp.route('/<int:user_id>/followers', methods=['GET'])
def get_follower_list(user_id):
    """获取关注指定用户的粉丝列表 (分页)"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('limit', 20, type=int)

    # 确保目标用户存在
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': '用户不存在'}), 404

    # 查询关注该用户的 UserFollow 记录，并预加载关注者的信息
    follower_query = UserFollow.query.filter_by(followed_id=user_id)\
                                .options(joinedload(UserFollow.follower).load_only(User.id, User.nickname, User.avatar))\
                                .order_by(UserFollow.created_at.desc())

    paginated_followers = follower_query.paginate(page=page, per_page=per_page, error_out=False)

    # 提取关注者的信息
    follower_users = [
        follow.follower.to_dict_basic() # 使用 basic dict
        for follow in paginated_followers.items
        if follow.follower # 确保关联的用户存在
    ]

    return jsonify({
        'users': follower_users,
        'total': paginated_followers.total,
        'page': page,
        'pages': paginated_followers.pages
    })

# --- 结束新增列表 API ---