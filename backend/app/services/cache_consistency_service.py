"""
缓存一致性服务

提供工业级缓存一致性保证：
1. 写操作事务性管理
2. 分布式锁支持
3. 延迟双删策略
4. 缓存雪崩和缓存击穿防护
5. 布隆过滤器防缓存穿透
"""

import logging
import redis
import time
import threading
import hashlib
import pickle
import random
from functools import wraps
from flask import current_app
from app.utils.cache_manager import cache, DataCache, CounterCache, KEY_PREFIX, TTL
import uuid
from flask import has_app_context

# 创建logger
logger = logging.getLogger(__name__)

class CacheLock:
    """分布式锁实现，基于Redis"""
    
    @staticmethod
    def acquire_lock(lock_name, timeout=10, expire=15):
        """
        获取分布式锁
        
        Args:
            lock_name: 锁名称
            timeout: 获取锁超时时间（秒）
            expire: 锁过期时间（秒）
            
        Returns:
            bool: 是否成功获取锁
            str: 锁标识符
        """
        redis_client = cache._write_client
        identifier = str(random.randint(0, 1000000000))
        lock_key = f"synspirit:lock:{lock_name}"
        
        end_time = time.time() + timeout
        
        # 尝试获取锁，直到超时
        while time.time() < end_time:
            # 设置锁，如果不存在
            if redis_client.set(lock_key, identifier, ex=expire, nx=True):
                # 降低日志级别，减少日志量
                # logger.debug(f"获取到锁: {lock_name}, 标识: {identifier}")
                return True, identifier
            
            # 短暂等待后重试
            time.sleep(0.1)
        
        logger.warning(f"获取锁超时: {lock_name}")
        return False, None
    
    @staticmethod
    def release_lock(lock_name, identifier):
        """
        释放分布式锁
        
        Args:
            lock_name: 锁名称
            identifier: 锁标识符
            
        Returns:
            bool: 是否成功释放锁
        """
        redis_client = cache._write_client
        lock_key = f"synspirit:lock:{lock_name}"
        
        # 保证只删除自己的锁
        pipe = redis_client.pipeline(True)
        try:
            # 监视锁键
            pipe.watch(lock_key)
            # 验证锁的所有者
            current_identifier = pipe.get(lock_key)
            
            if current_identifier and current_identifier.decode('utf-8') == identifier:
                # 删除锁
                pipe.multi()
                pipe.delete(lock_key)
                pipe.execute()
                # 降低日志级别，减少日志量
                # logger.debug(f"释放锁成功: {lock_name}, 标识: {identifier}")
                return True
            else:
                # 解锁已过期或被他人持有的锁
                pipe.unwatch()
                logger.warning(f"尝试释放非自己持有的锁: {lock_name}, 标识: {identifier}")
                return False
        except redis.exceptions.WatchError:
            logger.error(f"锁竞争导致释放失败: {lock_name}")
            return False
        except Exception as e:
            logger.error(f"释放锁出错: {lock_name}, 错误: {e}")
            return False

class CacheConsistency:
    """缓存一致性管理"""
    
    # 布隆过滤器键
    BLOOM_FILTER_KEY = "synspirit:bloom:cache_keys"
    
    @staticmethod
    def with_cache_lock(lock_name_prefix):
        """
        分布式锁装饰器，确保数据和缓存更新的一致性
        
        Args:
            lock_name_prefix: 锁名称前缀，实际锁名由前缀和被装饰方法的参数组成
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # 提取第一个参数，通常是被操作对象的ID
                lock_id = args[1] if len(args) > 1 else next(iter(kwargs.values())) if kwargs else "global"
                lock_name = f"{lock_name_prefix}:{lock_id}"
                
                # 尝试获取锁
                lock_acquired, lock_identifier = CacheLock.acquire_lock(lock_name)
                
                result = None
                try:
                    if lock_acquired:
                        # 执行原始方法
                        result = func(*args, **kwargs)
                        return result
                    else:
                        # 未获取到锁，等待然后从缓存读取
                        logger.warning(f"未获取到锁 {lock_name}，等待后从缓存读取")
                        time.sleep(0.5)  # 短暂等待
                        
                        # 尝试从缓存获取（如果是读操作）
                        if func.__name__.startswith('get_'):
                            # 为简化，这里假设从缓存读取的逻辑
                            # 在实际应用中，应该有明确的缓存读取路径
                            logger.info(f"从缓存读取: {lock_name}")
                        else:
                            # 写操作必须等待锁
                            logger.warning(f"写操作未获取到锁: {lock_name}, 操作可能被跳过")
                            
                        return result
                finally:
                    # 释放锁
                    if lock_acquired:
                        CacheLock.release_lock(lock_name, lock_identifier)
            
            return wrapper
        return decorator
    
    @staticmethod
    def delayed_double_deletion(cache_key, delay=0.5):
        """
        延迟双删策略实现
        
        先删除缓存，再更新数据库，然后延迟一段时间再次删除缓存
        这样可以有效避免缓存不一致问题
        
        Args:
            cache_key: 要删除的缓存键
            delay: 第二次删除的延迟时间（秒）
        """
        # 第一次删除缓存
        try:
            cache.delete(cache_key)
            # 降低日志级别，减少日志量
            # logger.debug(f"延迟双删: 第一次删除缓存 {cache_key}")
            
            # 在后台线程中执行延迟删除
            def delayed_delete():
                time.sleep(delay)
                try:
                    cache.delete(cache_key)
                    # 降低日志级别，减少日志量
                    # logger.debug(f"延迟双删: 第二次删除缓存 {cache_key}")
                except Exception as e:
                    logger.error(f"延迟双删: 第二次删除缓存失败 {cache_key}: {e}")
            
            # 创建后台线程
            thread = threading.Thread(target=delayed_delete)
            thread.daemon = True
            thread.start()
            
            return True
        except Exception as e:
            logger.error(f"延迟双删: 第一次删除缓存失败 {cache_key}: {e}")
            return False
    
    @staticmethod
    def prevent_cache_avalanche(key_prefix, callback_func, *args, base_ttl=300, jitter=60):
        """
        防止缓存雪崩策略
        
        使用随机过期时间，防止大量缓存同时失效
        
        Args:
            key_prefix: 缓存键前缀
            callback_func: 缓存未命中时的回调函数
            args: 回调函数参数
            base_ttl: 基础过期时间（秒）
            jitter: 随机抖动范围（秒）
            
        Returns:
            缓存数据或回调函数返回值
        """
        # 构建缓存键
        cache_key = DataCache.make_key(key_prefix, *args)
        
        # 尝试获取缓存
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            # 命中缓存
            # 降低日志级别，减少日志量
            # logger.debug(f"缓存命中: {cache_key}")
            return pickle.loads(cached_data)
        
        # 缓存未命中，执行回调获取数据
        try:
            data = callback_func(*args)
            
            # 计算随机过期时间
            random_ttl = base_ttl + random.randint(0, jitter)
            
            # 缓存结果，使用随机过期时间
            cache.set(cache_key, pickle.dumps(data), timeout=random_ttl)
            # 降低日志级别，减少日志量
            # logger.debug(f"设置缓存 {cache_key}, TTL={random_ttl}秒")
            
            return data
        except Exception as e:
            logger.error(f"防雪崩策略执行失败 {cache_key}: {e}")
            raise
    
    @staticmethod
    def with_bloom_filter(key_prefix, false_positive_rate=0.01):
        """
        布隆过滤器装饰器，防止缓存穿透
        
        Args:
            key_prefix: 缓存键前缀
            false_positive_rate: 允许的误判率
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # 构建完整的键
                key = DataCache.make_key(key_prefix, *args, *kwargs.values())
                key_hash = hashlib.md5(key.encode()).hexdigest()
                
                redis_client = cache._write_client
                
                # 检查键是否可能存在（通过布隆过滤器）
                exists = CacheConsistency._check_bloom_filter(redis_client, key_hash)
                
                if not exists:
                    # 布隆过滤器表明此键对应的数据一定不存在
                    # 降低日志级别，减少日志量
                    # logger.debug(f"布隆过滤器拦截: {key}")
                    return None
                
                # 执行原函数获取数据
                result = func(*args, **kwargs)
                
                # 如果获取到数据，将其键添加到布隆过滤器
                if result is not None:
                    CacheConsistency._add_to_bloom_filter(redis_client, key_hash)
                
                return result
            
            return wrapper
        return decorator
    
    @staticmethod
    def _check_bloom_filter(redis_client, key_hash):
        """检查键是否在布隆过滤器中"""
        # 实际实现应使用合适的布隆过滤器库
        # 这里使用简化实现，仅作示例
        return redis_client.sismember(CacheConsistency.BLOOM_FILTER_KEY, key_hash)
    
    @staticmethod
    def _add_to_bloom_filter(redis_client, key_hash):
        """添加键到布隆过滤器"""
        redis_client.sadd(CacheConsistency.BLOOM_FILTER_KEY, key_hash)
    
    @staticmethod
    def refresh_cache_on_schedule(key_prefix, ttl_fraction=0.75):
        """
        基于后台任务的定时缓存更新装饰器
        
        当缓存达到一定生命周期比例时，后台异步刷新，避免完全过期
        
        Args:
            key_prefix: 缓存键前缀
            ttl_fraction: 触发刷新的TTL比例（0-1之间）
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                cache_key = DataCache.make_key(key_prefix, *args, *kwargs.values())
                
                redis_client = cache._write_client
                
                # 检查缓存是否存在
                cached_data = cache.get(cache_key)
                if cached_data is not None:
                    try:
                        # 检查剩余TTL
                        ttl = redis_client.ttl(f"synspirit:{cache_key}")
                        
                        # 如果是缓存后台刷新标记，执行刷新
                        refresh_key = f"synspirit:refresh:{cache_key}"
                        should_refresh = redis_client.get(refresh_key)
                        
                        if ttl > 0:
                            # 计算原始TTL（假设使用的是DataCache中定义的TTL）
                            original_ttl = TTL['DATA_MEDIUM']  # 默认值
                            for ttl_name, ttl_value in TTL.items():
                                if f"{ttl_name.lower()}:" in key_prefix.lower():
                                    original_ttl = ttl_value
                                    break
                            
                            # 如果剩余TTL小于阈值且未设置刷新标记，触发后台刷新
                            if ttl < original_ttl * ttl_fraction and not should_refresh:
                                # 设置刷新标记，防止重复刷新
                                redis_client.setex(refresh_key, 60, "1")  # 1分钟有效期
                                
                                # 后台异步刷新
                                def bg_refresh():
                                    try:
                                        # 执行函数获取新数据
                                        new_data = func(*args, **kwargs)
                                        
                                        # 更新缓存，保持原TTL
                                        cache.set(cache_key, pickle.dumps(new_data), timeout=original_ttl)
                                        
                                        # 删除刷新标记
                                        redis_client.delete(refresh_key)
                                        
                                        # 降低日志级别，减少日志量
                                        # logger.debug(f"后台刷新缓存成功: {cache_key}")
                                    except Exception as e:
                                        logger.error(f"后台刷新缓存失败: {cache_key}, 错误: {e}")
                                        # 删除刷新标记，允许下次尝试
                                        redis_client.delete(refresh_key)
                                
                                # 启动后台线程
                                thread = threading.Thread(target=bg_refresh)
                                thread.daemon = True
                                thread.start()
                    except Exception as e:
                        logger.error(f"缓存刷新检查失败: {cache_key}, 错误: {e}")
                    
                    # 返回缓存的数据
                    return pickle.loads(cached_data)
                
                # 缓存未命中，执行原函数
                result = func(*args, **kwargs)
                
                # 缓存结果
                if result is not None:
                    # 根据键前缀选择合适的TTL
                    selected_ttl = TTL['DATA_MEDIUM']  # 默认值
                    for ttl_name, ttl_value in TTL.items():
                        if f"{ttl_name.lower()}:" in key_prefix.lower():
                            selected_ttl = ttl_value
                            break
                    
                    cache.set(cache_key, pickle.dumps(result), timeout=selected_ttl)
                
                return result
            return wrapper
        return decorator

    @staticmethod
    def invalidate_after_update(obj_type, obj_id, wait_time=0.5, related_prefixes=None):
        """延迟双删：在更新后延迟一段时间再次删除缓存
        
        Args:
            obj_type: 对象类型
            obj_id: 对象ID
            wait_time: 等待时间(秒)
            related_prefixes: 相关前缀列表 [(prefix, id_key_func), ...]
        """
        logger = current_app.logger if has_app_context() else logging.getLogger(__name__)
        
        # 立即删除主缓存
        from ..utils.cache_manager import DataCache
        key_prefix = f"{obj_type.upper()}_DETAIL"
        invalidated = DataCache.invalidate(key_prefix, obj_id)
        
        # 删除相关缓存
        if related_prefixes:
            for prefix, id_key_func in related_prefixes:
                if callable(id_key_func):
                    # 如果提供了ID转换函数，使用它来生成关联键
                    related_key = id_key_func(obj_id)
                    if related_key:
                        DataCache.invalidate(prefix, related_key)
                else:
                    # 否则直接使用原始ID
                    DataCache.invalidate(prefix, obj_id)
        
        # 删除分组缓存
        group_name = f"{obj_type.lower()}_related"
        DataCache.invalidate_group(group_name)
        
        if invalidated > 0:
            # 将日志级别从DEBUG降级，仅在有大量缓存被删除时记录INFO日志
            if invalidated > 3:
                logger.info(f"立即删除 {obj_type}(ID={obj_id}) 相关缓存 {invalidated} 项")
        
        # 启动延迟删除任务
        def delayed_delete():
            time.sleep(wait_time)
            # 再次删除主缓存
            second_invalidated = DataCache.invalidate(key_prefix, obj_id)
            
            # 再次删除分组缓存
            DataCache.invalidate_group(group_name)
            
            # 只有在删除了大量缓存时才记录INFO日志
            if second_invalidated > 3:
                logger.info(f"延迟删除 {obj_type}(ID={obj_id}) 相关缓存 {second_invalidated} 项")
        
        # 启动后台线程执行延迟删除
        threading.Thread(target=delayed_delete).start()
        
        return invalidated

# 工业级缓存一致性使用示例

# 示例1：使用分布式锁更新文章
def update_article_with_consistency(article_id, new_data):
    """带有缓存一致性保证的文章更新"""
    
    # 获取分布式锁
    lock_acquired, lock_id = CacheLock.acquire_lock(f"article:{article_id}")
    
    if not lock_acquired:
        logger.warning(f"无法获取文章锁, ID: {article_id}")
        return False
    
    try:
        # 使用延迟双删策略
        cache_key = DataCache.make_key(KEY_PREFIX['ARTICLE'], article_id)
        CacheConsistency.delayed_double_deletion(cache_key)
        
        # 更新数据库
        # 实际代码应该在这里执行数据库更新
        success = True
        
        # 更新成功，通过返回True表示
        return success
    finally:
        # 释放锁
        CacheLock.release_lock(f"article:{article_id}", lock_id)

# 示例2：带有雪崩防护的获取文章列表
def get_articles_with_avalanche_protection(category=None, limit=10):
    """带有缓存雪崩防护的文章列表获取"""
    
    # 获取文章列表的回调函数
    def fetch_articles(category, limit):
        # 实际代码应该在这里查询数据库
        return [{"id": i, "title": f"文章 {i}"} for i in range(limit)]
    
    # 使用防止缓存雪崩的策略获取数据
    key_prefix = f"{KEY_PREFIX['ARTICLE']}list:"
    if category:
        key_prefix += f"category:{category}:"
    
    return CacheConsistency.prevent_cache_avalanche(
        key_prefix, fetch_articles, category, limit, 
        base_ttl=300, jitter=60
    )

# 示例3：使用布隆过滤器防止缓存穿透的装饰器用法
@CacheConsistency.with_bloom_filter(KEY_PREFIX['ARTICLE'])
def get_article_by_id(article_id):
    """使用布隆过滤器防止缓存穿透的文章获取"""
    # 实际代码应该在这里查询数据库
    # 如果找不到文章，返回None
    return {"id": article_id, "title": f"文章 {article_id}"} if article_id > 0 else None

# 示例4：带有后台刷新的缓存装饰器用法
@CacheConsistency.refresh_cache_on_schedule(KEY_PREFIX['ARTICLE'])
def get_article_with_bg_refresh(article_id):
    """带有后台刷新的文章缓存"""
    # 实际代码应该在这里查询数据库
    return {"id": article_id, "title": f"文章 {article_id}", "content": "内容..."} 