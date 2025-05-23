"""
此模块定义了与主题 (Topic) 相关的 API 端点，主要用于知识图谱功能。

主要功能:
- 主题 (Topic) 的 CRUD 操作 (创建、读取、更新、删除)。
- 获取用于 React Flow 的网络数据 (`/topics/network` GET)，包含节点 (主题) 的位置、样式等信息。
- 按 slug 获取主题详情 (`/slug/<slug>` GET)。
- 获取与特定主题关联的文章列表 (`/<topic_id>/articles` GET)。
- 获取与特定主题关联的帖子列表 (`/topics/<topic_slug>/posts` GET)。
- 包含 slug 生成辅助函数。
- 保存用户特定的节点位置 (`/topics/save_positions` POST)。
- 获取用户特定的网络图数据 (`/topics/user_network` GET)。

依赖模型: Topic, Article, Post, UserTopicPosition, UserFavoriteTopic, UserAction
使用 Flask 蓝图: topics_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request, current_app
from app import db
from app.models import Topic, Article, Post, UserTopicPosition, UserFavoriteTopic, UserAction
from sqlalchemy.exc import IntegrityError
import re
from sqlalchemy.orm import joinedload
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app.utils.auth_utils import admin_required

# 创建蓝图
topics_bp = Blueprint('topics_bp', __name__)

def generate_slug(name):
    # 简单的 slug 生成器，移除特殊字符，转小写，用连字符连接
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug) # 移除非字母数字、空格、连字符
    slug = re.sub(r'[\s_]+', '-', slug) # 替换空格和下划线为连字符
    slug = re.sub(r'^-+|-+$', '', slug) # 移除开头和结尾的连字符
    return slug

@topics_bp.route('/topics/network', methods=['GET'])
def get_topic_network():
    """获取用于 React Flow 的节点和边数据（全局默认位置）"""
    try:
        topics = Topic.query.all()
        # 不再查询relations，因为表已被删除
        # relations = TopicRelation.query.all()

        nodes = []
        for topic in topics:
            node_style = {
                'backgroundColor': topic.style_bgcolor,
                'color': topic.style_fgcolor,
                'width': topic.style_width,
                'height': topic.style_height,
                'borderRadius': '50%' if topic.style_shape == 'circle' else '5px', # 根据形状设置圆角
                 # 为了文字居中，添加 flex 布局样式
                'display': 'flex',
                'alignItems': 'center',
                'justifyContent': 'center',
                'textAlign': 'center',
                'border': '1px solid #888' # 默认边框，可以后续添加到模型
            }
            nodes.append({
                'id': str(topic.id), # React Flow 需要字符串 ID
                'position': {'x': topic.pos_x, 'y': topic.pos_y},
                'data': { 
                    'label': topic.name,
                    'slug': topic.slug # 将 slug 也放入 data
                },
                'style': node_style # 应用节点样式
                # 可以根据需要添加 type: 'input' 或 'output' 等
            })

        # 不再生成edges，因为关系表已被删除
        edges = []

        return jsonify({'nodes': nodes, 'edges': edges})
    
    except Exception as e:
        # 添加日志记录会更好
        print(f"Error fetching topic network: {e}") 
        return jsonify({'error': '获取主题网络数据失败'}), 500

@topics_bp.route('/topics/user_network', methods=['GET'])
@jwt_required()
def get_user_topic_network():
    """获取用于 React Flow 的节点和边数据（用户特定位置）"""
    try:
        current_user_id = get_jwt_identity()
        
        # 首先获取所有主题
        topics = Topic.query.all()
        # 不再查询relations，因为表已被删除
        # relations = TopicRelation.query.all()
        
        # 获取当前用户的所有自定义节点位置
        user_positions = UserTopicPosition.query.filter_by(user_id=current_user_id).all()
        
        # 建立一个字典，映射主题ID到用户自定义位置
        position_map = {pos.topic_id: {'x': pos.pos_x, 'y': pos.pos_y} for pos in user_positions}

        nodes = []
        for topic in topics:
            node_style = {
                'backgroundColor': topic.style_bgcolor,
                'color': topic.style_fgcolor,
                'width': topic.style_width,
                'height': topic.style_height,
                'borderRadius': '50%' if topic.style_shape == 'circle' else '5px',
                'display': 'flex',
                'alignItems': 'center',
                'justifyContent': 'center',
                'textAlign': 'center',
                'border': '1px solid #888'
            }
            
            # 使用用户自定义位置，如果存在的话；否则使用默认位置
            position = position_map.get(topic.id, {'x': topic.pos_x, 'y': topic.pos_y})
            
            nodes.append({
                'id': str(topic.id),
                'position': position,
                'data': { 
                    'label': topic.name,
                    'slug': topic.slug
                },
                'style': node_style
            })

        # 不再生成edges，因为关系表已被删除
        edges = []

        return jsonify({'nodes': nodes, 'edges': edges})
    
    except Exception as e:
        print(f"Error fetching user topic network: {e}") 
        return jsonify({'error': '获取用户特定主题网络数据失败'}), 500

@topics_bp.route('/topics/save_positions', methods=['POST'])
@jwt_required()
def save_user_positions():
    """保存用户对节点的位置调整"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        if not data or 'nodes' not in data:
            return jsonify({'error': '缺少节点位置数据'}), 400
            
        nodes = data['nodes']
        positions_updated = 0
        
        for node in nodes:
            topic_id = int(node['id'])  # React Flow 使用字符串 ID，需要转回整数
            position = node['position']
            
            # 检查该用户是否已有该主题的位置记录
            user_position = UserTopicPosition.query.filter_by(
                user_id=current_user_id, 
                topic_id=topic_id
            ).first()
            
            if user_position:
                # 更新现有记录
                user_position.pos_x = position['x']
                user_position.pos_y = position['y']
            else:
                # 创建新记录
                user_position = UserTopicPosition(
                    user_id=current_user_id,
                    topic_id=topic_id,
                    pos_x=position['x'],
                    pos_y=position['y']
                )
                db.session.add(user_position)
                
            positions_updated += 1
        
        db.session.commit()
        return jsonify({
            'message': f'成功保存 {positions_updated} 个节点位置',
            'positions_updated': positions_updated
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error saving user positions: {e}")
        return jsonify({'error': '保存节点位置失败'}), 500

@topics_bp.route('/', methods=['POST'])
@jwt_required()
@admin_required
def create_topic():
    """创建新主题 (仅管理员)"""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': '缺少主题名称'}), 400

    name = data['name']
    # 如果前端没提供 slug，自动生成一个
    slug = data.get('slug', generate_slug(name))
    
    # 检查 slug 是否已存在
    if Topic.query.filter_by(slug=slug).first():
         # 如果自动生成的 slug 冲突，尝试添加后缀 (简单处理)
         if not data.get('slug'): 
             count = 1
             original_slug = slug
             while Topic.query.filter_by(slug=slug).first():
                 slug = f"{original_slug}-{count}"
                 count += 1
         else:
             return jsonify({'error': '主题 slug 已存在'}), 409 # 409 Conflict

    new_topic = Topic(
        name=name,
        slug=slug,
        description=data.get('description'),
        pos_x=float(data.get('pos_x', 0.0)),
        pos_y=float(data.get('pos_y', 0.0)),
        style_bgcolor=data.get('style_bgcolor', '#ffffff'),
        style_fgcolor=data.get('style_fgcolor', '#333333'),
        style_width=int(data.get('style_width', 70)),
        style_height=int(data.get('style_height', 70)),
        style_shape=data.get('style_shape', 'rectangle')
    )
    
    try:
        db.session.add(new_topic)
        db.session.commit()
        return jsonify(new_topic.to_dict()), 201
    except IntegrityError as e:
        db.session.rollback()
        # 可能是其他唯一约束冲突，虽然我们已经检查了 slug
        print(f"Database integrity error: {e}")
        return jsonify({'error': '创建主题时数据库出错'}), 500
    except Exception as e:
        db.session.rollback()
        print(f"Error creating topic: {e}")
        return jsonify({'error': '创建主题失败'}), 500

# --- 实现 Topic CRUD --- 

@topics_bp.route('/', methods=['GET'])
def get_topics():
    """获取所有主题列表"""
    try:
        topics = Topic.query.order_by(Topic.name).all()
        return jsonify([topic.to_dict() for topic in topics])
    except Exception as e:
        print(f"Error fetching topics: {e}")
        return jsonify({'error': '获取主题列表失败'}), 500

@topics_bp.route('/<int:topic_id>', methods=['GET'])
def get_topic(topic_id):
    """获取单个主题详情"""
    try:
        topic = Topic.query.get_or_404(topic_id)
        return jsonify(topic.to_dict())
    except Exception as e:
        print(f"Error fetching topic {topic_id}: {e}")
        return jsonify({'error': '获取主题详情失败'}), 500

@topics_bp.route('/<int:topic_id>', methods=['PUT'])
def update_topic(topic_id):
    """更新主题信息"""
    topic = Topic.query.get_or_404(topic_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少更新数据'}), 400

    # 逐个更新字段，提供默认值或保留原值
    topic.name = data.get('name', topic.name)
    topic.description = data.get('description', topic.description)
    topic.pos_x = float(data.get('pos_x', topic.pos_x))
    topic.pos_y = float(data.get('pos_y', topic.pos_y))
    topic.style_bgcolor = data.get('style_bgcolor', topic.style_bgcolor)
    topic.style_fgcolor = data.get('style_fgcolor', topic.style_fgcolor)
    topic.style_width = int(data.get('style_width', topic.style_width))
    topic.style_height = int(data.get('style_height', topic.style_height))
    topic.style_shape = data.get('style_shape', topic.style_shape)

    # 处理 slug 更新，检查唯一性
    new_slug = data.get('slug')
    if new_slug and new_slug != topic.slug:
        new_slug = generate_slug(new_slug) # 清理 slug
        if not new_slug:
             return jsonify({'error': '提供的 slug 无效'}), 400
        existing_topic = Topic.query.filter(Topic.slug == new_slug, Topic.id != topic_id).first()
        if existing_topic:
            return jsonify({'error': f'Slug "{new_slug}" 已被其他主题使用'}), 409
        topic.slug = new_slug
    elif not topic.slug: # 如果原 slug 为空且未提供新 slug，尝试从 name 生成
        topic.slug = generate_slug(topic.name)
        # 确保生成的 slug 唯一
        if Topic.query.filter(Topic.slug == topic.slug, Topic.id != topic_id).first():
           count = 1
           original_slug = topic.slug
           while Topic.query.filter(Topic.slug == topic.slug, Topic.id != topic_id).first():
               topic.slug = f"{original_slug}-{count}"
               count += 1

    try:
        db.session.commit()
        return jsonify(topic.to_dict())
    except Exception as e:
        db.session.rollback()
        print(f"Error updating topic {topic_id}: {e}")
        return jsonify({'error': '更新主题失败'}), 500

@topics_bp.route('/<int:topic_id>', methods=['DELETE'])
def delete_topic(topic_id):
    """删除主题"""
    topic = Topic.query.get_or_404(topic_id)
    try:
        # 删除关联关系由 cascade='all, delete-orphan' 处理
        db.session.delete(topic)
        db.session.commit()
        return '', 204 # No Content
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting topic {topic_id}: {e}")
        return jsonify({'error': '删除主题失败'}), 500

# --- 新增：按 slug 获取主题 --- 
@topics_bp.route('/slug/<string:slug>', methods=['GET'])
def get_topic_by_slug(slug):
    """通过 slug 获取主题详情，并附加用户收藏状态"""
    # --- 修改：移除 flush=True ---
    current_app.logger.info(f"[DEBUG] Received request for slug: '{slug}' (Type: {type(slug)}, Length: {len(slug)})")
    # --- 结束修改 ---
    try:
        topic = Topic.query.filter_by(slug=slug).first()
        # --- 修改：移除 flush=True ---
        current_app.logger.info(f"[DEBUG] Query result for slug '{slug}': {topic}")
        # --- 结束修改 ---
        if topic:
            is_favorited = False
            user_id = None
            try:
                verify_jwt_in_request(optional=True)
                user_identity = get_jwt_identity()
                if user_identity:
                     user_id = int(user_identity) # Assuming id is int
            except Exception as e:
                current_app.logger.info(f"JWT optional check failed for topic slug {slug}: {e}")
                pass

            if user_id:
                # 检查用户是否收藏了此 Topic
                is_favorited = UserFavoriteTopic.query.filter_by(user_id=user_id, topic_id=topic.id).first() is not None
            
            topic_dict = topic.to_dict()
            topic_dict['is_favorited'] = is_favorited # 添加收藏状态
            return jsonify(topic_dict)
        else:
            return jsonify({'error': '无效的主题标识符。'}), 404
    except Exception as e:
        # --- 修改：使用 Flask logger，移除 flush=True ---
        current_app.logger.error(f"Error fetching topic by slug {slug}: {e}")
        # --- 结束修改 ---
        return jsonify({'error': '获取主题详情失败'}), 500

# --- 新增：获取特定主题下的文章列表 --- 
@topics_bp.route('/<int:topic_id>/articles', methods=['GET'])
def get_topic_articles(topic_id):
    """获取指定主题下的所有已发布文章"""
    topic = Topic.query.get_or_404(topic_id)
    
    # 获取分页参数
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    try:
        # --- 修改：查询 Post 模型而不是 Article --- 
        pagination = Post.query.filter_by(topic_id=topic_id, is_published=True)\
                                .order_by(Post.created_at.desc())\
                                .paginate(page=page, per_page=per_page, error_out=False)
        # --- 结束修改 --- 
                                
        posts = pagination.items # 变量名改为 posts
        total_posts = pagination.total # 变量名改为 total_posts
        
        # --- 修改：使用 post.to_dict ---
        return jsonify({
            'posts': [post.to_dict(include_content=False) for post in posts], # 返回 posts 列表
            'total': total_posts,
            'page': page,
            'per_page': per_page,
            'pages': pagination.pages
        })
        # --- 结束修改 ---
    except Exception as e:
        # --- 修改：日志记录和错误信息 ---
        current_app.logger.error(f"获取主题 {topic_id} 的帖子列表失败: {e}")
        return jsonify({'error': '获取主题帖子列表失败'}), 500
        # --- 结束修改 ---

# --- 新增：按 Topic Slug 获取帖子列表 (从 posts.py 移动过来) ---
@topics_bp.route('/topics/<string:topic_slug>/posts', methods=['GET'])
def get_posts_by_topic_slug(topic_slug):
    '''根据主题的 slug 获取该主题下的所有帖子列表'''
    try:
        current_app.logger.info(f"[Topic Posts] Fetching posts for slug: {topic_slug}") # Log slug
        # 1. 根据 slug 查找 Topic
        topic = Topic.query.filter_by(slug=topic_slug).first()
        if not topic:
            current_app.logger.warning(f"[Topic Posts] Topic with slug '{topic_slug}' not found.")
            return jsonify({'error': '指定的主题不存在'}), 404

        current_app.logger.info(f"[Topic Posts] Found topic: ID={topic.id}, Name={topic.name}") # Log found topic ID

        # 2. 查询该 Topic 下的所有 Post
        posts_query = Post.query.options(joinedload(Post.author)) \
                              .filter_by(topic_id=topic.id) # Filter by found topic ID
        
        # Log count BEFORE ordering and pagination
        count = posts_query.count()
        current_app.logger.info(f"[Topic Posts] Found {count} posts for topic ID {topic.id} before ordering/pagination.")

        posts_query = posts_query.order_by(Post.created_at.desc()) # Apply ordering
        
        # --- 可选：添加分页 ---
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('limit', 10, type=int) # 默认每页10条
        pagination = posts_query.paginate(page=page, per_page=per_page, error_out=False)
        posts = pagination.items
        total = pagination.total # This should ideally match 'count' if no further filtering
        current_app.logger.info(f"[Topic Posts] Pagination results: page={page}, per_page={per_page}, items_count={len(posts)}, total_db_records={total}")
        # --- 结束分页 ---

        # --- 为每个帖子添加用户交互状态 ---
        user_id = None
        try:
            # 尝试验证可选的 JWT，如果用户未登录则不强制要求
            verify_jwt_in_request(optional=True)
            user_identity = get_jwt_identity()
            if user_identity:
                user_id = int(user_identity)
        except Exception as e:
            current_app.logger.info(f"[Topic Posts] JWT check failed or user not logged in for topic {topic_slug}: {e}")
            # 用户未登录或 token 无效，继续匿名访问

        processed_posts_data = []
        for post in posts:
            post_dict = post.to_dict(include_content=True) # 或者根据前端实际需要调整 include_content
            is_liked = False
            is_collected = False
            like_action_id = None
            collect_action_id = None

            if user_id:
                like_action = UserAction.query.filter_by(
                    user_id=user_id, 
                    action_type='like', 
                    target_type='post', 
                    target_id=post.id
                ).first()
                if like_action:
                    is_liked = True
                    like_action_id = like_action.id
                
                collect_action = UserAction.query.filter_by(
                    user_id=user_id, 
                    action_type='collect', 
                    target_type='post', 
                    target_id=post.id
                ).first()
                if collect_action:
                    is_collected = True
                    collect_action_id = collect_action.id
            
            post_dict['is_liked'] = is_liked
            post_dict['is_collected'] = is_collected
            post_dict['like_action_id'] = like_action_id
            post_dict['collect_action_id'] = collect_action_id
            processed_posts_data.append(post_dict)
        # --- 结束添加用户交互状态 ---

        # 3. 返回结果
        topic_data = topic.to_dict()
        response_data = {
            'posts': processed_posts_data, # 使用处理过的帖子数据
            'topic': topic_data, 
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': pagination.pages
        }
        # Be cautious logging full response if posts content can be large
        # current_app.logger.debug(f"[Topic Posts] Returning data: {response_data}") 
        current_app.logger.info(f"[Topic Posts] Returning {len(processed_posts_data)} posts for topic {topic.id}.")
        return jsonify(response_data)
        
    except Exception as e:
        current_app.logger.error(f"[Topic Posts] Error fetching posts for topic {topic_slug}: {e}", exc_info=True) # Add exc_info for full traceback in log
        # import traceback # No need if using exc_info=True
        # traceback.print_exc() 
        return jsonify({'error': f'获取主题 {topic_slug} 的帖子列表失败'}), 500

# --- TODO: 添加其他 CRUD 路由 --- 
# GET /topics
# GET /topics/<id>
# PUT /topics/<id>
# DELETE /topics/<id>
# POST /topic_relations
# GET /topic_relations
# PUT /topic_relations/<id>
# DELETE /topic_relations/<id> 