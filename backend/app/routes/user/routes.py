"""
此模块定义了与用户相关的 API 端点。
修改：整合了原来 user_bp 和 users_bp 的功能，统一使用 'users' 蓝图和 /api/users 前缀。

主要功能:
- 获取公开用户资料 (GET /public/<user_id>) - 无需认证
- 获取当前登录用户的完整个人资料 (GET /profile) - 需要 JWT
- 更新当前登录用户的个人资料 (PUT /profile) - 需要 JWT
- 上传用户头像 (POST /avatar) - 需要 JWT
- 获取当前用户创建的文章列表 (GET /articles) - 需要 JWT (或改为公开？)
- 获取当前用户创建的帖子列表 (GET /posts) - 需要 JWT (或改为公开？)
- 获取当前用户创建的动态列表 (GET /dynamics) - 需要 JWT (或改为公开？)
- 获取当前用户创建的系列名称列表 (GET /series) - 需要 JWT

依赖模型: User, Article, Post, UserAction
认证: Flask-JWT-Extended
使用 Flask 蓝图: users_bp (前缀 /api/users)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app import db
from app.models import User, Article, Post, UserAction # 导入需要的模型
from app.utils.cos_storage import cos_storage # 导入COS存储工具

# --- 修改：统一使用 users_bp 和 /api/users 前缀 ---
users_bp = Blueprint('users', __name__, url_prefix='/api/users') 
# --- 结束修改 ---


# --- 新增：获取公开用户资料的接口 ---
@users_bp.route('/public/<int:user_id>', methods=['GET'])
def get_public_user_profile(user_id):
    """获取指定用户的公开个人资料"""
    # 优化：只查询需要的字段，避免加载整个 User 对象
    user_data = db.session.query(
        User.id, 
        User.nickname, 
        User.bio, 
        User.avatar, 
        User.created_at
    ).filter_by(id=user_id).first()

    if not user_data:
        return jsonify({"error": "用户未找到"}), 404
    
    # 组装公开信息字典
    public_data = {
        'id': user_data.id,
        'nickname': user_data.nickname,
        'bio': user_data.bio,
        'avatar': user_data.avatar, 
        'created_at': user_data.created_at.isoformat() if user_data.created_at else None,
    }
    
    return jsonify({'user': public_data}), 200
# --- 结束新增 ---


@users_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_user_profile():
    """获取当前登录用户的完整个人资料"""
    current_user_identity = get_jwt_identity() 
    current_user_id = None
    if isinstance(current_user_identity, dict):
        current_user_id = current_user_identity.get('id')
    elif isinstance(current_user_identity, (int, str)):
         try:
             current_user_id = int(current_user_identity)
         except ValueError:
             pass 
    
    if not current_user_id:
         print(f"无法从 JWT identity 获取有效的用户 ID: {current_user_identity}")
         return jsonify({"error": "无效的用户身份信息"}), 401 
    
    user = User.query.get(current_user_id)
    if not user:
        # 如果 ID 有效但数据库找不到（理论上不应发生），返回 404
        return jsonify({"error": "用户未找到"}), 404
        
    # 使用 user.to_dict() 返回完整信息
    return jsonify({'user': user.to_dict()}), 200


@users_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_user_profile():
    """更新当前登录用户的个人资料 (昵称/简介)"""
    current_user_identity = get_jwt_identity()
    current_user_id = None
    if isinstance(current_user_identity, dict):
        current_user_id = current_user_identity.get('id')
    elif isinstance(current_user_identity, (int, str)):
        try:
            current_user_id = int(current_user_identity)
        except ValueError:
            pass

    if not current_user_id:
        return jsonify({"error": "无效的用户身份信息"}), 401

    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户未找到"}), 404
        
    data = request.get_json()
    updated = False
    
    if 'bio' in data:
        user.bio = data['bio']
        updated = True
    if 'nickname' in data:
        # TODO: 在这里添加昵称唯一性校验！
        # new_nickname = data['nickname']
        # existing_user = User.query.filter(User.nickname == new_nickname, User.id != current_user_id).first()
        # if existing_user:
        #     return jsonify({"error": "昵称已被使用"}), 400
        user.nickname = data['nickname']
        updated = True
        
    if not updated:
         return jsonify({"message": "没有提供要更新的字段 (bio 或 nickname)"}), 400
        
    try:
        db.session.commit()
        return jsonify({'user': user.to_dict(), 'message': '个人资料更新成功'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating profile for user {current_user_id}: {e}")
        return jsonify({"error": "更新个人资料时出错"}), 500

# --- 新增/修改：获取指定用户的公开内容列表 ---

@users_bp.route('/<int:user_id>/articles', methods=['GET'])
def get_user_articles(user_id):
    """获取指定用户的文章列表 (公开)"""
    # 检查用户是否存在 (可选，但建议)
    user_exists = db.session.query(User.id).filter_by(id=user_id).first()
    if not user_exists:
        return jsonify({"error": "用户未找到"}), 404
        
    try:
        # Fetch user's articles - 只需要基础信息用于列表展示
        # 考虑只查询需要的字段以提高性能
        articles = Article.query.filter_by(user_id=user_id, is_public=True)\
            .order_by(Article.created_at.desc())\
            .options(db.defer(Article.content))\
            .all()
        articles_data = [article.to_dict(include_content=False) for article in articles] 
        return jsonify({'articles': articles_data}), 200
    except Exception as e:
        print(f"Error fetching articles for user {user_id}: {e}")
        return jsonify({"error": "获取用户文章时出错"}), 500

@users_bp.route('/<int:user_id>/posts', methods=['GET'])
def get_user_posts(user_id):
    """获取指定用户的帖子列表 (公开)"""
    user_exists = db.session.query(User.id).filter_by(id=user_id).first()
    if not user_exists:
        return jsonify({"error": "用户未找到"}), 404
        
    try:
        # 假设 Post 模型也有 is_public 字段，或者帖子默认公开
        posts = Post.query.filter_by(author_id=user_id)\
            .order_by(Post.created_at.desc())\
            .options(db.defer(Post.content))\
            .all()
        # 注意：Post 的 to_dict 可能需要调整以适应列表展示
        posts_data = [post.to_dict(include_content=False) for post in posts] 
        return jsonify({'posts': posts_data}), 200
    except Exception as e:
        print(f"Error fetching posts for user {user_id}: {e}")
        return jsonify({"error": "获取用户帖子时出错"}), 500
        
@users_bp.route('/<int:user_id>/dynamics', methods=['GET'])
def get_user_dynamics(user_id):
    user_exists = db.session.query(User.id).filter_by(id=user_id).first()
    if not user_exists:
        return jsonify({"error": "用户未找到"}), 404
        
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('limit', 10, type=int)

        print(f"[DEBUG] get_user_dynamics: 查询用户 {user_id} 的动态, 页码 {page}, 每页 {per_page} 项")
        
        # 打印生成的SQL（可选）
        query_sql = str(UserAction.query.filter(
            UserAction.user_id == user_id
            # 移除所有类型过滤，查询用户的所有动态
        ).statement.compile(compile_kwargs={"literal_binds": True}))
        
        print(f"[DEBUG] 查询SQL: {query_sql}")

        try:
            from app.routes.dynamics import fetch_action_details
        except ImportError:
            # 处理导入错误，可能需要调整路径或返回错误
            return jsonify({"error": "无法加载动态处理模块"}), 500

        # 修改查询条件，获取用户的所有动态，而不仅仅是分享
        dynamics_query = UserAction.query.filter(
            UserAction.user_id == user_id,
            UserAction.is_deleted == False  # 添加过滤条件，排除已软删除的动态
        ).order_by(UserAction.created_at.desc())
            
        # 查询动态总数（不分页）
        total_actions = dynamics_query.count()
        print(f"[DEBUG] 找到符合条件的动态总数: {total_actions}")
        
        # 获取分页后的数据
        paginated_actions = dynamics_query.paginate(page=page, per_page=per_page, error_out=False)
        
        print(f"[DEBUG] 分页后当前页项目数: {len(paginated_actions.items)}, 总页数: {paginated_actions.pages}")
        
        # 打印当前页的动态基本信息
        for idx, action in enumerate(paginated_actions.items):
            print(f"[DEBUG] 动态 {idx+1}: ID={action.id}, action_type={action.action_type}, target_type={action.target_type}")

        results = []
        current_request_user_id = None
        if verify_jwt_in_request(optional=True):
            current_request_user_id = get_jwt_identity()

        for action in paginated_actions.items:
            try:
                # 打印每个动态详细信息
                print(f"[DEBUG] 处理动态 ID={action.id}, action_type={action.action_type}, target_type={action.target_type}")
                
                full_details = fetch_action_details(action.id, current_request_user_id) 
                
                if full_details:
                    print(f"[DEBUG] 成功获取动态 ID={action.id} 的详情")
                    results.append(full_details)
                else:
                    print(f"[DEBUG] fetch_action_details 返回 None 或空, 跳过动态 ID={action.id}")
            except Exception as fetch_err: 
                # 保留原始的 print 错误日志，或者根据您的团队规范处理
                print(f"Error fetching details for action {action.id} for user profile {user_id}: {fetch_err}")
                import traceback
                traceback.print_exc()
            
        print(f"[DEBUG] 最终返回 {len(results)} 个动态")
        
        return jsonify({
            'dynamics': results,
            'total': paginated_actions.total,
            'page': page,
            'pages': paginated_actions.pages
        }), 200
    except Exception as e:
        # 保留原始的 print 错误日志
        print(f"Error fetching dynamics for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "获取用户动态时出错"}), 500

# --- 保留：获取当前登录用户的系列名称 ---
@users_bp.route('/series', methods=['GET'])
@jwt_required()
def get_user_series_names():
    """获取当前登录用户的系列名称列表 (需要认证)"""
    current_user_identity = get_jwt_identity()
    current_user_id = None
    # ... (与 /profile GET 中相同的 ID 获取逻辑) ...
    if isinstance(current_user_identity, dict):
        current_user_id = current_user_identity.get('id')
    elif isinstance(current_user_identity, (int, str)):
         try:
             current_user_id = int(current_user_identity)
         except ValueError:
             pass
    if not current_user_id:
         return jsonify({"error": "无效的用户身份信息"}), 401
        
    try:
        series_query = db.session.query(Article.series_name).filter(
            Article.user_id == current_user_id,
            Article.series_name.isnot(None),
            Article.series_name != ''
        ).distinct().order_by(Article.series_name).all()
        
        series_names = [name[0] for name in series_query]
        return jsonify({'series': series_names}), 200
        
    except Exception as e:
        print(f"Error fetching series names for user {current_user_id}: {e}")
        return jsonify({"error": "无法获取系列列表"}), 500 

# 注意：删除了原有的 /my-content 路由，因为其功能已被分解到 /<user_id>/articles 等路由中

# 注意：删除了原有的 /series 路由，因为其功能已被分解到 /series 路由中 

# --- 新增：用户头像上传接口 ---
@users_bp.route('/avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    """上传并更新用户头像"""
    current_user_identity = get_jwt_identity()
    current_user_id = None
    if isinstance(current_user_identity, dict):
        current_user_id = current_user_identity.get('id')
    elif isinstance(current_user_identity, (int, str)):
        try:
            current_user_id = int(current_user_identity)
        except ValueError:
            pass

    if not current_user_id:
        return jsonify({"error": "无效的用户身份信息"}), 401

    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "用户未找到"}), 404
        
    # 检查是否有文件上传
    if 'avatar' not in request.files:
        return jsonify({"error": "未提供头像文件"}), 400
        
    avatar_file = request.files['avatar']
    if avatar_file.filename == '':
        return jsonify({"error": "未选择文件"}), 400
        
    # 检查文件类型
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if not ('.' in avatar_file.filename and avatar_file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
        return jsonify({"error": "不支持的文件类型，只允许上传PNG、JPG、JPEG或GIF格式"}), 400
        
    # 删除旧头像（如果存在且是COS上的文件）
    if user.avatar and user.avatar.startswith(('http://', 'https://')):
        try:
            cos_storage.delete_file(user.avatar)
        except Exception as e:
            print(f"删除旧头像时出错: {e}")
            # 继续处理，不中断流程
            
    # 上传新头像到COS
    avatar_url = cos_storage.upload_file(avatar_file, subfolder='avatars')
    if not avatar_url:
        return jsonify({"error": "头像上传失败，请稍后重试"}), 500
        
    # 更新用户的头像URL
    user.avatar = avatar_url
    try:
        db.session.commit()
        return jsonify({
            "message": "头像上传成功",
            "avatar_url": avatar_url
        }), 200
    except Exception as e:
        db.session.rollback()
        print(f"更新用户头像时出错: {e}")
        return jsonify({"error": "保存头像信息失败"}), 500
# --- 结束新增 --- 