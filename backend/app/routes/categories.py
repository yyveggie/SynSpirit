"""
此模块定义了与分类 (Category) 相关的 API 端点。

主要功能:
- 分类的 CRUD 操作。
- 获取属于特定分类的工具列表。
- 支持层级分类 (通过 parent_id)。

依赖模型: Category, Tool
使用 Flask 蓝图: categories_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request
from app import db
from app.models import Category

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('/', methods=['GET'])
def get_categories():
    """获取所有分类"""
    categories = Category.query.all()
    return jsonify([category.to_dict() for category in categories])

@categories_bp.route('/<int:id>', methods=['GET'])
def get_category(id):
    """获取指定ID的分类"""
    category = Category.query.get_or_404(id)
    return jsonify(category.to_dict())

@categories_bp.route('/', methods=['POST'])
def create_category():
    """创建新分类"""
    data = request.json
    
    if not data or 'name' not in data:
        return jsonify({'error': '分类名称不能为空'}), 400
    
    category = Category(
        name=data['name'],
        description=data.get('description'),
        parent_id=data.get('parent_id'),
        icon=data.get('icon')
    )
    
    db.session.add(category)
    db.session.commit()
    
    return jsonify(category.to_dict()), 201

@categories_bp.route('/<int:category_id>/tools', methods=['GET'])
def get_category_tools(category_id):
    """获取特定分类下的工具"""
    category = Category.query.get_or_404(category_id)
    tools = category.tools.all()
    return jsonify({
        'success': True,
        'data': [tool.to_dict() for tool in tools]
    }), 200

@categories_bp.route('/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    """更新分类信息"""
    category = Category.query.get_or_404(category_id)
    data = request.get_json()
    
    if 'name' in data:
        category.name = data['name']
    if 'description' in data:
        category.description = data['description']
    if 'parent_id' in data:
        category.parent_id = data['parent_id']
    if 'icon' in data:
        category.icon = data['icon']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '分类更新成功',
        'data': category.to_dict()
    }), 200

@categories_bp.route('/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    """删除分类"""
    category = Category.query.get_or_404(category_id)
    
    db.session.delete(category)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '分类删除成功'
    }), 200
