"""
此模块定义了公共 API 端点，主要用于前端公开展示数据。
(通常在 app/__init__.py 中以 /api 前缀注册)

主要功能:
- 获取所有已发布的工具列表 (`/api/tools`)。
- 通过 slug 获取单个已发布的工具详情 (`/api/tool/<slug>`)。

依赖模型: Tool
使用 Flask 蓝图: api_bp (在 api/__init__.py 中定义)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import jsonify
from . import api_bp
from app.models import Tool

# API: 获取所有已发布的工具列表
@api_bp.route('/tools', methods=['GET'])
def get_published_tools():
    try:
        # 查询所有 is_published=True 的工具，并按创建时间降序排序
        tools = Tool.query.filter_by(is_published=True).order_by(Tool.created_at.desc()).all()
        
        # 将工具列表转换为字典列表
        tools_data = [tool.to_dict() for tool in tools] 
        
        # 返回包含工具列表和总数的对象，与前端期望一致
        response_data = {
            "tools": tools_data,
            "total": len(tools_data),
            # Add limit/offset if implementing pagination later
            "limit": len(tools_data), # Temporary limit
            "offset": 0
        }
        
        return jsonify(response_data), 200
    except Exception as e:
        print(f"Error fetching published tools: {e}") 
        return jsonify({"error": "无法获取工具列表"}), 500

# API: 根据 slug 获取单个工具的详细信息
@api_bp.route('/tool/<string:slug>', methods=['GET'])
def get_tool_by_slug(slug):
    try:
        tool = Tool.query.filter_by(slug=slug, is_published=True).first()
        
        if tool:
            # 假设 Tool 模型有 to_dict() 方法，返回所需的所有信息
            return jsonify(tool.to_dict()), 200
        else:
            return jsonify({"error": "找不到该工具或未发布"}), 404
            
    except Exception as e:
        print(f"Error fetching tool by slug {slug}: {e}")
        return jsonify({"error": "获取工具详情时出错"}), 500

# Add other public API endpoints here later 