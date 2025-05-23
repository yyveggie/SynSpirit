from app import create_app, db
from app.models import User
import os
import sys
from flask import jsonify
from werkzeug.security import check_password_hash
import traceback

def test_connection():
    """测试数据库连接"""
    try:
        # 创建应用上下文
        app = create_app()
        
        with app.app_context():
            # 尝试查询数据库
            result = db.session.execute('SELECT 1').fetchone()
            print(f"数据库连接测试: {result}")
            
            # 测试用户表
            user_count = User.query.count()
            print(f"用户表中的用户数量: {user_count}")
            
            # 测试第一个用户的信息(如果有)
            if user_count > 0:
                first_user = User.query.first()
                print(f"第一个用户: ID={first_user.id}, Email={first_user.email}")
            
            return True
    except Exception as e:
        print(f"数据库连接错误: {e}")
        traceback.print_exc()
        return False

def test_login(email, password):
    """测试登录功能"""
    try:
        app = create_app()
        
        with app.app_context():
            # 查找用户
            user = User.query.filter_by(email=email).first()
            if not user:
                print(f"未找到用户: {email}")
                return False
            
            # 检查密码
            if check_password_hash(user.password_hash, password):
                print(f"登录成功: {email}")
                print(f"用户详情: ID={user.id}, Email={user.email}, 是否活跃={user.is_active}")
                return True
            else:
                print(f"密码不匹配: {email}")
                return False
    except Exception as e:
        print(f"登录测试错误: {e}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=== 数据库配置信息 ===")
    db_type = os.getenv('DB_TYPE', 'sqlite')
    db_name = os.getenv('DB_NAME', 'ai_tools.db')
    db_host = os.getenv('DB_HOST', 'localhost')
    print(f"数据库类型: {db_type}")
    print(f"数据库名称: {db_name}")
    print(f"数据库主机: {db_host}")
    
    print("\n=== 测试数据库连接 ===")
    connection_ok = test_connection()
    
    if len(sys.argv) > 2:
        email = sys.argv[1]
        password = sys.argv[2]
        print(f"\n=== 测试登录: {email} ===")
        login_ok = test_login(email, password)
    
    print("\n=== 测试结果 ===")
    print(f"数据库连接: {'成功' if connection_ok else '失败'}")
    if 'login_ok' in locals():
        print(f"登录测试: {'成功' if login_ok else '失败'}") 