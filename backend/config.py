import os

# --- Database Configuration ---
SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
                          f'postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
SQLALCHEMY_TRACK_MODIFICATIONS = False
# Enable SQLAlchemy query logging
SQLALCHEMY_ECHO = True

# --- Cache Configuration ---
CACHE_TYPE = 'redis'
CACHE_REDIS_HOST = os.environ.get('REDIS_HOST') or 'localhost'
CACHE_REDIS_PORT = int(os.environ.get('REDIS_PORT') or 6379)
CACHE_REDIS_DB = int(os.environ.get('REDIS_DB') or 0)
CACHE_REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD') or None
CACHE_DEFAULT_TIMEOUT = 300 # Default cache timeout in seconds (5 minutes) 