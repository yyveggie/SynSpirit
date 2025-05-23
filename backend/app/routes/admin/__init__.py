"""
管理员API路由
"""

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User

admin_bp = Blueprint('admin_bp', __name__)

def require_admin():
    """检查当前用户是否为管理员"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "需要管理员权限"}), 403
    return None

@admin_bp.route('/cache/stats', methods=['GET'])
@jwt_required()
def get_cache_stats():
    """获取缓存统计信息"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        from app.utils.cache_manager import CacheStats
        stats = CacheStats.get_stats()
        
        # 获取Redis服务器信息
        redis_info = CacheStats.get_redis_info()
        if 'error' not in redis_info:
            stats.update(redis_info)
            
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": f"获取缓存统计信息失败: {str(e)}"}), 500

@admin_bp.route('/cache/redis', methods=['GET'])
@jwt_required()
def get_redis_info():
    """获取Redis服务器信息"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        from app.utils.cache_manager import CacheStats
        redis_info = CacheStats.get_redis_info()
        return jsonify(redis_info), 200
    except Exception as e:
        return jsonify({"error": f"获取Redis信息失败: {str(e)}"}), 500

@admin_bp.route('/cache/images/preload', methods=['POST'])
@jwt_required()
def trigger_image_preload():
    """手动触发图片预加载"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        from app.utils.image_preloader import preload_all_hot_images, get_preload_stats
        
        # 是否强制执行
        force = request.json.get('force', False) if request.is_json else False
        
        # 在新线程中执行预加载
        import threading
        def run_preload():
            try:
                preload_all_hot_images(force=force)
            except Exception as e:
                current_app.logger.error(f"预加载图片失败: {str(e)}")
                
        # 启动线程
        preload_thread = threading.Thread(target=run_preload)
        preload_thread.daemon = True
        preload_thread.start()
        
        return jsonify({
            "success": True,
            "message": "图片预加载已开始，请稍后通过统计接口查看结果",
            "current_stats": get_preload_stats()
        }), 200
    except Exception as e:
        return jsonify({"error": f"触发图片预加载失败: {str(e)}"}), 500

@admin_bp.route('/cache/images/stats', methods=['GET'])
@jwt_required()
def get_image_preload_stats():
    """获取图片预加载统计信息"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        from app.utils.image_preloader import get_preload_stats
        stats = get_preload_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": f"获取图片预加载统计信息失败: {str(e)}"}), 500

@admin_bp.route('/cache/flush', methods=['POST'])
@jwt_required()
def flush_cache():
    """清空缓存"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        # 获取缓存类型
        cache_type = request.json.get('type', 'all') if request.is_json else 'all'
        
        # 获取缓存客户端
        from app.utils.cache_manager import cache
        
        if cache_type == 'all':
            # 清空所有缓存
            cache.clear()
            message = "已清空所有缓存"
        else:
            # 清空特定类型的缓存
            import redis
            redis_client = cache._write_client
            prefix = cache.config['CACHE_KEY_PREFIX']
            
            from app.utils.cache_manager import KEY_PREFIX
            pattern = f"{prefix}{KEY_PREFIX.get(cache_type.upper(), '')}*"
            
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
                count = len(keys)
            else:
                count = 0
                
            message = f"已清空{count}个{cache_type}类型的缓存项"
        
        return jsonify({
            "success": True,
            "message": message
        }), 200
    except Exception as e:
        return jsonify({"error": f"清空缓存失败: {str(e)}"}), 500

@admin_bp.route('/errors', methods=['GET'])
@jwt_required()
def get_error_stats():
    """获取错误统计信息"""
    admin_check = require_admin()
    if admin_check:
        return admin_check
    
    try:
        from app.utils.error_handler import ErrorHandler
        stats = ErrorHandler.get_error_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": f"获取错误统计信息失败: {str(e)}"}), 500 