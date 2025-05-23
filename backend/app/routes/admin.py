# --- 新增：缓存管理相关API ---
@admin_bp.route('/cache/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_cache_stats():
    """
    获取缓存统计信息
    
    Returns:
        JSON: 缓存统计数据
    """
    from app.utils.cache_manager import CacheStats
    
    try:
        stats = CacheStats.get_stats()
        return jsonify({
            'status': 'success',
            'data': stats
        }), 200
    except Exception as e:
        current_app.logger.error(f"获取缓存统计信息失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"获取缓存统计信息失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/redis', methods=['GET'])
@jwt_required()
@admin_required
def get_redis_info():
    """
    获取Redis服务器详细信息
    
    Returns:
        JSON: Redis服务器信息
    """
    from app.utils.cache_manager import cache
    
    try:
        redis_client = cache._write_client
        info = redis_client.info()
        
        # 提取重要信息
        redis_info = {
            'server': {
                'version': info.get('redis_version', 'unknown'),
                'uptime_in_days': info.get('uptime_in_days', 0),
                'tcp_port': info.get('tcp_port', 0)
            },
            'clients': {
                'connected_clients': info.get('connected_clients', 0),
                'blocked_clients': info.get('blocked_clients', 0)
            },
            'memory': {
                'used_memory_human': info.get('used_memory_human', 'unknown'),
                'used_memory_peak_human': info.get('used_memory_peak_human', 'unknown'),
                'maxmemory_human': info.get('maxmemory_human', 'unknown'),
                'maxmemory_policy': info.get('maxmemory_policy', 'unknown')
            },
            'stats': {
                'total_connections_received': info.get('total_connections_received', 0),
                'total_commands_processed': info.get('total_commands_processed', 0),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'hit_rate': 0
            },
            'keyspace': {}
        }
        
        # 计算命中率
        hits = info.get('keyspace_hits', 0)
        misses = info.get('keyspace_misses', 0)
        total = hits + misses
        if total > 0:
            redis_info['stats']['hit_rate'] = hits / total
        
        # 添加数据库信息
        for key, value in info.items():
            if key.startswith('db'):
                redis_info['keyspace'][key] = value
        
        # 获取键类型分布
        key_types = {}
        try:
            # 获取所有键
            synspirit_keys = redis_client.keys('synspirit:*')
            sample_size = min(len(synspirit_keys), 500)  # 限制样本大小以避免性能问题
            
            if sample_size > 0:
                # 对键进行采样
                import random
                sampled_keys = random.sample(synspirit_keys, sample_size)
                
                # 统计前缀分布
                prefix_counts = {}
                for key in sampled_keys:
                    key_str = key.decode('utf-8')
                    parts = key_str.split(':')
                    if len(parts) > 1:
                        prefix = parts[1]  # synspirit:prefix:...
                        if prefix not in prefix_counts:
                            prefix_counts[prefix] = 0
                        prefix_counts[prefix] += 1
                
                # 按比例估算总数
                if sample_size < len(synspirit_keys):
                    ratio = len(synspirit_keys) / sample_size
                    for prefix, count in prefix_counts.items():
                        prefix_counts[prefix] = int(count * ratio)
                
                redis_info['key_distribution'] = prefix_counts
        except Exception as e:
            current_app.logger.error(f"获取键分布失败: {e}")
            redis_info['key_distribution_error'] = str(e)
        
        return jsonify({
            'status': 'success',
            'data': redis_info
        }), 200
    except Exception as e:
        current_app.logger.error(f"获取Redis信息失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"获取Redis信息失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/flush', methods=['POST'])
@jwt_required()
@admin_required
def flush_cache():
    """
    清空缓存（慎用）
    
    仅限管理员使用，允许有选择地清除特定类型的缓存
    
    Request:
        JSON: {
            "scope": "all|image|data|count", # 默认 all
            "pattern": "可选的glob模式" # 例如 "synspirit:article:*"
        }
    
    Returns:
        JSON: 操作结果
    """
    from app.utils.cache_manager import cache, ImageCache, DataCache
    
    try:
        data = request.json or {}
        scope = data.get('scope', 'all')
        pattern = data.get('pattern')
        
        redis_client = cache._write_client
        deleted_count = 0
        
        if pattern:
            # 按模式删除
            keys = redis_client.keys(pattern)
            if keys:
                deleted_count = len(keys)
                redis_client.delete(*keys)
                current_app.logger.warning(f"已按模式 {pattern} 删除 {deleted_count} 个缓存键")
        else:
            # 按范围删除
            if scope == 'all':
                # 只删除synspirit前缀的键，保留其他可能的系统键
                keys = redis_client.keys('synspirit:*')
                if keys:
                    deleted_count = len(keys)
                    redis_client.delete(*keys)
                # 重置缓存状态
                ImageCache.stats = {
                    'cache_hits': 0, 'cache_misses': 0, 'cache_stores': 0, 'cache_errors': 0,
                    'by_type': {
                        'article': {'hits': 0, 'misses': 0, 'stores': 0},
                        'post': {'hits': 0, 'misses': 0, 'stores': 0},
                        'dynamic': {'hits': 0, 'misses': 0, 'stores': 0},
                        'profile': {'hits': 0, 'misses': 0, 'stores': 0},
                        'cover': {'hits': 0, 'misses': 0, 'stores': 0},
                        'general': {'hits': 0, 'misses': 0, 'stores': 0},
                    }
                }
                DataCache._dependencies = {}
                DataCache._groups = {}
                DataCache.stats = {'hits': 0, 'misses': 0, 'invalidations': 0, 'group_invalidations': 0}
            
            elif scope == 'image':
                keys = redis_client.keys('synspirit:img:*')
                if keys:
                    deleted_count = len(keys)
                    redis_client.delete(*keys)
                # 重置图片缓存状态
                ImageCache.stats = {
                    'cache_hits': 0, 'cache_misses': 0, 'cache_stores': 0, 'cache_errors': 0,
                    'by_type': {
                        'article': {'hits': 0, 'misses': 0, 'stores': 0},
                        'post': {'hits': 0, 'misses': 0, 'stores': 0},
                        'dynamic': {'hits': 0, 'misses': 0, 'stores': 0},
                        'profile': {'hits': 0, 'misses': 0, 'stores': 0},
                        'cover': {'hits': 0, 'misses': 0, 'stores': 0},
                        'general': {'hits': 0, 'misses': 0, 'stores': 0},
                    }
                }
            
            elif scope == 'data':
                keys = redis_client.keys('synspirit:data:*')
                keys.extend(redis_client.keys('synspirit:article:*'))
                keys.extend(redis_client.keys('synspirit:post:*'))
                keys.extend(redis_client.keys('synspirit:user:*'))
                keys.extend(redis_client.keys('synspirit:comment:*'))
                if keys:
                    deleted_count = len(keys)
                    redis_client.delete(*keys)
                # 重置数据缓存状态
                DataCache._dependencies = {}
                DataCache._groups = {}
                DataCache.stats = {'hits': 0, 'misses': 0, 'invalidations': 0, 'group_invalidations': 0}
            
            elif scope == 'count':
                keys = redis_client.keys('synspirit:count:*')
                if keys:
                    deleted_count = len(keys)
                    redis_client.delete(*keys)
            
            current_app.logger.warning(f"已清空 {scope} 类型的缓存，删除了 {deleted_count} 个键")
        
        return jsonify({
            'status': 'success',
            'message': f"已清除 {deleted_count} 个缓存项",
            'scope': scope,
            'pattern': pattern
        }), 200
    except Exception as e:
        current_app.logger.error(f"清空缓存失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"清空缓存失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/images/preload', methods=['POST'])
@jwt_required()
@admin_required
def trigger_image_preload():
    """
    触发图片预加载
    
    Request:
        JSON: {
            "categories": ["article", "post", "profile"], # 要预加载的类别
            "limit": 50,  # 每个类别最多预加载多少图片
            "force": false  # 是否强制重新加载已有缓存
        }
    
    Returns:
        JSON: 预加载任务状态
    """
    from app.utils.image_preloader import start_preload_job
    
    try:
        data = request.json or {}
        categories = data.get('categories', ['article', 'post', 'profile'])
        limit = int(data.get('limit', 50))
        force = data.get('force', False)
        
        # 启动预加载任务
        task = start_preload_job.delay(categories, limit, force)
        
        return jsonify({
            'status': 'success',
            'message': f"图片预加载任务已启动",
            'task_id': task.id,
            'categories': categories,
            'limit': limit,
            'force': force
        }), 202
    except Exception as e:
        current_app.logger.error(f"启动图片预加载失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"启动图片预加载失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/images/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_image_preload_stats():
    """
    获取图片预加载统计信息
    
    Returns:
        JSON: 图片缓存统计数据
    """
    from app.utils.cache_manager import ImageCache
    from app.utils.image_preloader import get_preload_status
    
    try:
        # 获取图片缓存统计
        image_stats = ImageCache.get_stats()
        
        # 获取预加载任务状态
        preload_status = get_preload_status()
        
        return jsonify({
            'status': 'success',
            'data': {
                'cache_stats': image_stats,
                'preload_status': preload_status
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"获取图片缓存统计失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"获取图片缓存统计失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/report', methods=['GET'])
@jwt_required()
@admin_required
def generate_cache_report():
    """
    生成完整的缓存系统报告
    
    Returns:
        JSON: 完整的缓存系统状态报告
    """
    from app.utils.cache_manager import cache, CacheStats, ImageCache, DataCache, CounterCache
    
    try:
        # 获取基本缓存统计
        stats = CacheStats.get_stats()
        
        # 获取Redis客户端
        redis_client = cache._write_client
        
        # 获取键分布
        key_distribution = {}
        key_count = 0
        
        try:
            # 获取所有SynSpirit前缀的键
            all_keys = redis_client.keys('synspirit:*')
            key_count = len(all_keys)
            
            # 统计键分布
            for key in all_keys:
                key_str = key.decode('utf-8')
                parts = key_str.split(':')
                if len(parts) > 1:
                    prefix = parts[1]  # synspirit:prefix:...
                    if prefix not in key_distribution:
                        key_distribution[prefix] = 0
                    key_distribution[prefix] += 1
        except Exception as e:
            current_app.logger.error(f"获取键分布失败: {e}")
        
        # 获取内存使用情况
        memory_usage = {}
        try:
            info = redis_client.info('memory')
            used_memory = info.get('used_memory', 0)
            max_memory = info.get('maxmemory', 0)
            memory_usage = {
                'used_memory': used_memory,
                'used_memory_human': info.get('used_memory_human', 'unknown'),
                'maxmemory': max_memory,
                'maxmemory_human': info.get('maxmemory_human', 'unknown'),
                'usage_ratio': used_memory / max_memory if max_memory > 0 else 0
            }
        except Exception as e:
            current_app.logger.error(f"获取内存使用情况失败: {e}")
        
        # 获取数据缓存组信息
        groups_info = {}
        for group_name, keys in DataCache._groups.items():
            groups_info[group_name] = len(keys)
        
        return jsonify({
            'status': 'success',
            'data': {
                'summary': {
                    'total_keys': key_count,
                    'memory_usage': memory_usage,
                    'hit_ratio': stats.get('redis', {}).get('hit_rate', 0),
                    'image_cache_hits': ImageCache.stats['cache_hits'],
                    'data_cache_hits': DataCache.stats['hits'] if hasattr(DataCache, 'stats') else 0
                },
                'key_distribution': key_distribution,
                'cache_stats': stats,
                'data_cache_groups': groups_info,
                'dependencies_count': len(DataCache._dependencies),
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"生成缓存报告失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"生成缓存报告失败: {str(e)}"
        }), 500

@admin_bp.route('/cache/scheduler', methods=['GET'])
@jwt_required()
@admin_required
def get_cache_tasks_status():
    """
    获取缓存相关定时任务状态
    
    Returns:
        JSON: 任务状态信息
    """
    from celery.result import AsyncResult
    from app.celery_utils import celery_app
    
    try:
        # 定时任务列表
        cache_tasks = [
            'tasks.sync_counter_cache_to_db',
            'tasks.clean_expired_cache', 
            'tasks.refresh_hot_data_cache'
        ]
        
        # 获取任务状态
        tasks_status = {}
        
        # 查询已注册的定时任务
        scheduled_tasks = {}
        try:
            inspector = celery_app.control.inspect()
            registered = inspector.registered() or {}
            
            for worker, tasks in registered.items():
                for task in tasks:
                    if task in cache_tasks:
                        if task not in scheduled_tasks:
                            scheduled_tasks[task] = []
                        scheduled_tasks[task].append(worker)
        except Exception as e:
            current_app.logger.error(f"获取注册的任务失败: {e}")
        
        # 获取周期任务配置
        periodic_tasks = {}
        try:
            from app.celery_utils import get_scheduled_tasks
            periodic_tasks = get_scheduled_tasks(cache_tasks)
        except Exception as e:
            current_app.logger.error(f"获取周期任务配置失败: {e}")
        
        # 获取最近任务执行历史
        from app.models.task_execution_log import TaskExecutionLog
        recent_executions = {}
        
        try:
            for task_name in cache_tasks:
                # 获取最近5次执行记录
                logs = TaskExecutionLog.query.filter_by(task_name=task_name).order_by(
                    TaskExecutionLog.executed_at.desc()
                ).limit(5).all()
                
                if logs:
                    recent_executions[task_name] = [{
                        'executed_at': log.executed_at.isoformat() if log.executed_at else None,
                        'status': log.status,
                        'result': log.result,
                        'duration': log.duration
                    } for log in logs]
        except Exception as e:
            current_app.logger.error(f"获取任务执行历史失败: {e}")
        
        return jsonify({
            'status': 'success',
            'data': {
                'cache_tasks': cache_tasks,
                'scheduled_tasks': scheduled_tasks,
                'periodic_tasks': periodic_tasks,
                'recent_executions': recent_executions
            }
        }), 200
    except Exception as e:
        current_app.logger.error(f"获取缓存任务状态失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f"获取缓存任务状态失败: {str(e)}"
        }), 500
# --- 结束新增 --- 