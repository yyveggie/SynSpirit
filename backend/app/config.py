import os
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

# API相关配置
API_HOST = os.getenv('API_HOST', '0.0.0.0')  # 确保默认值是有效的IP
API_PORT = int(os.getenv('API_PORT', 5001))  # 确保默认端口是数字
API_DEBUG = os.getenv('API_DEBUG', 'True').lower() == 'true'

# 安全相关配置
SECRET_KEY = os.getenv('SECRET_KEY', 'dev_secret_key_12345')
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt_secret_key_67890')
JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * 24 * 30  # 30天
JWT_TOKEN_LOCATION = ['headers']
JWT_HEADER_NAME = 'Authorization'
JWT_HEADER_TYPE = 'Bearer'

# 数据库配置
DB_TYPE = os.getenv('DB_TYPE', 'sqlite')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME')
SQLALCHEMY_TRACK_MODIFICATIONS = False
SQLALCHEMY_ECHO = False

# --- SQLAlchemy 配置 ---
# SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://user:password@host:port/dbname') # 确保这个配置是正确的
SQLALCHEMY_POOL_SIZE = 20       # 池中保持的最小连接数
SQLALCHEMY_MAX_OVERFLOW = 10    # 允许池大小临时超出的连接数
SQLALCHEMY_POOL_TIMEOUT = 30      # 获取连接的超时时间 (秒)
SQLALCHEMY_POOL_RECYCLE = 1800    # 连接自动回收时间 (秒，例如 30 分钟)

# Redis配置
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

# 上传文件配置
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))  # 默认16MB

# --- 新增：图片缓存配置 ---
IMAGE_CACHE_DIR_NAME = os.getenv('IMAGE_CACHE_DIR_NAME', 'image_cache') # 缓存目录名称
# --- 结束新增 ---

# 腾讯云COS配置
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
COS_BUCKET_NAME = os.getenv('COS_BUCKET_NAME')
COS_ENDPOINT_URL = os.getenv('COS_ENDPOINT_URL')
COS_REGION_NAME = os.getenv('COS_REGION_NAME')
COS_PUBLIC_DOMAIN = os.getenv('COS_PUBLIC_DOMAIN')

# LLM Provider配置
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'grok')
GROK_API_KEY = os.getenv('GROK_API_KEY')
GROK_BASE_URL = os.getenv('GROK_BASE_URL', 'https://api.x.ai/v1')
GROK_MODEL_NAME = os.getenv('GROK_MODEL_NAME', 'grok-3-latest')

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL_NAME = os.getenv('OPENAI_MODEL_NAME', 'gpt-4o')

DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY')
DEEPSEEK_MODEL_NAME = os.getenv('DEEPSEEK_MODEL_NAME', 'deepseek-chat')

QWEN_API_KEY = os.getenv('QWEN_API_KEY')
QWEN_MODEL_NAME = os.getenv('QWEN_MODEL_NAME', 'qwen-plus')

# CORS配置
CORS_ORIGINS = [
    "http://localhost:3000", 
    "http://localhost:3001", 
    "http://localhost:5001", 
    "*"
]

# 获取数据库URI
def get_database_uri():
    """构建数据库URI"""
    if DB_TYPE == 'postgresql':
        return f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
    else:
        # 默认使用SQLite
        return 'sqlite:///' + os.path.join(os.path.abspath(os.path.dirname(__file__)), 'ai_tools.db')

# 移除干扰启动脚本的调试输出
# print(f"[配置] API_HOST={API_HOST}, API_PORT={API_PORT}")