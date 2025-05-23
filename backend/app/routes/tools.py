"""
此模块定义了与工具 (Tool) 相关的 API 端点。

主要功能:
- 工具 (Tool) 的 CRUD 操作 (创建、读取、更新)。(删除操作可能缺失或在其他地方)
- 获取所有工具列表，支持按分类、标签筛选，分页和排序。
- 按 ID 或 slug 获取工具详情。
- 获取所有工具的唯一标签列表。
- 为工具添加反馈 (Feedback)。
- 根据 URL 生成工具描述 (调用外部服务 tool_generator)。
- 工具的语义搜索 (调用外部服务 VectorStore)。
- 提供简单的工具列表页 (`/list`) 和详情页 (`/view/<slug>`) 的 HTML 渲染 (可能用于后台或简单预览)。

依赖模型: Tool, Category, Feedback
外部服务: tool_generator, VectorStore
使用 Flask 蓝图: tools_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request, render_template
from app import db
from app.models import Tool, Category, Feedback
from app.services.tool_generator import generate_tool_description
from app.services.vector_store import VectorStore
from sqlalchemy import desc, true, func, cast, JSON
from sqlalchemy.dialects.postgresql import JSONB

tools_bp = Blueprint('tools', __name__, template_folder='../templates')

@tools_bp.route('/tags', methods=['GET'])
def get_tool_tags():
    """获取所有工具中出现过的唯一标签列表"""
    try:
        # 查询所有工具的tags字段，过滤掉null值
        all_tags_lists = db.session.query(Tool.tags).filter(Tool.tags != None).all()
        
        unique_tags = set()
        for tags_list, in all_tags_lists: # Unpack the tuple
            if isinstance(tags_list, list): # Ensure it's a list
                 # Filter out any non-string items just in case
                valid_tags = [tag for tag in tags_list if isinstance(tag, str)]
                unique_tags.update(valid_tags)
            elif isinstance(tags_list, str): # Handle if tags are stored as a single string? (Less ideal)
                print(f"Warning: Expected list for tags, got string: {tags_list}")
                pass 

        # 返回排序后的标签列表
        return jsonify({"tags": sorted(list(unique_tags))})
    except Exception as e:
        print(f"获取工具标签时出错: {e}")
        return jsonify({"error": f"获取标签失败: {str(e)}"}), 500

@tools_bp.route('/', methods=['GET'])
def get_tools():
    """获取所有工具或按类别/标签筛选工具"""
    # 添加响应头以防止缓存
    response_headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    }
    
    category_id = request.args.get('category_id', type=int)
    tag = request.args.get('tag', type=str)
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    
    try:
        query = Tool.query.filter(Tool.is_published == true())
        
        # 应用分类筛选
        if category_id:
            query = query.filter_by(category_id=category_id)
        
        # 应用标签筛选
        if tag:
            query = query.filter(Tool.tags.contains(cast(tag, JSONB)))
        
        # 应用排序
        if sort_by in ['name', 'created_at', 'updated_at', 'popularity', 'rating']:
            order_column = getattr(Tool, sort_by)
            query = query.order_by(desc(order_column) if sort_order == 'desc' else order_column)
        else:
            query = query.order_by(desc(Tool.created_at))
        
        # 分页
        total = query.count()
        tools = query.offset(offset).limit(limit).all()
        
        # 返回响应并添加头部
        response = jsonify({
            'tools': [tool.to_dict() for tool in tools],
            'total': total,
            'offset': offset,
            'limit': limit
        })
        
        # 设置响应头
        for key, value in response_headers.items():
            response.headers[key] = value
        
        return response
    except Exception as e:
        print(f"获取工具列表时出错: {e}")
        # 返回错误响应并添加头部
        response = jsonify({'error': f'获取工具列表失败: {str(e)}'})
        for key, value in response_headers.items():
            response.headers[key] = value
        return response, 500

@tools_bp.route('/<int:id>', methods=['GET'])
def get_tool(id):
    """获取特定工具详情 (按 ID)"""
    tool = Tool.query.get_or_404(id)
    # --- 添加：确保只返回已发布的工具（除非是管理员） ---
    # 需要导入 is_admin, get_user_from_jwt, verify_jwt_in_request, current_app
    # from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
    # from flask import current_app
    # from .utils import is_admin # 假设 is_admin 在 utils 中
    # is_request_from_admin = False
    # try:
    #     verify_jwt_in_request(optional=True)
    #     user_identity = get_jwt_identity()
    #     if user_identity and is_admin(user_identity):
    #         is_request_from_admin = True
    # except Exception as e:
    #     current_app.logger.info(f"JWT check failed for tool {id}: {e}")
    # if not tool.is_published and not is_request_from_admin:
    #     return jsonify({'error': '工具未发布'}), 404
    # --- 结束添加 ---
    return jsonify(tool.to_dict())

# --- 新增：按 slug 获取工具详情 --- 
@tools_bp.route('/slug/<string:slug>', methods=['GET'])
def get_tool_by_slug(slug):
    """获取特定工具详情 (按 slug)"""
    tool = Tool.query.filter_by(slug=slug).first()
    if not tool:
        return jsonify({'error': '找不到指定的工具'}), 404
    # --- 添加：确保只返回已发布的工具（除非是管理员） ---
    # （同上，需要 JWT 检查和 is_admin）
    # is_request_from_admin = ... # 实现管理员检查
    # if not tool.is_published and not is_request_from_admin:
    #     return jsonify({'error': '工具未发布'}), 404
    # --- 结束添加 ---
    return jsonify(tool.to_dict())
# --- 结束新增 ---

@tools_bp.route('/', methods=['POST'])
def create_tool():
    """创建新工具"""
    data = request.json
    
    if not data or 'name' not in data or 'category_id' not in data:
        return jsonify({'error': '工具名称和类别ID不能为空'}), 400
    
    # 验证类别是否存在
    category = Category.query.get(data['category_id'])
    if not category:
        return jsonify({'error': '指定的类别不存在'}), 400
    
    # 创建工具
    tool = Tool(
        name=data['name'],
        description=data.get('description'),
        source_url=data.get('source_url'),
        category_id=data['category_id'],
        tags=data.get('tags'),
        content=data.get('content'),
        features=data.get('features'),
        use_cases=data.get('use_cases'),
        pros=data.get('pros'),
        cons=data.get('cons'),
        is_free=data.get('is_free', True),
        pricing_info=data.get('pricing_info'),
        screenshot_url=data.get('screenshot_url'),
        slug=data.get('slug'),
        installation_steps=data.get('installation_steps')
    )
    
    db.session.add(tool)
    db.session.commit()
    
    # 生成并更新嵌入向量
    VectorStore.update_tool_embedding(tool.id)
    
    return jsonify(tool.to_dict()), 201

@tools_bp.route('/<int:id>', methods=['PUT'])
def update_tool(id):
    """更新工具信息"""
    tool = Tool.query.get_or_404(id)
    data = request.json
    
    if not data:
        return jsonify({'error': '请提供要更新的数据'}), 400
    
    # 更新工具属性 (只更新 data 中存在的字段)
    for key, value in data.items():
        if hasattr(tool, key) and key not in ['id', 'created_at', 'updated_at']: # 排除不可直接修改的字段
            if key == 'category_id':
                 # 验证类别是否存在
                category = Category.query.get(value)
                if not category:
                    return jsonify({'error': '指定的类别不存在'}), 400
            setattr(tool, key, value)

    # 特别处理 is_published (如果来自表单)
    # 注意：如果前端发送的是 JSON, is_published 应该是布尔值
    # 如果前端是 form-data, 则需要如下转换
    # is_published_str = data.get('is_published', None) 
    # if is_published_str is not None:
    #     tool.is_published = is_published_str.lower() == 'true'
    
    db.session.commit()
    
    # 更新嵌入向量
    VectorStore.update_tool_embedding(tool.id)
    
    return jsonify(tool.to_dict())

@tools_bp.route('/<int:id>/feedback', methods=['POST'])
def add_feedback(id):
    """添加工具反馈"""
    tool = Tool.query.get_or_404(id)
    data = request.json
    
    if not data or 'rating' not in data:
        return jsonify({'error': '评分不能为空'}), 400
    
    feedback = Feedback(
        tool_id=id,
        rating=data['rating'],
        comment=data.get('comment'),
        user_email=data.get('user_email')
    )
    
    db.session.add(feedback)
    
    # 更新工具评分
    feedbacks = tool.feedback.all()
    total_rating = sum(f.rating for f in feedbacks) + data['rating']
    tool.rating = total_rating / (len(feedbacks) + 1)
    
    db.session.commit()
    
    return jsonify(feedback.to_dict()), 201

@tools_bp.route('/generate-description', methods=['POST'])
def generate_description():
    """根据源URL生成工具描述"""
    data = request.json
    
    if not data or 'source_url' not in data:
        return jsonify({'error': '源URL不能为空'}), 400
    
    try:
        result = generate_tool_description(data['source_url'])
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@tools_bp.route('/search', methods=['GET'])
def search_tools():
    """语义搜索工具"""
    query = request.args.get('q')
    category_id = request.args.get('category_id', type=int)
    limit = request.args.get('limit', 5, type=int)
    
    if not query:
        return jsonify({'error': '搜索查询不能为空'}), 400
    
    try:
        if category_id:
            results = VectorStore.search_tools_by_category(query, category_id, limit)
        else:
            results = VectorStore.search_similar_tools(query, limit)
        
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 添加页面路由
@tools_bp.route('/list')
def list_tools():
    """显示工具列表页面"""
    page = request.args.get('page', 1, type=int)
    category_id = request.args.get('category_id', type=int)
    per_page = 12  # 每页显示的工具数量
    
    # 构建查询
    query = Tool.query
    
    # 如果提供了类别ID，则按类别筛选
    if category_id:
        query = query.filter_by(category_id=category_id)
    
    # 分页
    pagination = query.order_by(desc(Tool.popularity)).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    # 获取所有类别，用于筛选
    categories = Category.query.all()
    
    return render_template('tools.html', 
                           tools=pagination.items, 
                           pagination=pagination, 
                           categories=categories,
                           current_category_id=category_id)

@tools_bp.route('/view/<slug>')
def view_tool(slug):
    """显示单个工具详情页面"""
    tool = Tool.query.filter_by(slug=slug).first_or_404()
    
    # 增加工具的访问量
    tool.popularity += 1
    db.session.commit()
    
    # 获取相关工具
    related_tools = []
    if tool.category_id:
        related_tools = Tool.query.filter(
            Tool.category_id == tool.category_id,
            Tool.id != tool.id
        ).order_by(desc(Tool.popularity)).limit(3).all()
    
    return render_template('tool_detail.html', tool=tool, related_tools=related_tools)
