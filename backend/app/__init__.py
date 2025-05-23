# --- 添加 gevent monkey-patching ---
import gevent.monkey
gevent.monkey.patch_all()
# --- 结束添加 ---

from flask import Flask, jsonify, send_from_directory, abort, current_app, redirect, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
import os
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity, decode_token
from flask_login import LoginManager
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
import logging
from sqlalchemy import event  # Import event
from sqlalchemy.engine import Engine # Import Engine
import traceback
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from logging.handlers import TimedRotatingFileHandler
# --- 重新添加：导入Celery app --- 
from .celery_utils import celery_app as celery
# --- 结束添加 ---
# --- 新增：导入Redis缓存管理器 --- 
from .utils import cache_manager
# --- 结束新增 ---
# --- 新增：导入错误处理器 --- 
from .utils.error_handler import ErrorHandler
# --- 结束新增 ---
# --- 新增：导入图片预加载器 --- 
# 延迟导入image_preloader，避免循环导入
# from .utils.image_preloader import start_preload_thread
# --- 结束新增 ---
# --- 新增：启动后台内存监控 --- 
from .utils.cache_manager import monitor_memory_usage
# --- 结束新增 ---

# --- 修改：从 app.config 导入所有配置 --- 
from app.config import (
    SECRET_KEY, SQLALCHEMY_TRACK_MODIFICATIONS, MAX_CONTENT_LENGTH, JWT_SECRET_KEY,
    JWT_TOKEN_LOCATION, JWT_HEADER_NAME, JWT_HEADER_TYPE, JWT_ACCESS_TOKEN_EXPIRES,
    UPLOAD_FOLDER as CONFIG_UPLOAD_FOLDER, # 重命名以避免冲突
    IMAGE_CACHE_DIR_NAME,
    get_database_uri, 
    CORS_ORIGINS,
    # --- 新增：导入COS相关配置 --- 
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, COS_BUCKET_NAME, 
    COS_ENDPOINT_URL, COS_REGION_NAME, COS_PUBLIC_DOMAIN,
    SQLALCHEMY_ECHO, # Keep import
    # --- 结束新增 ---
    REDIS_URL, # 新增 REDIS_URL 配置
)
# --- 结束修改 ---

# 初始化扩展
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
socketio = SocketIO()

# 保存sid到用户ID的映射
sid_to_user = {}

# 创建 Flask-JWT-Extended 对象
jwt = JWTManager()

# 创建 Flask-Limiter 对象
limiter = Limiter(
    key_func=get_remote_address,
    # --- 提高限制用于生产环境 ---
    # Original: ["200 per day", "50 per hour"]
    # Previous: ["200 per day", "1000 per hour"]
    # 现在提高到生产环境级别的限制
    default_limits=["10000 per day", "3000 per hour"], 
    storage_uri=REDIS_URL # 使用 Redis 存储限制信息
)

def create_app(config_object=None): # config_object 参数现在可能不再需要
    app = Flask(__name__, instance_relative_config=False, static_folder='static')
    
    # --- 修改：直接从导入的变量设置配置 --- 
    app.config.from_mapping(
        SECRET_KEY=SECRET_KEY,
        SQLALCHEMY_TRACK_MODIFICATIONS=SQLALCHEMY_TRACK_MODIFICATIONS,
        MAX_CONTENT_LENGTH=MAX_CONTENT_LENGTH,
        JWT_SECRET_KEY=JWT_SECRET_KEY,
        JWT_TOKEN_LOCATION=JWT_TOKEN_LOCATION,
        JWT_HEADER_NAME=JWT_HEADER_NAME,
        JWT_HEADER_TYPE=JWT_HEADER_TYPE,
        JWT_ACCESS_TOKEN_EXPIRES=JWT_ACCESS_TOKEN_EXPIRES,
        SQLALCHEMY_DATABASE_URI=get_database_uri(),
        SQLALCHEMY_ECHO=SQLALCHEMY_ECHO, # Still keep this, maybe it works with events?
        # --- 新增：添加COS相关配置到 app.config --- 
        AWS_ACCESS_KEY_ID=AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY=AWS_SECRET_ACCESS_KEY,
        COS_BUCKET_NAME=COS_BUCKET_NAME,
        COS_ENDPOINT_URL=COS_ENDPOINT_URL,
        COS_REGION_NAME=COS_REGION_NAME,
        COS_PUBLIC_DOMAIN=COS_PUBLIC_DOMAIN,
        # --- 结束新增 ---
        # --- 新增：Redis配置 ---
        REDIS_URL=REDIS_URL,
        # --- 结束新增 ---
    )
    # --- 结束修改 ---

    # --- 配置上传文件夹和缓存文件夹 --- 
    static_folder_path = os.path.join(app.root_path, app.static_folder)
    # 使用 config.py 中的 UPLOAD_FOLDER 名称构建路径
    upload_folder_path = os.path.join(static_folder_path, CONFIG_UPLOAD_FOLDER)
    app.config['UPLOAD_FOLDER'] = upload_folder_path # 设置最终的绝对路径
    
    # 创建 instance 文件夹（如果不存在），用于缓存等实例特定的文件
    instance_path = os.path.join(app.root_path, '..', 'instance') # 指向 backend/instance
    os.makedirs(instance_path, exist_ok=True)
    # 使用 config.py 中的 IMAGE_CACHE_DIR_NAME 构建缓存路径
    image_cache_folder_path = os.path.join(instance_path, IMAGE_CACHE_DIR_NAME)
    app.config['IMAGE_CACHE_FOLDER'] = image_cache_folder_path # 设置缓存文件夹配置
    os.makedirs(image_cache_folder_path, exist_ok=True) # 确保缓存目录存在
    
    # # 打印确认路径
    # print(f"[*] UPLOAD_FOLDER final value set to: {app.config['UPLOAD_FOLDER']}")
    # print(f"[*] IMAGE_CACHE_FOLDER final value set to: {app.config['IMAGE_CACHE_FOLDER']}")
    # # --- 结束文件夹配置 --- 
    
    # 显式配置静态文件路径 (保持不变)
    app.static_folder = 'static'
    app.static_url_path = '/static'
    
    # 初始化扩展 (保持不变)
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    login_manager.init_app(app)
    # --- 修改：使用导入的 CORS_ORIGINS --- 
    socketio.init_app(
        app, 
        async_mode='gevent',
        cors_allowed_origins=CORS_ORIGINS, # 使用配置列表
        ping_timeout=20,
        ping_interval=10,
        logger=True,
        engineio_logger=True
    )
    CORS(app, 
         origins=CORS_ORIGINS, # 使用配置列表
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
         allow_headers=["Content-Type", "Authorization", "Cache-Control", "Pragma", "Access-Control-Allow-Origin", "Expires", "expires"], 
         supports_credentials=True,
         allow_credentials=True
    )
    limiter.init_app(app)
    # --- 结束修改 ---
    
    # --- 新增：初始化Redis缓存系统 ---
    # 初始化Redis缓存
    cache_manager.init_app(app)
    app.logger.info("Redis缓存系统已初始化完成")
    # --- 结束新增 ---

    # --- Configure Flask Logging --- 
    app.logger.setLevel(logging.INFO)  # MODIFIED: DEBUG -> INFO
    # 添加控制台处理器以确保日志可见
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
    app.logger.addHandler(console_handler)
    # 添加文件处理器保存日志
    log_file_path = os.path.join(os.path.dirname(app.root_path), 'logs', 'flask-debug.log')
    os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
    file_handler = logging.FileHandler(log_file_path)
    file_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
    app.logger.addHandler(file_handler)
    
    # --- 新增：单独提高缓存相关日志级别 --- 
    # 提高缓存相关日志级别，减少大量DEBUG日志输出
    logging.getLogger('app.utils.cache_manager').setLevel(logging.WARNING)  # 从DEBUG提高到WARNING
    cache_logger = logging.getLogger('app.services.cache_consistency_service')
    cache_logger.setLevel(logging.WARNING)  # 从DEBUG提高到WARNING
    
    # --- 新增：配置缓存操作过滤器 ---
    class CacheLogFilter(logging.Filter):
        """过滤掉频繁的缓存操作日志"""
        def filter(self, record):
            # 过滤掉包含这些关键词的缓存DEBUG和INFO级别日志
            cache_keywords = [
                "缓存命中", "缓存未命中", "缓存已设置", "生成缓存键", 
                "检查缓存", "缓存写入", "内存使用正常", "获取到锁", "释放锁成功",
                "延迟双删", "布隆过滤器", "后台刷新缓存", "通用缓存命中", 
                "已复制旧缓存", "设置缓存", "Redis内存使用", "缓存键"
            ]
            if record.levelno <= logging.INFO:
                for keyword in cache_keywords:
                    if keyword in record.getMessage():
                        return False
            return True
    
    # 将过滤器添加到主应用日志以及缓存日志
    app.logger.addFilter(CacheLogFilter())
    for handler in app.logger.handlers:
        handler.addFilter(CacheLogFilter())
    
    # 单独为缓存相关日志配置过滤器
    cache_manager_logger = logging.getLogger('app.utils.cache_manager')
    cache_manager_logger.addFilter(CacheLogFilter())
    cache_consistency_logger = logging.getLogger('app.services.cache_consistency_service')  
    cache_consistency_logger.addFilter(CacheLogFilter())

    # --- 新增：配置 engineio logger --- 
    engineio_logger = logging.getLogger('engineio.server')
    engineio_logger.setLevel(logging.WARNING) # 设置为 WARNING 或 ERROR 来隐藏 INFO 级别的 PING/PONG
    # 如果需要，可以添加 handler，但通常设置级别就足够了
    # engineio_logger.propagate = False # 可选：防止日志传递给根 logger

    # --- 新增：配置 geventwebsocket.handler logger --- 
    gws_logger = logging.getLogger('geventwebsocket.handler')
    gws_logger.setLevel(logging.WARNING)
    # --- 结束新增 ---

    print(f"Flask logger level set to: {logging.getLevelName(app.logger.getEffectiveLevel())}")
    # app.logger.info("Flask app logger initialized.")
    # --- End Flask Logging Configuration ---

    # --- Add SQLAlchemy Event Listener for SQL ---
    # Ensure this runs *after* db.init_app(app) has associated the engine
    # Using a function ensures we don't capture the wrong 'Engine' if redefined
    def setup_sql_listener():
        # Need to access the engine after it's initialized
        engine = db.get_engine(app) 
        if engine:
            @event.listens_for(engine, "before_cursor_execute", named=True)
            def before_cursor_execute(**kw):
                pass
                # print(f"SQL-----: {kw['statement']}")
                # print(f"PARAMS--: {kw['parameters']}")
        else:
            print("Warning: Could not get SQLAlchemy engine to attach listener.")
            
    # Use 'with app.app_context()' to ensure the engine is available
    with app.app_context():
        setup_sql_listener()
        print("SQLAlchemy event listener attached (or attempted).")
    # --- End Event Listener ---
    
    # --- 新增：注册错误处理器 ---
    ErrorHandler.register_handlers(app)
    app.logger.info("错误处理器已注册")
    # --- 结束新增 ---

    # JWT 错误处理 (保持不变)
    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return jsonify({
            'error': '无效的访问令牌',
            'message': str(error_string)
        }), 422
    
    @jwt.unauthorized_loader
    def unauthorized_callback(error_string):
        return jsonify({
            'error': '缺少访问令牌',
            'message': str(error_string)
        }), 401
    
    # 注册所有蓝图
    with app.app_context():
        # 导入和注册蓝图
        from app.routes.auth import auth_bp
        from app.routes.user import user_bp
        from app.routes.articles import articles_bp
        from app.routes.posts import posts_bp
        from app.routes.topics import topics_bp
        from app.routes.api import api_bp
        from app.routes.uploads import uploads_bp
        from app.routes.comments import comments_bp
        from app.routes.original_comments import comments_api_bp
        from app.routes.actions import actions_bp
        from app.routes.following import following_bp
        from app.routes.tools import tools_bp
        from app.routes.categories import categories_bp
        from app.routes.dynamics import dynamics_bp
        from app.routes.chat import chat_bp
        from app.routes.search import search_bp
        from app.routes.admin import admin_bp
        # 导入用户交互蓝图
        from app.routes.user_interactions import user_interactions_bp
        # 导入通知蓝图
        from app.routes.notifications import notifications_bp

        # 注册蓝图
        app.register_blueprint(auth_bp, url_prefix='/api/auth')
        app.register_blueprint(user_bp, url_prefix='/api/users')
        app.register_blueprint(articles_bp, url_prefix='/api/articles')
        app.register_blueprint(posts_bp, url_prefix='/api/posts')
        app.register_blueprint(topics_bp, url_prefix='/api')
        app.register_blueprint(api_bp, url_prefix='/api')
        app.register_blueprint(uploads_bp, url_prefix='/api/upload')
        app.register_blueprint(comments_bp, url_prefix='/api/comments')
        app.register_blueprint(comments_api_bp, url_prefix='/api/original-comments')
        app.register_blueprint(actions_bp, url_prefix='/api/actions')
        app.register_blueprint(following_bp, url_prefix='/api/following')
        app.register_blueprint(tools_bp, url_prefix='/api/tools')
        app.register_blueprint(categories_bp, url_prefix='/api/categories')
        app.register_blueprint(dynamics_bp, url_prefix='/api/dynamics')
        app.register_blueprint(chat_bp, url_prefix='/api/chat')
        app.register_blueprint(search_bp, url_prefix='/api/search')
        app.register_blueprint(admin_bp, url_prefix='/api/admin')
        # 注册用户交互蓝图
        app.register_blueprint(user_interactions_bp, url_prefix='/api')
        # 注册通知蓝图
        app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
        
        # 打印所有注册的路由，帮助调试
        print("\n===== 注册的路由 =====")
        for rule in app.url_map.iter_rules():
            print(f"{rule.endpoint}: {rule.rule}")
        print("=====================\n")
        
        # 注册 socketio 事件处理器
        from app.sockets.community_chat import register_community_chat_handlers
        register_community_chat_handlers(socketio)
        
        # 保存socketio实例到app，方便在其他模块中使用
        app.socketio = socketio

    # 全局错误处理 (不需要了，已由ErrorHandler处理)
    # @app.errorhandler(404)
    # def not_found(error):
    #     return jsonify({'error': 'Not found'}), 404
    
    # @app.errorhandler(500)
    # def internal_server_error(error):
    #     app.logger.error(f"内部服务器错误: {error}") # 记录详细错误
    #     return jsonify({'error': 'Internal server error'}), 500
    
    # SocketIO 事件处理 (保持不变)
    @socketio.on('connect')
    def handle_connect(auth=None):
        """
        处理Socket.IO客户端连接事件
        核心功能：验证用户令牌并将客户端与用户ID关联
        注意事项：
        1. 支持多种方式提取认证令牌(优先使用 connect 事件的 auth 参数)
        2. 维护sid_to_user字典实现用户身份追踪
        3. 认证失败不会断开连接，但用户无法发送消息
        """
        app.logger.info(f'Socket客户端连接: {request.sid}')
        app.logger.info(f'[Auth Connect] Received auth data: {auth}') # <-- 新增日志：记录收到的auth参数
        
        # 获取连接时的认证信息
        auth_data = None

        # --- 新增：优先从 auth 参数获取 token --- 
        if auth and isinstance(auth, dict) and 'token' in auth:
            auth_data = auth['token']
            app.logger.info(f'[Auth Connect] Token found in connect event auth argument.')
        # --- 结束新增 ---
        
        # 保留从 headers/args/environ 获取的后备逻辑
        if not auth_data and hasattr(request, 'headers') and request.headers.get('Authorization'):
            auth_data = request.headers.get('Authorization')
            if auth_data.startswith('Bearer '):
                auth_data = auth_data[7:]
                app.logger.info(f'[Auth Connect] Token found in Authorization header.')
        
        if not auth_data and hasattr(request, 'args') and 'token' in request.args:
             auth_data = request.args.get('token')
             app.logger.info(f'[Auth Connect] Token found in request.args.')

        # 如果找到了认证信息，尝试解析用户ID
        if auth_data:
            try:
                decoded = decode_token(auth_data)
                user_id = decoded['sub']
                # 存储sid到用户ID的映射
                sid_to_user[request.sid] = user_id
                app.logger.info(f'[Auth Connect] Token decoded successfully. Mapped SID {request.sid} to User ID {user_id}')
                app.logger.info(f'[Auth Connect] Current sid_to_user map size: {len(sid_to_user)}')
            except Exception as e:
                app.logger.error(f'[Auth Connect] Failed to decode token or map SID {request.sid}: {e}', exc_info=True)
        else:
            app.logger.warning(f'[Auth Connect] No auth token found for SID {request.sid} after checking auth arg, headers, and args.')
        
        try:
            emit('status', {'msg': '已连接到聊天服务器'})
        except Exception as e:
            app.logger.error(f'发送连接状态消息时出错: {e}')

    @socketio.on('connect_error')
    def handle_connect_error(error):
        """
        处理连接错误事件
        核心功能：记录连接错误，帮助调试问题
        """
        app.logger.error(f'Socket连接错误: {error}')

    # --- 新增：注册社区聊天事件处理器 --- 
    try:
        from app.sockets.community_chat import register_community_chat_handlers
        register_community_chat_handlers(socketio)
    except ImportError as e:
        app.logger.error(f"Failed to import or register community chat handlers: {e}", exc_info=True)
    # --- 结束新增 ---

    # --- 静态文件服务路由（修改：处理缓存文件服务）---
    @app.route('/static/uploads/<path:filename>')
    def serve_upload(filename):
        upload_dir = current_app.config.get('UPLOAD_FOLDER')
        if not upload_dir:
            current_app.logger.error("UPLOAD_FOLDER not configured.")
            abort(500)
        try:
            return send_from_directory(upload_dir, filename)
        except FileNotFoundError:
            abort(404)

    # --- 移除：不再需要文件缓存路由 --- 
    # @app.route('/static/image_cache/<path:filename>') 
    # def serve_cached_image(filename):
    #     cache_dir = current_app.config.get('IMAGE_CACHE_FOLDER')
    #     if not cache_dir:
    #         current_app.logger.error("IMAGE_CACHE_FOLDER not configured.")
    #         abort(500)
    #     try:
    #         return send_from_directory(cache_dir, filename)
    #     except FileNotFoundError:
    #         abort(404)
    # --- 结束移除 ---
            
    # --- 代理图片路由 (保持不变) --- 
    # 这个路由现在应该不需要了，因为我们直接在后端处理
    # 但为了兼容之前的代码，暂时保留。 图片代理的实现移至 api.py
    # @app.route('/api/proxy-image') 见 api.py
    
    # --- 结束文件服务路由 ---

    @app.route('/api/health')
    def health_check():
        return jsonify({
            'status': 'healthy',
            'message': '后端服务运行正常'
        }), 200

    @app.route('/')
    def index():
        # 返回到Vue前端首页
        return redirect('/index.html')
    
    # --- 修改：使用单独的函数延迟导入和启动图片预加载线程 ---
    @app.before_first_request
    def start_background_tasks():
        """启动后台任务"""
        # 为了避免在可能没有图片预加载功能的环境中出错
        try:
            from .utils.image_preloader import start_preload_thread
            # 设置标记以确保只启动一次
            if not hasattr(app, '_preload_started'):
                def setup_image_preload():
                        # 在应用上下文中启动预加载线程
                        start_preload_thread()
                        app._preload_started = True
                        app.logger.info("[*] 图片预加载线程已启动")
                    
                # 在子线程中延迟启动预加载，避免阻塞应用启动
                import threading
                threading.Timer(30, setup_image_preload).start()  # 延迟30秒启动
                app.logger.info("[*] 图片预加载将在30秒后启动")
        except ImportError:
            app.logger.warning("[!] 无法导入image_preloader模块，图片预加载功能未启用")
        except Exception as e:
            app.logger.error(f"[!] 启动图片预加载失败: {e}")
            
        # --- 修改：改进内存监控，防止多次启动 ---
        try:
            # 使用全局锁文件检查是否已经有监控任务在运行
            import os
            import atexit
            
            lock_file_path = os.path.join(os.path.dirname(app.root_path), 'instance', 'memory_monitor.lock')
            
            # 只在主进程中启动一次监控
            if not os.path.exists(lock_file_path) and not hasattr(app, '_memory_monitor_started'):
                # 创建锁文件
                with open(lock_file_path, 'w') as f:
                    f.write(str(os.getpid()))
                
                # 注册退出时删除锁文件
                def remove_lock_file():
                    try:
                        if os.path.exists(lock_file_path):
                            os.remove(lock_file_path)
                    except:
                        pass
                
                atexit.register(remove_lock_file)
                
                def memory_monitor_task():
                    """定期执行内存监控任务"""
                    # 检查锁文件是否存在且是当前进程
                    try:
                        if os.path.exists(lock_file_path):
                            with open(lock_file_path, 'r') as f:
                                pid = f.read().strip()
                                if pid != str(os.getpid()):
                                    return  # 不是当前进程创建的锁，不执行
                        else:
                            return  # 锁文件不存在，不执行
                            
                        with app.app_context():
                            app.logger.info("[*] 执行Redis内存监控")
                            monitor_memory_usage(app)
                        
                        # 每30分钟执行一次内存监控
                        import threading
                        threading.Timer(1800, memory_monitor_task).start()
                    except Exception as e:
                        app.logger.error(f"[!] 内存监控执行错误: {e}")
                
                # 启动内存监控线程
                import threading
                threading.Timer(60, memory_monitor_task).start()  # 应用启动60秒后开始监控
                app._memory_monitor_started = True
                app.logger.info("[*] Redis内存监控将在60秒后启动")
            else:
                app.logger.info("[*] 内存监控已在其他进程中启动，跳过")
        except Exception as e:
            app.logger.error(f"[!] 启动Redis内存监控失败: {e}")
        # --- 结束修改 ---

    @app.before_request
    def handle_precarious_options():
        # 检查是否是OPTIONS请求
        if request.method == 'OPTIONS':
            # 创建一个204 No Content响应
            response = app.make_response(('', 204))
            # 添加CORS头
            if request.headers.get('Origin'):
                response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin')
            else:
                response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Cache-Control, Pragma, Access-Control-Allow-Origin, Expires'
            response.headers['Access-Control-Max-Age'] = '3600'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            return response

    print("Flask 应用创建完成.")
    # --- 新增：强制全局禁用 strict_slashes --- 
    app.url_map.strict_slashes = False
    print("[*] 全局禁用 strict_slashes")
    # --- 结束新增 ---

    return app

# get_database_uri 函数移至 config.py
