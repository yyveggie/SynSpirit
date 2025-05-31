"""
管理员API路由
"""

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, Topic
from app.utils.auth_utils import admin_required
from app import db
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import re

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

@admin_bp.route('/topics/pending', methods=['GET'])
@jwt_required()
@admin_required
def get_pending_topics_admin():
    """管理员获取所有待审批的主题列表"""
    try:
        pending_topics = Topic.query.filter_by(status='pending_approval').order_by(Topic.created_at.desc()).all()
        return jsonify([topic.to_dict() for topic in pending_topics]), 200
    except Exception as e:
        current_app.logger.error(f"Error fetching pending topics for admin: {e}")
        return jsonify({'error': '获取待审批主题列表失败'}), 500

@admin_bp.route('/topics/<int:topic_id>/approve', methods=['POST'])
@jwt_required()
@admin_required
def approve_topic_admin(topic_id):
    """管理员批准一个主题并设置slug"""
    data = request.get_json()
    if not data or not data.get('slug'):
        return jsonify({'error': '缺少slug信息'}), 400

    new_slug = data['slug'].strip()
    if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", new_slug):
        return jsonify({'error': 'Slug格式无效。只允许小写字母、数字和连字符，且不能以连字符开头或结尾。'}), 400

    topic_to_approve = Topic.query.filter_by(id=topic_id, status='pending_approval').first()
    if not topic_to_approve:
        return jsonify({'error': '未找到待审批的主题或主题已被处理'}), 404

    # 检查新的 slug 是否在已激活主题中唯一
    existing_topic_with_slug = Topic.query.filter(Topic.slug == new_slug, Topic.status == 'active').first()
    if existing_topic_with_slug:
        return jsonify({'error': '该slug已被另一个活动主题使用'}), 409
    
    topic_to_approve.slug = new_slug
    topic_to_approve.status = 'active'
    topic_to_approve.updated_at = datetime.utcnow() # Manually update timestamp

    try:
        db.session.commit()
        return jsonify(topic_to_approve.to_dict()), 200
    except IntegrityError as e: 
        db.session.rollback()
        current_app.logger.error(f"Database integrity error during topic approval (slug unique): {e}")
        if 'topics_slug_key' in str(e.orig).lower() or (e.orig and 'unique constraint failed: topics.slug' in str(e.orig).lower()):
            return jsonify({'error': '该slug已被占用 (并发)。'}), 409
        return jsonify({'error': '批准主题失败，数据库错误。'}), 500
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error approving topic: {e}")
        return jsonify({'error': '批准主题操作失败。'}), 500

@admin_bp.route('/topics/<int:topic_id>/reject', methods=['POST'])
@jwt_required()
@admin_required
def reject_topic_admin(topic_id):
    """管理员拒绝一个主题"""
    topic_to_reject = Topic.query.filter_by(id=topic_id, status='pending_approval').first()
    
    if not topic_to_reject:
        return jsonify({'error': '未找到待审批的主题或主题已被处理'}), 404

    topic_to_reject.status = 'rejected'
    topic_to_reject.slug = None 
    topic_to_reject.updated_at = datetime.utcnow()

    try:
        db.session.commit()
        return jsonify({'message': '主题已成功拒绝', 'topic': topic_to_reject.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error rejecting topic: {e}")
        return jsonify({'error': '拒绝主题操作失败。'}), 500 