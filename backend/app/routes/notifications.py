from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app import db
from app.models.notification import Notification
from app.models.user import User
from functools import wraps

notifications_bp = Blueprint('notifications', __name__)

# 自定义装饰器，同时支持Flask-Login和JWT认证
def auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 尝试JWT认证
        jwt_header = request.headers.get('Authorization', '')
        if jwt_header and jwt_header.startswith('Bearer '):
            # 使用JWT认证
            @jwt_required()
            def jwt_auth_route(*args, **kwargs):
                user_id = get_jwt_identity()
                user = User.query.get(user_id)
                if not user:
                    return jsonify({"error": "用户不存在"}), 401
                # 将user设为全局变量，供路由函数使用
                # 这样不需要修改路由函数中的current_user引用
                global current_user
                current_user = user
                return f(*args, **kwargs)
            return jwt_auth_route(*args, **kwargs)
        else:
            # 使用Flask-Login认证
            @login_required
            def session_auth_route(*args, **kwargs):
                return f(*args, **kwargs)
            return session_auth_route(*args, **kwargs)
    return decorated_function

@notifications_bp.route('/', methods=['GET'])
@auth_required
def get_notifications():
    """获取当前用户的通知列表"""
    page = request.args.get('page', 1, type=int)
    # 支持两种参数名
    per_page = request.args.get('per_page', request.args.get('pageSize', 20, type=int), type=int)
    # 支持两种参数名
    unread_only = request.args.get('unread_only', request.args.get('onlyUnread', False, type=bool), type=bool)
    
    query = Notification.query.filter_by(recipient_user_id=current_user.id)
    
    if unread_only:
        query = query.filter(Notification.read_at == None)
    
    # 按时间排序，最新的在前
    query = query.order_by(Notification.created_at.desc())
    
    notifications_pagination = query.paginate(page=page, per_page=per_page)
    
    notifications = [notification.to_dict() for notification in notifications_pagination.items]
    
    return jsonify({
        'notifications': notifications, 
        'total': notifications_pagination.total,
        'pages': notifications_pagination.pages,
        'current_page': page
    }), 200

@notifications_bp.route('/unread-count', methods=['GET'])
@auth_required
def get_unread_count():
    """获取当前用户未读通知数量"""
    unread_count = Notification.query.filter_by(
        recipient_user_id=current_user.id, 
        read_at=None
    ).count()
    
    # 同时返回count和unread_count两个字段，兼容不同的前端
    return jsonify({
        'unread_count': unread_count,
        'count': unread_count
    }), 200

@notifications_bp.route('/<int:notification_id>/read', methods=['PUT'])
@auth_required
def mark_as_read(notification_id):
    """标记单个通知为已读"""
    notification = Notification.query.get_or_404(notification_id)
    
    # 验证权限
    if notification.recipient_user_id != current_user.id:
        return jsonify({'error': '没有权限操作此通知'}), 403
    
    notification.read_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'message': '已标记为已读'}), 200

# 支持两种路径和HTTP方法
@notifications_bp.route('/mark-all-read', methods=['POST', 'PUT'])
@notifications_bp.route('/read-all', methods=['POST', 'PUT'])
@auth_required
def mark_all_read():
    """标记所有通知为已读"""
    now = datetime.utcnow()
    
    # 更新所有未读通知
    updated = Notification.query.filter_by(
        recipient_user_id=current_user.id,
        read_at=None
    ).update({'read_at': now})
    
    db.session.commit()
    
    return jsonify({'message': f'已将{updated}条通知标记为已读'}), 200 