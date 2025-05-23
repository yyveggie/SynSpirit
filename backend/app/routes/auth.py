"""
此模块定义了与用户认证相关的 API 端点。

主要功能包括:
- 处理用户登录 (支持表单提交和 JWT API 登录)。
- 处理用户注册 (API)。
- 处理游客登录 (API)。
- 提供 JWT 令牌验证端点。

依赖模型: User
使用 Flask 蓝图: auth_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, request, jsonify, current_app, render_template, flash, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from app import db
from app.models import User
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from flask_login import login_user, current_user
import datetime
import os

auth_bp = Blueprint('auth', __name__, template_folder='../templates/auth')

# 在 auth_bp 蓝图定义后立即添加
print("\n\n====== AUTH.PY 已成功加载 (版本：当前时间) ======\n\n")

# 登录路由 (处理后台表单登录和可能的 API 登录)
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    # 如果用户已经通过 Flask-Login 登录，直接重定向到 admin 首页
    if current_user.is_authenticated:
        return redirect(url_for('admin.manage_articles'))

    # 检查请求是否通过/api/前缀发送 和 Content-Type 判断 API 请求
    request_path = request.path
    is_path_api = '/api/' in request_path
    is_content_json = request.content_type == 'application/json'
    
    # --- 修改：更精确地判断 API 请求 --- 
    # is_api_request = '/api/' in request_path # 旧逻辑：仅基于路径
    is_api_request = is_path_api and is_content_json # 新逻辑：路径含 /api/ 且 Content-Type 是 JSON
    # --- 结束修改 ---

    if request.method == 'POST':
        # 强制开启的打印，不依赖 logger
        print("========== 登录调试信息 ==========")
        print(f"请求路径: {request_path}")
        print(f"是API请求? {is_api_request}")
        print(f"请求内容类型: {request.content_type}")
        print(f"请求头: {dict(request.headers)}")
        print(f"请求是JSON? {request.is_json}")
        print(f"请求数据: {request.get_data(as_text=True)}")
        print("==================================")

        # 获取邮箱和密码
        if is_api_request:
            # API请求：尝试从JSON解析数据
            print("处理为 API 请求 (基于路径)")
            try:
                # 尝试解析JSON数据
                data = request.get_json(force=True, silent=True) or {}
                # --- 修改：尝试获取 'username' 或 'email' --- 
                # email = data.get('username') # 旧逻辑：只获取 username
                email = data.get('username') or data.get('email') # 新逻辑：优先 username，否则 email
                # --- 结束修改 ---
                password = data.get('password')
            except Exception as e:
                print(f"JSON 解析错误: {e}")
                return jsonify({'message': 'JSON 解析失败'}), 400
        else:
            # 表单提交
            print("处理为表单请求")
            email = request.form.get('email')
            password = request.form.get('password')

            if not email or not password:
                error_msg = '请提供邮箱和密码'
            print(f"登录错误: {error_msg}")
            if is_api_request:
                return jsonify({'message': error_msg}), 400
            else:
                flash(error_msg, 'warning')
                return render_template('login.html')
        
        # 尝试查找用户
        user = User.query.filter_by(email=email).first()
        print(f"用户查找结果: {user is not None}")
        
        if not user or not check_password_hash(user.password_hash, password):
            error_msg = '邮箱或密码错误'
            print(f"登录失败: {error_msg}")
            
            if is_api_request:
                return jsonify({'message': error_msg}), 401
            else:
                flash(error_msg, 'danger')
                return render_template('login.html')
        
        # 登录成功
        print(f"登录成功，用户: {user.email}, API请求: {is_api_request}")
        
        # 更新最后登录时间
        user.last_login = datetime.datetime.utcnow()
        db.session.commit()

        if is_api_request:
            # 为 API 请求生成 JWT
            access_token = create_access_token(
                 identity=user.id,
                 additional_claims={
                     'email': user.email,
                     'is_admin': user.is_admin
                 }
            )
            print(f"已生成令牌 (前20字符): {access_token[:20]}...")
             
            # 返回 JSON 响应，状态码 200
            response_data = {
                 'message': '登录成功',
                 'token': access_token,
                 'user': user.to_dict()
            }
            print(f"API响应: {response_data}")
            return jsonify(response_data), 200
        else:
            # 表单登录处理
            login_user(user)
            next_page = request.args.get('next')
            if not next_page or not next_page.startswith('/'):
                next_page = url_for('admin.manage_articles')
            flash('登录成功！', 'success')
            return redirect(next_page)

    # 处理 GET 请求
    return render_template('login.html')

# 注册路由
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': '请提供邮箱和密码'}), 400
    
    # 检查邮箱格式
    if '@' not in data.get('email'):
        return jsonify({'message': '请提供有效的邮箱地址'}), 400
    
    # 检查用户是否已存在
    existing_user = User.query.filter_by(email=data.get('email')).first()
    if existing_user:
        return jsonify({'message': '该邮箱已注册，请直接登录'}), 400
    
    # 创建新用户
    hashed_password = generate_password_hash(data.get('password'))
    new_user = User(
        email=data.get('email'),
        password_hash=hashed_password
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # 使用flask-jwt-extended生成JWT令牌
    access_token = create_access_token(
        identity=new_user.id,
        additional_claims={
            'email': new_user.email
        }
    )
    
    return jsonify({
        'message': '注册成功',
        'token': access_token,
        'user': new_user.to_dict()
    }), 201

# 游客登录路由
@auth_bp.route('/guest-login', methods=['POST'])
def guest_login():
    # 使用flask-jwt-extended生成游客JWT令牌
    access_token = create_access_token(
        identity=None,
        additional_claims={
            'is_guest': True
        },
        expires_delta=datetime.timedelta(hours=12)
    )
    
    return jsonify({
        'message': '游客登录成功',
        'token': access_token
    }), 200

# 验证令牌路由
@auth_bp.route('/verify-token', methods=['POST'])
@jwt_required(optional=True)
def verify_token():
    # 使用flask-jwt-extended验证令牌
    current_user_id = get_jwt_identity()
    
    if not current_user_id:
        return jsonify({'valid': False}), 401
        
    # 如果是注册用户令牌
    user = User.query.filter_by(id=current_user_id).first()
    if not user:
        return jsonify({'valid': False}), 404
    
    return jsonify({'valid': True, 'user': user.to_dict()}), 200 