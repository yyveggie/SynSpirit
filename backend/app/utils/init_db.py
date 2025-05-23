import json
from app import db
from app.models import Category

def init_categories():
    """初始化分类数据"""
    # 检查是否已有数据
    if Category.query.first() is not None:
        return
    
    # 添加基础分类
    categories = [
        {"name": "提示工程策略", "description": "帮助用户更好地与AI交互的提示词技巧和策略", "icon": "lightbulb"},
        {"name": "教育工具", "description": "用于学习和教学的AI工具", "icon": "book"},
        {"name": "创意与设计", "description": "用于设计、创意和艺术创作的AI工具", "icon": "palette"},
        {"name": "文本与内容", "description": "用于文本生成、编辑和优化的AI工具", "icon": "file-alt"},
        {"name": "图像生成", "description": "用于生成和编辑图像的AI工具", "icon": "image"},
        {"name": "视频处理", "description": "用于视频创作和编辑的AI工具", "icon": "video"},
        {"name": "音频处理", "description": "用于音频生成和编辑的AI工具", "icon": "music"},
        {"name": "编程助手", "description": "用于辅助编程和开发的AI工具", "icon": "code"},
        {"name": "数据分析", "description": "用于数据处理和分析的AI工具", "icon": "chart-bar"},
        {"name": "生产力工具", "description": "提高工作效率的AI工具", "icon": "tasks"},
        {"name": "研究助手", "description": "辅助研究和学术工作的AI工具", "icon": "microscope"},
        {"name": "新兴AI趋势", "description": "最新的AI技术趋势和工具", "icon": "rocket"}
    ]
    
    for category_data in categories:
        category = Category(
            name=category_data["name"],
            description=category_data["description"],
            icon=category_data["icon"]
        )
        db.session.add(category)
    
    db.session.commit()
    print("分类数据初始化完成，共添加", len(categories), "个分类。")
