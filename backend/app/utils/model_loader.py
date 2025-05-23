"""
模型加载工具

用于解决循环导入问题的辅助模块。
通过延迟加载模型，避免在应用初始化阶段出现循环导入问题。
"""

# 缓存已加载的模型
_models_cache = {}

def get_model(model_name):
    """
    延迟加载指定的模型类
    
    Args:
        model_name: 要加载的模型名称(Article, Post, Dynamic, User等)
    
    Returns:
        模型类
    """
    if model_name in _models_cache:
        return _models_cache[model_name]
    
    # 延迟导入模型
    from app.models import Article, Post, Dynamic, User
    
    # 可用模型映射
    model_map = {
        'Article': Article,
        'Post': Post,
        'Dynamic': Dynamic,
        'User': User
    }
    
    if model_name not in model_map:
        raise ValueError(f"未知的模型名称: {model_name}")
    
    # 缓存并返回模型
    _models_cache[model_name] = model_map[model_name]
    return _models_cache[model_name] 