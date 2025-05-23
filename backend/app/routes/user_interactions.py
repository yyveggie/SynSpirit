"""
用户交互API路由。
主要提供用户与文章、帖子、动态的交互功能，如点赞、收藏等。
同时提供获取用户历史交互记录的接口。
"""

from flask import Blueprint, request, jsonify, g, current_app
from app.models import db, ArticleInteraction, PostInteraction, ActionInteraction, User, Article, Post, UserAction
from app.models import GlobalInteraction  # 导入全局交互模型
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from sqlalchemy import desc, or_

user_interactions_bp = Blueprint('user_interactions', __name__)

# 交互类型常量
INTERACTION_TYPE_LIKE = 'like'
INTERACTION_TYPE_COLLECT = 'collect'

@user_interactions_bp.route('/users/<user_id>/interactions', methods=['GET'])
@jwt_required()
def get_user_interactions(user_id):
    """
    获取用户的所有交互记录(点赞和收藏)
    
    参数:
    - user_id: 用户ID，使用'me'表示当前登录用户
    
    查询参数:
    - content_type: 内容类型过滤(article, post, action)
    - interaction_type: 交互类型过滤(like, collect)
    - page: 页码，默认为1
    - per_page: 每页条数，默认为10
    """
    current_user_id = get_jwt_identity()
    
    # 处理'me'特殊标识
    if user_id == 'me':
        user_id = current_user_id
    else:
        try:
            user_id = int(user_id)
            # 检查权限，普通用户只能查看自己的交互历史
            if user_id != current_user_id:
                user = User.query.get(current_user_id)
                if not user or not user.is_admin:
                    return jsonify({
                        'code': 403,
                        'message': '您没有权限查看其他用户的交互历史'
                    }), 403
        except ValueError:
            return jsonify({
                'code': 400,
                'message': '无效的用户ID'
            }), 400
    
    # 获取查询参数
    content_type = request.args.get('content_type', None)
    interaction_type = request.args.get('interaction_type', None)
    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 10)), 50)  # 限制最大为50条
    
    # 使用GlobalInteraction模型统一获取交互记录
    # 这将从global_interactions表中获取所有类型的交互
    interactions_pagination = GlobalInteraction.get_user_interactions(
        user_id=user_id,
        content_type=content_type,
        interaction_type=interaction_type,
        page=page,
        per_page=per_page
    )
    
    interactions = []
    
    # 遍历交互记录，填充内容详情
    for interaction in interactions_pagination.items:
        if interaction.content_type == 'article':
            # 获取文章详情
            article = Article.query.get(interaction.content_id)
            if article:  # 确保文章存在
                interactions.append({
                    'id': interaction.id,
                    'type': 'article',
                    'content_id': article.id,
                    'title': article.title,
                    'cover_image': article.cover_image,
                    'created_at': article.created_at.isoformat(),
                    'creator': {
                        'id': article.user_id,
                        'username': User.query.get(article.user_id).nickname if User.query.get(article.user_id) else "未知用户",
                        'avatar': User.query.get(article.user_id).avatar if User.query.get(article.user_id) else None
                    },
                    'interaction_type': interaction.interaction_type,
                    'interacted_at': interaction.created_at.isoformat()
                })
        elif interaction.content_type == 'post':
            # 获取帖子详情
            post = Post.query.get(interaction.content_id)
            if post and post.publication_status == 'published':  # 确保帖子存在且已发布
                interactions.append({
                    'id': interaction.id,
                    'type': 'post',
                    'content_id': post.id,
                    'title': post.title,
                    'cover_image': post.cover_image,
                    'created_at': post.created_at.isoformat(),
                    'creator': {
                        'id': post.user_id,
                        'username': User.query.get(post.user_id).nickname if User.query.get(post.user_id) else "未知用户",
                        'avatar': User.query.get(post.user_id).avatar if User.query.get(post.user_id) else None
                    },
                    'interaction_type': interaction.interaction_type,
                    'interacted_at': interaction.created_at.isoformat()
                })
        elif interaction.content_type == 'action':
            # 获取动态详情
            action = UserAction.query.get(interaction.content_id)
            if action and not action.is_deleted:  # 确保动态存在且未被删除
                # 如果是分享类动态，获取分享内容的摘要
                content_preview = action.content[:100] + '...' if action.content and len(action.content) > 100 else action.content
                
                interactions.append({
                    'id': interaction.id,
                    'type': 'action',
                    'content_id': action.id,
                    'content_preview': content_preview,
                    'images': action.images.split(',') if action.images else [],
                    'action_type': action.action_type,
                    'created_at': action.created_at.isoformat(),
                    'creator': {
                        'id': action.user_id,
                        'username': User.query.get(action.user_id).nickname if User.query.get(action.user_id) else "未知用户",
                        'avatar': User.query.get(action.user_id).avatar if User.query.get(action.user_id) else None
                    },
                    'interaction_type': interaction.interaction_type,
                    'interacted_at': interaction.created_at.isoformat()
                })
    
    return jsonify({
        'code': 200,
        'message': '获取成功',
        'data': {
            'interactions': interactions,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': interactions_pagination.total,
                'pages': interactions_pagination.pages,
                'has_next': interactions_pagination.has_next,
                'has_prev': interactions_pagination.has_prev
            }
        }
    })

# 获取文章交互状态接口
@user_interactions_bp.route('/articles/<int:article_id>/interaction-status', methods=['GET'])
@jwt_required()
def get_article_interaction_status(article_id):
    """获取当前用户与文章的交互状态"""
    user_id = get_jwt_identity()
    
    # 使用GlobalInteraction检查文章交互状态
    is_liked = GlobalInteraction.has_interaction(user_id, 'article', article_id, INTERACTION_TYPE_LIKE)
    is_collected = GlobalInteraction.has_interaction(user_id, 'article', article_id, INTERACTION_TYPE_COLLECT)
    
    return jsonify({
        'code': 200,
        'message': '获取成功',
        'data': {
            'is_liked': is_liked,
            'is_collected': is_collected
        }
    })

# 获取帖子交互状态接口
@user_interactions_bp.route('/posts/<int:post_id>/interaction-status', methods=['GET'])
@jwt_required()
def get_post_interaction_status(post_id):
    """获取当前用户与帖子的交互状态"""
    user_id = get_jwt_identity()
    
    # 使用GlobalInteraction检查帖子交互状态
    is_liked = GlobalInteraction.has_interaction(user_id, 'post', post_id, INTERACTION_TYPE_LIKE)
    is_collected = GlobalInteraction.has_interaction(user_id, 'post', post_id, INTERACTION_TYPE_COLLECT)
    
    return jsonify({
        'code': 200,
        'message': '获取成功',
        'data': {
            'is_liked': is_liked,
            'is_collected': is_collected
        }
    })

# 获取动态交互状态接口
@user_interactions_bp.route('/actions/<int:action_id>/interaction-status', methods=['GET'])
@jwt_required()
def get_action_interaction_status(action_id):
    """获取当前用户与动态的交互状态"""
    user_id = get_jwt_identity()
    
    # 使用GlobalInteraction检查动态交互状态
    is_liked = GlobalInteraction.has_interaction(user_id, 'action', action_id, INTERACTION_TYPE_LIKE)
    is_collected = GlobalInteraction.has_interaction(user_id, 'action', action_id, INTERACTION_TYPE_COLLECT)
    
    return jsonify({
        'code': 200,
        'message': '获取成功',
        'data': {
            'is_liked': is_liked,
            'is_collected': is_collected
        }
    })

# 文章点赞接口
@user_interactions_bp.route('/articles/<int:article_id>/like', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_article_like(article_id):
    """
    添加或取消文章点赞
    
    POST: 添加点赞
    DELETE: 取消点赞
    """
    user_id = get_jwt_identity()
    
    # 检查文章是否存在
    article = Article.query.get(article_id)
    if not article:
        return jsonify({
            'code': 404,
            'message': '文章不存在'
        }), 404
    
    # 获取用户与该文章的点赞关系
    interaction = ArticleInteraction.query.filter_by(
        user_id=user_id,
        article_id=article_id,
        interaction_type=INTERACTION_TYPE_LIKE
    ).first()
    
    if request.method == 'POST':
        # 添加点赞
        if interaction:
            return jsonify({
                'code': 400,
                'message': '您已经点赞过该文章'
            }), 400
        
        new_interaction = ArticleInteraction(
            user_id=user_id,
            article_id=article_id,
            interaction_type=INTERACTION_TYPE_LIKE
        )
        
        # 更新文章点赞计数
        article.likes_count = (article.likes_count or 0) + 1
        
        db.session.add(new_interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '点赞成功',
            'data': {
                'likes_count': article.likes_count
            }
        })
    else:  # DELETE
        # 取消点赞
        if not interaction:
            return jsonify({
                'code': 400,
                'message': '您尚未点赞该文章'
            }), 400
        
        # 更新文章点赞计数
        article.likes_count = max(0, (article.likes_count or 0) - 1)
        
        db.session.delete(interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '取消点赞成功',
            'data': {
                'likes_count': article.likes_count
            }
        })

# 文章收藏接口
@user_interactions_bp.route('/articles/<int:article_id>/collect', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_article_collect(article_id):
    """
    添加或取消文章收藏
    
    POST: 添加收藏
    DELETE: 取消收藏
    """
    user_id = get_jwt_identity()
    
    # 检查文章是否存在
    article = Article.query.get(article_id)
    if not article:
        return jsonify({
            'code': 404,
            'message': '文章不存在'
        }), 404
    
    # 获取用户与该文章的收藏关系
    interaction = ArticleInteraction.query.filter_by(
        user_id=user_id,
        article_id=article_id,
        interaction_type=INTERACTION_TYPE_COLLECT
    ).first()
    
    if request.method == 'POST':
        # 添加收藏
        if interaction:
            return jsonify({
                'code': 400,
                'message': '您已经收藏过该文章'
            }), 400
        
        new_interaction = ArticleInteraction(
            user_id=user_id,
            article_id=article_id,
            interaction_type=INTERACTION_TYPE_COLLECT
        )
        
        # 更新文章收藏计数
        article.collects_count = (article.collects_count or 0) + 1
        
        db.session.add(new_interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '收藏成功',
            'data': {
                'collects_count': article.collects_count
            }
        })
    else:  # DELETE
        # 取消收藏
        if not interaction:
            return jsonify({
                'code': 400,
                'message': '您尚未收藏该文章'
            }), 400
        
        # 更新文章收藏计数
        article.collects_count = max(0, (article.collects_count or 0) - 1)
        
        db.session.delete(interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '取消收藏成功',
            'data': {
                'collects_count': article.collects_count
            }
        })

# 帖子点赞接口
@user_interactions_bp.route('/posts/<int:post_id>/like', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_post_like(post_id):
    """
    添加或取消帖子点赞
    
    POST: 添加点赞
    DELETE: 取消点赞
    """
    user_id = get_jwt_identity()
    
    # 检查帖子是否存在
    post = Post.query.get(post_id)
    if not post:
        return jsonify({
            'code': 404,
            'message': '帖子不存在'
        }), 404
    
    # 获取用户与该帖子的点赞关系
    interaction = PostInteraction.query.filter_by(
        user_id=user_id,
        post_id=post_id,
        interaction_type=INTERACTION_TYPE_LIKE
    ).first()
    
    if request.method == 'POST':
        # 添加点赞
        if interaction:
            return jsonify({
                'code': 400,
                'message': '您已经点赞过该帖子'
            }), 400
        
        new_interaction = PostInteraction(
            user_id=user_id,
            post_id=post_id,
            interaction_type=INTERACTION_TYPE_LIKE
        )
        
        # 更新帖子点赞计数
        post.likes_count = (post.likes_count or 0) + 1
        
        db.session.add(new_interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '点赞成功',
            'data': {
                'likes_count': post.likes_count
            }
        })
    else:  # DELETE
        # 取消点赞
        if not interaction:
            return jsonify({
                'code': 400,
                'message': '您尚未点赞该帖子'
            }), 400
        
        # 更新帖子点赞计数
        post.likes_count = max(0, (post.likes_count or 0) - 1)
        
        db.session.delete(interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '取消点赞成功',
            'data': {
                'likes_count': post.likes_count
            }
        })

# 帖子收藏接口
@user_interactions_bp.route('/posts/<int:post_id>/collect', methods=['POST', 'DELETE'])
@jwt_required()
def toggle_post_collect(post_id):
    """
    添加或取消帖子收藏
    
    POST: 添加收藏
    DELETE: 取消收藏
    """
    user_id = get_jwt_identity()
    
    # 检查帖子是否存在
    post = Post.query.get(post_id)
    if not post:
        return jsonify({
            'code': 404,
            'message': '帖子不存在'
        }), 404
    
    # 获取用户与该帖子的收藏关系
    interaction = PostInteraction.query.filter_by(
        user_id=user_id,
        post_id=post_id,
        interaction_type=INTERACTION_TYPE_COLLECT
    ).first()
    
    if request.method == 'POST':
        # 添加收藏
        if interaction:
            return jsonify({
                'code': 400,
                'message': '您已经收藏过该帖子'
            }), 400
        
        new_interaction = PostInteraction(
            user_id=user_id,
            post_id=post_id,
            interaction_type=INTERACTION_TYPE_COLLECT
        )
        
        # 更新帖子收藏计数
        post.collects_count = (post.collects_count or 0) + 1
        
        db.session.add(new_interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '收藏成功',
            'data': {
                'collects_count': post.collects_count
            }
        })
    else:  # DELETE
        # 取消收藏
        if not interaction:
            return jsonify({
                'code': 400,
                'message': '您尚未收藏该帖子'
            }), 400
        
        # 更新帖子收藏计数
        post.collects_count = max(0, (post.collects_count or 0) - 1)
        
        db.session.delete(interaction)
        db.session.commit()
        
        return jsonify({
            'code': 200,
            'message': '取消收藏成功',
            'data': {
                'collects_count': post.collects_count
            }
        }) 