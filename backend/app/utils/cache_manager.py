"""
缓存管理模块

提供基于Redis的分布式缓存管理功能，包括：
- 图片缓存：缓存从腾讯云COS获取的图片
- 数据缓存：缓存API响应和数据库查询结果
- 计数缓存：高频访问的计数器(如点赞数、评论数)

支持多级缓存策略、失效处理、自动续期等高级功能。
"""

from flask_caching import Cache
from flask import current_app, Flask
import logging
import time
import hashlib
from urllib.parse import urlparse, unquote
from functools import wraps
import json
import pickle
import re

# 创建Cache实例，延迟初始化
cache = Cache()

# 添加一个全局变量控制初始化
_cache_initialized = False

# 缓存键前缀
KEY_PREFIX = {
    'IMAGE': 'img:',        # 图片缓存
    'ARTICLE_IMG': 'img:article:',  # 文章图片
    'POST_IMG': 'img:post:', # 帖子图片
    'DYNAMIC_IMG': 'img:dyn:', # 动态图片
    'PROFILE_IMG': 'img:profile:', # 用户头像
    'COVER_IMG': 'img:cover:', # 封面图片
    'DATA': 'data:',        # 数据缓存
    'COUNT': 'count:',      # 计数器缓存
    'USER': 'user:',        # 用户数据缓存
    'ARTICLE': 'article:',  # 文章缓存
    'POST': 'post:',        # 帖子缓存
    'COMMENT': 'comment:'   # 评论缓存
}

# 缓存过期时间(秒)
TTL = {
    'IMAGE': 86400 * 7,       # 普通图片缓存7天（原本30天）
    'IMAGE_LONG': 86400 * 30,  # 图片长期缓存30天（原本90天）
    'ARTICLE_IMG': 86400 * 14, # 文章图片缓存14天（原本60天）
    'POST_IMG': 86400 * 10,    # 帖子图片缓存10天（原本45天）
    'DYNAMIC_IMG': 86400 * 5,  # 动态图片缓存5天（原本30天）
    'PROFILE_IMG': 86400 * 14, # 用户头像缓存14天（原本60天）
    'COVER_IMG': 86400 * 21,   # 封面图片缓存21天（原本60天）
    'DATA_SHORT': 60,       # 短期数据缓存1分钟
    'DATA_MEDIUM': 300,     # 中期数据缓存5分钟
    'DATA_LONG': 3600,      # 长期数据缓存1小时
    'COUNT': 60,            # 计数器缓存1分钟
    'USER': 600,            # 用户数据缓存10分钟
    'FOREVER': -1           # 永不过期
}

def init_app(app: Flask):
    """初始化缓存系统"""
    global _cache_initialized
    
    # 构建缓存配置
    cache_config = {
        'CACHE_TYPE': 'RedisCache',
        'CACHE_REDIS_URL': app.config.get('REDIS_URL', 'redis://localhost:6379/0'),
        'CACHE_DEFAULT_TIMEOUT': 300,  # 默认缓存5分钟
        'CACHE_KEY_PREFIX': 'synspirit:',  # 全局键前缀
        'CACHE_OPTIONS': {
            'socket_timeout': 5,  # 连接超时5秒（增加）
            'socket_connect_timeout': 5,
            'retry_on_timeout': True,
            'health_check_interval': 30  # 健康检查间隔30秒
        }
    }

    # 初始化缓存
    cache.init_app(app, config=cache_config)
    
    # 记录缓存初始化信息
    app.logger.info(f"缓存系统已初始化，类型: {cache_config['CACHE_TYPE']}, URL: {cache_config['CACHE_REDIS_URL']}")
    
    # 进一步配置只执行一次
    if not _cache_initialized:
        _cache_initialized = True
        
        # 尝试连接Redis验证配置
        try:
            cache.set('cache_test', 'ok')
            test_result = cache.get('cache_test')
            if test_result == 'ok':
                app.logger.info("Redis缓存连接测试成功")
            else:
                app.logger.warning(f"Redis缓存连接测试失败，返回值: {test_result}")
                
            # 检查并设置Redis配置
            try:
                import redis
                redis_client = redis.from_url(app.config.get('REDIS_URL', 'redis://localhost:6379/0'))
                
                # 尝试设置内存策略为LRU
                redis_client.config_set('maxmemory-policy', 'volatile-lru')
                app.logger.info("已设置Redis内存策略为volatile-lru")
                
                # 尝试提高Redis缓存数量上限（如果可能）
                try:
                    # 获取当前maxmemory设置
                    max_memory = redis_client.config_get('maxmemory').get('maxmemory', '')
                    
                    # 如果maxmemory没有设置或太小，设置为更大的值
                    if not max_memory or int(max_memory) < 100 * 1024 * 1024:  # 小于100MB
                        redis_client.config_set('maxmemory', '100mb')  # 设置为100MB
                        app.logger.info("已设置Redis最大内存为100MB")
                    else:
                        app.logger.info(f"当前Redis内存设置为: {max_memory} 字节")
                        
                    # 设置内存分配比例
                    # 使用Redis键空间通知以获取键过期事件
                    redis_client.config_set('notify-keyspace-events', 'Ex')
                    app.logger.info("已启用键空间通知，用于监控过期键")
                    
                    # 设置不同图片类型的内存配额
                    # 这是通过在客户端设置内存限制来实现的
                    # 实际上是设置Redis中特定前缀的键的占用比例
                    memory_quotas = {
                        'article': 0.20,  # 文章图片最多占用20%内存
                        'post': 0.15,     # 帖子图片最多占用15%内存
                        'dynamic': 0.10,  # 动态图片最多占用10%内存
                        'profile': 0.05,  # 用户头像最多占用5%内存
                        'cover': 0.05,    # 封面图片最多占用5%内存
                        'general': 0.05   # 通用图片最多占用5%内存
                    }
                    
                    # 将内存配额信息存储在Redis中，以便管理和监控
                    quota_key = 'synspirit:cache:memory_quotas'
                    redis_client.set(quota_key, str(memory_quotas))
                    app.logger.info(f"已设置内存配额: {memory_quotas}")
                    
                    # 设置内存使用监控
                    app.logger.info("正在配置内存使用监控...")
                    
                    # 禁用RDB持久化，使用内存缓存提高性能
                    redis_client.config_set('save', '')
                    app.logger.info("已禁用RDB持久化以提高性能")
                    
                except Exception as e:
                    app.logger.warning(f"设置Redis内存限制失败: {e}")
                
            except Exception as e:
                app.logger.warning(f"配置Redis参数失败: {e}")
                
        except Exception as e:
            app.logger.error(f"Redis缓存连接测试出现异常: {e}")

# 新增：精细的内存管理辅助方法
def monitor_memory_usage(app, redis_client=None):
    """监控Redis内存使用情况，并在接近限制时主动清理"""
    if not redis_client:
        try:
            import redis
            redis_client = redis.from_url(app.config.get('REDIS_URL', 'redis://localhost:6379/0'))
        except Exception as e:
            app.logger.error(f"创建Redis客户端失败: {e}")
            return False
    
    try:
        # 获取内存信息
        info = redis_client.info('memory')
        used_memory = info.get('used_memory', 0)
        max_memory = info.get('maxmemory', 0)
        
        # 如果使用的内存超过最大内存的80%，进行主动清理
        if max_memory > 0 and used_memory > max_memory * 0.8:
            app.logger.warning(f"Redis内存使用率高: {used_memory / max_memory:.1%}")
            
            # 获取内存配额信息
            quota_key = 'synspirit:cache:memory_quotas'
            quotas_str = redis_client.get(quota_key)
            
            if quotas_str:
                import ast
                quotas = ast.literal_eval(quotas_str.decode('utf-8'))
                
                # 检查每种图片类型的键数量和内存使用情况
                for prefix_key, prefix_value in KEY_PREFIX.items():
                    if prefix_key.endswith('_IMG') or prefix_key == 'IMAGE':
                        # 获取该前缀下的键
                        keys = redis_client.keys(f"synspirit:{prefix_value}*")
                        if keys:
                            # 随机抽样检查内存占用
                            sample_key = keys[0]
                            key_memory = redis_client.memory_usage(sample_key)
                            avg_key_size = key_memory if key_memory else 1000  # 默认1KB
                            
                            # 估算该类型图片占用的总内存
                            est_memory = len(keys) * avg_key_size
                            
                            # 获取该类型的内存配额
                            img_type = prefix_key.replace('_IMG', '').lower()
                            if img_type not in quotas and img_type != 'image':
                                img_type = 'general'
                            
                            quota = quotas.get(img_type, 0.1)  # 默认10%
                            max_allowed = max_memory * quota
                            
                            # 如果超出配额，删除最旧的键
                            if est_memory > max_allowed:
                                # 计算需要删除的键数量
                                to_delete = int((est_memory - max_allowed) / avg_key_size) + 1
                                to_delete = min(to_delete, len(keys))
                                
                                app.logger.warning(f"类型 {img_type} 图片缓存超出配额，将删除 {to_delete} 个最旧键")
                                
                                # 使用TTL排序，先删除即将过期的键
                                keys_with_ttl = [(k, redis_client.ttl(k)) for k in keys[:to_delete*2]]
                                keys_with_ttl.sort(key=lambda x: x[1])  # 按TTL排序
                                
                                # 删除最旧的键
                                for k, _ in keys_with_ttl[:to_delete]:
                                    redis_client.delete(k)
                                    
                app.logger.info("内存使用检查和清理完成")
            else:
                app.logger.warning("未找到内存配额信息，无法执行精细清理")
                
                # 备用方案：随机删除10%的图片缓存
                all_image_keys = redis_client.keys("synspirit:img:*")
                if all_image_keys:
                    import random
                    to_delete = max(int(len(all_image_keys) * 0.1), 1)
                    keys_to_delete = random.sample(all_image_keys, to_delete)
                    for k in keys_to_delete:
                        redis_client.delete(k)
                    app.logger.info(f"已随机删除 {len(keys_to_delete)} 个图片缓存键")
        else:
            # 内存使用正常，改为不记录日志
            # app.logger.debug(f"Redis内存使用正常: {used_memory / max_memory:.1%}" if max_memory > 0 else "无法获取内存使用率")
            pass
            
        return True
    except Exception as e:
        app.logger.error(f"监控Redis内存使用失败: {e}")
        return False

class ImageCache:
    """图片缓存管理"""
    
    # 储存统计数据
    stats = {
        'cache_hits': 0,
        'cache_misses': 0,
        'cache_stores': 0,
        'cache_errors': 0,
        'by_type': {
            'article': {'hits': 0, 'misses': 0, 'stores': 0},
            'post': {'hits': 0, 'misses': 0, 'stores': 0},
            'dynamic': {'hits': 0, 'misses': 0, 'stores': 0},
            'profile': {'hits': 0, 'misses': 0, 'stores': 0},
            'cover': {'hits': 0, 'misses': 0, 'stores': 0},
            'general': {'hits': 0, 'misses': 0, 'stores': 0},
        }
    }
    
    # 新增：缓存允许的图片域名列表 (包括主要的图片存储服务)
    ALLOWED_DOMAINS = [
        'synspirit-test-1313131901.cos.ap-shanghai.myqcloud.com',  # 腾讯云COS
        'localhost',  # 本地开发
        '127.0.0.1',  # 本地开发
    ]
    
    # 新增：文件扩展名正则表达式
    IMAGE_EXT_PATTERN = re.compile(r'\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|$|#)', re.IGNORECASE)
    
    # 图片类型URL模式匹配，用于自动识别图片类型
    IMAGE_TYPE_PATTERNS = [
        (re.compile(r'/articles?/|/article-|article_', re.IGNORECASE), 'article'),
        (re.compile(r'/posts?/|/post-|post_', re.IGNORECASE), 'post'),
        (re.compile(r'/dynamic|/moments', re.IGNORECASE), 'dynamic'),
        (re.compile(r'/avatar|/profile-pic|/user-pic', re.IGNORECASE), 'profile'),
        (re.compile(r'/cover|/banner|/header', re.IGNORECASE), 'cover'),
    ]
    
    @staticmethod
    def detect_image_type(url):
        """根据URL特征检测图片类型"""
        try:
            for pattern, image_type in ImageCache.IMAGE_TYPE_PATTERNS:
                if pattern.search(url):
                    return image_type
            return 'general'  # 默认为通用类型
        except:
            return 'general'
    
    @staticmethod
    def get_prefix_for_type(image_type):
        """获取不同图片类型的缓存前缀"""
        key_map = {
            'article': KEY_PREFIX['ARTICLE_IMG'],
            'post': KEY_PREFIX['POST_IMG'],
            'dynamic': KEY_PREFIX['DYNAMIC_IMG'],
            'profile': KEY_PREFIX['PROFILE_IMG'],
            'cover': KEY_PREFIX['COVER_IMG'],
            'general': KEY_PREFIX['IMAGE']
        }
        return key_map.get(image_type, KEY_PREFIX['IMAGE'])
    
    @staticmethod
    def get_ttl_for_type(image_type, size=None):
        """获取不同图片类型的缓存TTL"""
        # 基础TTL映射
        ttl_map = {
            'article': TTL['ARTICLE_IMG'],
            'post': TTL['POST_IMG'],
            'dynamic': TTL['DYNAMIC_IMG'],
            'profile': TTL['PROFILE_IMG'],
            'cover': TTL['COVER_IMG'],
            'general': TTL['IMAGE']
        }
        
        # 获取基础TTL
        base_ttl = ttl_map.get(image_type, TTL['IMAGE'])
        
        # 小图片使用更长的缓存时间
        if size and size < 100 * 1024:  # 100KB以下
            return max(base_ttl, TTL['IMAGE_LONG'])  # 使用更长的缓存时间
            
        return base_ttl
    
    @staticmethod
    def get_key(url, image_type=None):
        """根据URL生成缓存键"""
        # 安全检查：确保URL是字符串
        if not isinstance(url, str):
            current_app.logger.warning(f"图片URL不是字符串: {type(url)}")
            return None
        
        # Debug日志
        if len(url) > 50:
            log_url = f"{url[:50]}..."
        else:
            log_url = url
        current_app.logger.debug(f"处理图片URL: {log_url}")
        
        # 检查URL是否是有效的图片URL
        parsed_url = urlparse(url)
        
        # 检查域名是否在允许列表中（可选）
        # domain_allowed = False
        # for allowed_domain in ImageCache.ALLOWED_DOMAINS:
        #     if allowed_domain in parsed_url.netloc:
        #         domain_allowed = True
        #         break
        
        # 允许所有域名的图片缓存
        domain_allowed = True
            
        # 检查URL是否看起来像图片URL
        is_image_url = bool(ImageCache.IMAGE_EXT_PATTERN.search(parsed_url.path))
            
        # 如果URL不符合条件，返回None
        if not domain_allowed:
            current_app.logger.warning(f"图片URL域名不允许缓存: {log_url}")
            return None
        
        # 即使不是典型的图片URL，也尝试缓存，因为有些图片没有扩展名
        if not is_image_url:
            current_app.logger.debug(f"URL看起来不像图片URL，但仍会尝试缓存: {log_url}")
        
        # 如果未指定图片类型，则自动检测
        if image_type is None:
            image_type = ImageCache.detect_image_type(url)
            
        # 获取对应类型的前缀
        prefix = ImageCache.get_prefix_for_type(image_type)
            
        # 使用URL的MD5哈希作为缓存键
        url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
        key = f"{prefix}{url_hash}"
        current_app.logger.debug(f"生成缓存键: {key} (类型: {image_type})")
        return key, image_type

    @staticmethod
    def get(url, image_type=None):
        """获取图片缓存"""
        key_result = ImageCache.get_key(url, image_type)
        if not key_result:
            current_app.logger.warning(f"未能为URL生成缓存键: {url[:50]}...")
            ImageCache.stats['cache_errors'] += 1
            return None
            
        key, detected_type = key_result
            
        # 返回格式为元组 (image_data, content_type)
        result = cache.get(key)
        
        # 更新统计信息
        if result:
            # 命中日志从DEBUG降级到TRACE级别(实际上Python没有TRACE级别，所以这里不记录日志)
            # current_app.logger.debug(f"缓存命中: {key}")
            ImageCache.stats['cache_hits'] += 1
            ImageCache.stats['by_type'][detected_type]['hits'] += 1
        else:
            # 未命中日志从DEBUG降级到TRACE级别(实际上Python没有TRACE级别，所以这里不记录日志)
            # current_app.logger.debug(f"缓存未命中: {key}")
            ImageCache.stats['cache_misses'] += 1
            ImageCache.stats['by_type'][detected_type]['misses'] += 1
            
            # 尝试查找使用通用前缀的版本 (兼容之前的缓存键)
            if detected_type != 'general':
                general_key = f"{KEY_PREFIX['IMAGE']}{hashlib.md5(url.encode('utf-8')).hexdigest()}"
                result = cache.get(general_key)
                if result:
                    # 改为不记录日志，减少日志量
                    # current_app.logger.debug(f"通用缓存命中: {general_key}")
                    ImageCache.stats['cache_hits'] += 1
                    ImageCache.stats['by_type']['general']['hits'] += 1
                    
                    # 将旧格式缓存复制到新格式
                    try:
                        cache.set(key, result, timeout=ImageCache.get_ttl_for_type(detected_type))
                        # 改为不记录日志，减少日志量
                        # current_app.logger.debug(f"已复制旧缓存到新键: {general_key} -> {key}")
                    except:
                        pass
        
        return result
        
    @staticmethod
    def set(url, data, content_type, image_type=None, ttl=None):
        """将图片数据存入缓存"""
        if not current_app:
            # 如果没有应用上下文，可能无法记录日志或访问配置
            print(f"警告: 尝试在没有应用上下文的情况下缓存图片: {url}")
            return False
            
        # 大图片策略：超过1MB的图片缩短缓存时间
        is_large_image = len(data) > 1024 * 1024  # 1MB
            
        key_info = ImageCache.get_key(url, image_type)
        if not key_info:
            ImageCache.stats['cache_errors'] += 1
            current_app.logger.error(f"无法为图片生成有效的缓存键，跳过缓存: {url}")
            return False

        actual_cache_key = key_info[0]
        determined_image_type = key_info[1]

        final_image_type = determined_image_type

        # 对大图片使用更短的缓存时间
        final_ttl = ttl
        if final_ttl is None:
            final_ttl = ImageCache.get_ttl_for_type(final_image_type, len(data))
            if is_large_image:
                final_ttl = min(final_ttl, 86400 * 3)  # 最多3天
        
        # 存储时包含内容类型，以便后续正确提供服务
        value_to_cache = {
            'data': data,
            'content_type': content_type
        }
        
        try:
            # 在存储大量数据前检查内存状况
            if is_large_image:
                try:
                    import redis
                    redis_client = redis.from_url(current_app.config.get('REDIS_URL', 'redis://localhost:6379/0'))
                    monitor_memory_usage(current_app, redis_client)
                except Exception as e:
                    current_app.logger.warning(f"内存检查失败: {e}")
            
            # 使用 pickle 序列化字典对象
            pickled_value = pickle.dumps(value_to_cache)
            
            # 使用实际的键字符串进行缓存
            cache.set(actual_cache_key, pickled_value, timeout=final_ttl if final_ttl != -1 else None) # cache.set timeout=None 表示永不过期
            ImageCache.stats['cache_stores'] += 1
            if final_image_type and final_image_type in ImageCache.stats['by_type']:
                 ImageCache.stats['by_type'][final_image_type]['stores'] += 1
            current_app.logger.debug(f"图片已缓存: {actual_cache_key} (类型: {final_image_type}, 大小: {len(data)/1024:.1f}KB, TTL: {final_ttl})")
            return True
        except Exception as e:
            ImageCache.stats['cache_errors'] += 1
            current_app.logger.error(f"缓存图片失败 {actual_cache_key} (类型: {final_image_type}): {e}", exc_info=True)
            return False
    
    @staticmethod
    def delete(url, image_type=None):
        """删除图片缓存"""
        key_result = ImageCache.get_key(url, image_type)
        if key_result:
            key, _ = key_result
            current_app.logger.debug(f"删除缓存: {key}")
            return cache.delete(key)
        return False
        
    @staticmethod
    def get_stats():
        """获取缓存统计信息"""
        # 计算每种类型的缓存命中率
        for img_type in ImageCache.stats['by_type']:
            type_stats = ImageCache.stats['by_type'][img_type]
            total = type_stats['hits'] + type_stats['misses']
            type_stats['hit_ratio'] = type_stats['hits'] / total if total > 0 else 0
        
        return {
            **ImageCache.stats,
            'hit_ratio': ImageCache.stats['cache_hits'] / (ImageCache.stats['cache_hits'] + ImageCache.stats['cache_misses']) if (ImageCache.stats['cache_hits'] + ImageCache.stats['cache_misses']) > 0 else 0
        }


class DataCache:
    """数据缓存管理
    
    提供函数结果缓存和缓存一致性控制：
    1. 支持缓存依赖关系
    2. 支持缓存分组和批量失效
    3. 支持基于事件的缓存更新
    """
    
    # 存储依赖关系的字典: {'prefix:key': ['dependent_prefix:key1', 'dependent_prefix:key2']}
    _dependencies = {}
    
    # 存储分组信息的字典: {'group_name': ['prefix:key1', 'prefix:key2']}
    _groups = {}
    
    # 缓存命中统计
    stats = {
        'hits': 0,
        'misses': 0,
        'invalidations': 0,
        'group_invalidations': 0
    }
    
    @staticmethod
    def make_key(prefix, *args):
        """根据前缀和参数生成缓存键"""
        if not args:
            return f"{prefix}"
            
        # 序列化参数
        serialized_args = []
        for arg in args:
            if isinstance(arg, (str, int, float, bool, type(None))):
                serialized_args.append(str(arg))
            else:
                # 复杂对象序列化
                try:
                    # 对于非原始类型，尝试将其序列化为JSON
                    import json
                    serialized_args.append(json.dumps(arg, sort_keys=True))
                except (TypeError, ValueError):
                    # 不可JSON序列化的对象，使用哈希
                    serialized_args.append(hashlib.md5(pickle.dumps(arg)).hexdigest())
        
        # 创建键
        key_parts = [prefix]
        key_parts.extend(serialized_args)
        return ':'.join(key_parts)

    @staticmethod
    def cached(prefix, ttl=TTL['DATA_MEDIUM'], depends_on=None, group=None):
        """缓存装饰器
        
        Args:
            prefix: 缓存键前缀
            ttl: 缓存过期时间(秒)
            depends_on: 依赖关系列表，格式为[(prefix, *args), ...]
            group: 所属分组名称
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # 构建缓存键
                cache_key = DataCache.make_key(prefix, *args, *kwargs.values())
                
                # 检查缓存
                cached_result = cache.get(cache_key)
                if cached_result is not None:
                    DataCache.stats['hits'] += 1
                    # 如果找到缓存，返回结果 - 降低日志级别为TRACE (实际不记录)
                    # current_app.logger.debug(f"缓存命中: {cache_key}")
                    return pickle.loads(cached_result)
                
                # 缓存未命中，执行原始函数
                DataCache.stats['misses'] += 1
                result = func(*args, **kwargs)
                
                # 将结果存入缓存
                try:
                    pickled_result = pickle.dumps(result)
                    cache.set(cache_key, pickled_result, timeout=ttl)
                    
                    # 保存依赖关系
                    if depends_on:
                        for dep in depends_on:
                            dep_prefix = dep[0]
                            dep_args = dep[1:] if len(dep) > 1 else []
                            dep_key = DataCache.make_key(dep_prefix, *dep_args)
                            
                            if dep_key not in DataCache._dependencies:
                                DataCache._dependencies[dep_key] = []
                            
                            if cache_key not in DataCache._dependencies[dep_key]:
                                DataCache._dependencies[dep_key].append(cache_key)
                    
                    # 保存分组信息
                    if group:
                        if group not in DataCache._groups:
                            DataCache._groups[group] = []
                        
                        if cache_key not in DataCache._groups[group]:
                            DataCache._groups[group].append(cache_key)
                    
                    # 改为不记录日志，减少日志量
                    # current_app.logger.debug(f"缓存已设置: {cache_key}")
                except Exception as e:
                    current_app.logger.error(f"缓存设置失败 {cache_key}: {e}")
                
                return result
            return wrapper
        return decorator

    @staticmethod
    def invalidate(prefix, *args):
        """失效单个缓存项及其依赖项
        
        Args:
            prefix: 缓存键前缀
            args: 缓存键参数
            
        Returns:
            int: 失效的缓存项数量
        """
        cache_key = DataCache.make_key(prefix, *args)
        count = 0
        
        try:
            # 删除当前缓存项
            cache.delete(cache_key)
            count += 1
            DataCache.stats['invalidations'] += 1
            
            # 检查并删除依赖于此项的所有缓存
            if cache_key in DataCache._dependencies:
                dependent_keys = DataCache._dependencies[cache_key]
                for dep_key in dependent_keys:
                    cache.delete(dep_key)
                    count += 1
                    DataCache.stats['invalidations'] += 1
                    
                # 清理依赖记录
                del DataCache._dependencies[cache_key]
            
            # 更新分组信息，从所有分组中移除此缓存键
            for group_name, keys in DataCache._groups.items():
                if cache_key in keys:
                    DataCache._groups[group_name].remove(cache_key)
            
            # 将日志级别提高到INFO级别
            if count > 1:
                current_app.logger.info(f"已失效缓存项 {cache_key} 及 {count-1} 个依赖项")
            else:
                # 单个键失效不记录日志，减少日志量
                pass
        except Exception as e:
            current_app.logger.error(f"缓存失效操作失败 {cache_key}: {e}")
        
        return count
    
    @staticmethod
    def invalidate_group(group_name):
        """失效整个分组的缓存
        
        Args:
            group_name: 分组名称
            
        Returns:
            int: 失效的缓存项数量
        """
        count = 0
        
        if group_name in DataCache._groups:
            keys = DataCache._groups[group_name].copy()
            for key in keys:
                cache.delete(key)
                count += 1
            
            # 清空分组
            DataCache._groups[group_name] = []
            DataCache.stats['group_invalidations'] += 1
            
            current_app.logger.debug(f"已失效分组 {group_name} 中的 {count} 个缓存项")
        
        return count
        
    @staticmethod
    def invalidate_pattern(pattern):
        """基于模式失效缓存
        
        Args:
            pattern: Redis键模式，如 "synspirit:article:*"
            
        Returns:
            int: 失效的缓存项数量
        """
        count = 0
        try:
            redis_client = cache._write_client
            keys = redis_client.keys(pattern)
            
            if keys:
                count = len(keys)
                redis_client.delete(*keys)
                DataCache.stats['invalidations'] += count
                
                current_app.logger.debug(f"已删除 {count} 个匹配模式 {pattern} 的缓存项")
        except Exception as e:
            current_app.logger.error(f"模式删除失败 {pattern}: {e}")
        
        return count
    
    @staticmethod
    def get_stats():
        """获取缓存统计信息"""
        hit_ratio = 0
        total = DataCache.stats['hits'] + DataCache.stats['misses']
        if total > 0:
            hit_ratio = DataCache.stats['hits'] / total
            
        return {
            'hits': DataCache.stats['hits'],
            'misses': DataCache.stats['misses'],
            'invalidations': DataCache.stats['invalidations'],
            'group_invalidations': DataCache.stats['group_invalidations'],
            'hit_ratio': hit_ratio,
            'groups': {group: len(keys) for group, keys in DataCache._groups.items()},
            'dependencies': len(DataCache._dependencies)
        }


class CounterCache:
    """计数器缓存管理，用于点赞数、收藏数、评论数等"""
    
    @staticmethod
    def get_counter_key(counter_type, target_type, target_id):
        """获取计数器缓存键
        
        Args:
            counter_type: 计数器类型（如'likes', 'collects', 'comments'）
            target_type: 目标类型（如'article', 'post'）
            target_id: 目标ID
        """
        return f"{KEY_PREFIX['COUNT']}{target_type}:{target_id}:{counter_type}"
    
    @staticmethod
    def get(counter_type, target_type, target_id, default=None):
        """获取计数"""
        key = CounterCache.get_counter_key(counter_type, target_type, target_id)
        value = cache.get(key)
        return value if value is not None else default
    
    @staticmethod
    def set(counter_type, target_type, target_id, value, ttl=TTL['COUNT']):
        """设置计数"""
        key = CounterCache.get_counter_key(counter_type, target_type, target_id)
        return cache.set(key, value, timeout=ttl)
    
    @staticmethod
    def increment(counter_type, target_type, target_id, delta=1):
        """增加计数"""
        key = CounterCache.get_counter_key(counter_type, target_type, target_id)
        # 获取当前值
        current_value = cache.get(key)
        if current_value is None:
            # 如果键不存在，设置为delta
            cache.set(key, delta, timeout=TTL['COUNT'])
            return delta
        else:
            # 如果键存在，增加delta
            new_value = current_value + delta
            cache.set(key, new_value, timeout=TTL['COUNT'])
            return new_value
    
    @staticmethod
    def decrement(counter_type, target_type, target_id, delta=1):
        """减少计数"""
        return CounterCache.increment(counter_type, target_type, target_id, -delta)


class CacheStats:
    """提供缓存统计信息"""
    
    @staticmethod
    def get_stats():
        """获取所有缓存统计信息"""
        try:
            # 获取Redis信息
            redis_info = {}
            try:
                redis_client = cache._write_client
                info = redis_client.info()
                redis_info = {
                    'used_memory_human': info.get('used_memory_human', 'unknown'),
                    'maxmemory_human': info.get('maxmemory_human', 'unknown'),
                    'hit_rate': 0,
                    'connected_clients': info.get('connected_clients', 0),
                    'uptime_in_days': info.get('uptime_in_days', 0)
                }
                
                # 计算命中率
                hits = info.get('keyspace_hits', 0)
                misses = info.get('keyspace_misses', 0)
                total = hits + misses
                if total > 0:
                    redis_info['hit_rate'] = hits / total
            except Exception as e:
                current_app.logger.error(f"获取Redis信息失败: {e}")
                
            return {
                'redis': redis_info,
                'image_cache_stats': ImageCache.get_stats(),
                'data_cache_stats': DataCache.get_stats(),
                'counter_cache_hits': CounterCache.stats if hasattr(CounterCache, 'stats') else {}
            }
        except Exception as e:
            current_app.logger.error(f"获取缓存统计失败: {e}")
            return {'error': str(e)} 