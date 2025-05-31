"""
扩展模块，用于集中管理Flask扩展
"""

import redis
from flask import current_app

# 从缓存管理器获取Redis客户端
def get_redis_client():
    """获取Redis客户端实例"""
    from app.utils.cache_manager import cache
    if hasattr(cache, '_write_client'):
        return cache._write_client
    else:
        # 如果缓存管理器未初始化，则直接创建Redis客户端
        redis_url = current_app.config.get('REDIS_URL', 'redis://localhost:6379/0')
        return redis.from_url(redis_url)

# 导出Redis客户端
redis_client = get_redis_client() 