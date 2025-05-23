"""
关注用户动态API模块

本模块提供获取当前用户关注的用户分享的动态的API接口。
包括：
- 获取关注用户的动态列表（支持分页）
- 获取动态详情（包括转发内容的递归获取）

依赖于auth模块进行用户身份验证。
"""

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, UserAction, UserFollow
from app import db
from sqlalchemy import and_, desc, or_
from app.routes.dynamics import fetch_action_details
import logging
from enum import Enum

# 手动定义ActionType和TargetType枚举类型
class ActionType(str, Enum):
    LIKE = 'like'
    COLLECT = 'collect'
    SHARE_ARTICLE = 'share'
    SHARE_POST = 'share'
    FORWARD = 'share'

class TargetType(str, Enum):
    ARTICLE = 'article'
    POST = 'post'
    ACTION = 'action'
    TOOL = 'tool'

# 创建蓝图
following_bp = Blueprint('following', __name__, url_prefix='/api/following')

@following_bp.route('/dynamics', methods=['GET'])
@jwt_required()
def get_following_dynamics():
    """
    获取当前用户关注的用户以及用户自己的分享动态列表
    
    查询参数:
        page: 当前页码，默认为1
        per_page: 每页条数，默认为10
    
    返回:
        JSON格式的动态列表
    """
    try:
        # 获取分页参数
        page = request.args.get('page', 1, type=int)
        # 修正：前端请求的是 limit，后端用 per_page 接收
        per_page = request.args.get('limit', 10, type=int) 
        
        # 获取当前用户ID
        current_user_id = get_jwt_identity()
        
        # 获取当前用户关注的用户ID列表
        followed_user_ids = db.session.query(UserFollow.followed_id).filter(
            UserFollow.follower_id == current_user_id
        ).all()
        followed_user_ids = [user_id[0] for user_id in followed_user_ids]
        
        # 查询关注用户以及用户自己的分享动态（包括转发）和原创状态
        query = UserAction.query.filter(
            or_( # 主要条件：发布者是关注的人 或 发布者是当前用户
                    UserAction.user_id.in_(followed_user_ids),
                    UserAction.user_id == current_user_id
            )
        ).filter(
            or_( # 次要条件：动态类型是分享 或 动态类型是原创状态
                # 分享类型的条件
                and_(
                    UserAction.action_type == 'share',
                    UserAction.target_type.in_(['article', 'post', 'action', 'tool']) # 'tool' 也是一种可分享的目标
                ),
                # 原创状态类型的条件
                and_(
                    UserAction.action_type == 'create_status',
                    UserAction.target_type == 'user'
                )
            )
        ).filter(
            UserAction.is_deleted == False  # 添加过滤条件，排除已软删除的动态
        ).order_by(desc(UserAction.created_at))
        
        # 执行分页查询
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        # 获取动态详情
        dynamics = []
        for action in pagination.items:
            try:
                dynamic = fetch_action_details(action.id, current_user_id) # 传递 current_user_id
                if dynamic:
                    dynamics.append(dynamic)
            except Exception as e:
                current_app.logger.error(f"Error fetching details for action {action.id}: {str(e)}")
                continue
        
        # 返回结果 - 确保返回的字段与前端期望一致
        return jsonify({
            'dynamics': dynamics,
            'total': pagination.total,
            'page': pagination.page,
            'pages': pagination.pages,
            # 添加 limit 字段以匹配前端可能需要的参数名
            'limit': per_page, 
            # 移除 has_next/has_prev, 前端会根据 page 和 pages 计算
            # 'has_next': pagination.has_next,
            # 'has_prev': pagination.has_prev
        })
    
    except Exception as e:
        current_app.logger.error(f"Error in get_following_dynamics: {str(e)}")
        return jsonify({'error': '获取关注动态失败'}), 500 

@following_bp.route('/dynamics/status', methods=['GET'])
@jwt_required()
def get_following_dynamics_status():
    """
    获取当前用户关注的用户以及用户自己的分享动态和原创状态的新动态数量。
    查询参数:
        since_id: 从哪个 UserAction ID 之后开始计数，可选。
    """
    since_id = request.args.get('since_id', type=int)
    current_user_id = get_jwt_identity()

    try:
        followed_user_ids = db.session.query(UserFollow.followed_id).filter(
            UserFollow.follower_id == current_user_id
        ).all()
        followed_user_ids = [user_id[0] for user_id in followed_user_ids]
        
        query = UserAction.query.filter(
            or_(
                UserAction.user_id.in_(followed_user_ids),
                UserAction.user_id == current_user_id
            )
        ).filter(
            or_(
                and_(
                    UserAction.action_type == 'share',
                    UserAction.target_type.in_(['article', 'post', 'action', 'tool'])
                ),
                and_(
                    UserAction.action_type == 'create_status',
                    UserAction.target_type == 'user'
                )
            )
        ).filter(
            UserAction.is_deleted == False  # 添加过滤条件，排除已软删除的动态
        )

        if since_id is not None:
            last_action = db.session.get(UserAction, since_id)
            if last_action: # 只有当 since_id 有效时才加入过滤条件
                query = query.filter(UserAction.id > since_id)
            else:
                # 如果 since_id 无效 (例如对应的动态被删了)，则认为没有新动态
                return jsonify({'new_count': 0})
            # else: 如果 since_id 无效，默认返回所有新动态计数

        new_count = query.count()
        
        return jsonify({'new_count': new_count})
        
    except Exception as e:
        current_app.logger.error(f"Error in get_following_dynamics_status: {str(e)}")
        return jsonify({'error': '获取关注动态状态失败'}), 500 