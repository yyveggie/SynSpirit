from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt

def admin_required(fn):
    """
    装饰器：确保只有管理员才能访问该端点。
    
    该装饰器必须在 @jwt_required() 之后使用。
    它会检查 JWT 中是否存在 'is_admin': True 的声明。
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # 首先确保 JWT 是有效的 (虽然通常 @jwt_required 已经处理)
        # 但为了安全起见，显式调用 jwt_required()
        # 注意：直接调用 jwt_required() 本身返回的是一个装饰器工厂，
        # 我们需要它的内部逻辑，但不能像在路由上那样简单地应用。
        # 最好的方式是确保 admin_required *总是* 用在 jwt_required 之后。
        
        # 获取当前 JWT 的声明
        claims = get_jwt()
        
        # 检查 is_admin 声明是否存在且为 True
        if claims.get('is_admin') is True:
            # 如果是管理员，执行被装饰的函数
            return fn(*args, **kwargs)
        else:
            # 如果不是管理员，返回 403 Forbidden 错误
            return jsonify({'msg': '仅管理员可访问'}), 403
            
    # 手动应用 jwt_required 以确保在检查权限前用户已认证
    # 这是关键步骤，保证在执行 wrapper 之前 JWT 已经过验证
    return jwt_required()(wrapper) 