#!/usr/bin/env python
"""
启动检查脚本

检查应用程序是否可以正确启动，并验证修复是否成功
"""

import os
import sys
import importlib
import traceback

def main():
    """运行启动检查"""
    print("=========== SynSpirit 启动检查 ===========")
    
    # 检查点1: 导入app模块
    print("\n1. 检查app模块导入...")
    try:
        import app
        print("✅ app模块导入成功")
    except Exception as e:
        print(f"❌ app模块导入失败: {e}")
        traceback.print_exc()
        return False
    
    # 检查点2: 验证配置加载
    print("\n2. 检查配置加载...")
    try:
        from app.config import API_HOST, API_PORT
        print(f"✅ 配置加载成功: API_HOST={API_HOST}, API_PORT={API_PORT}")
    except Exception as e:
        print(f"❌ 配置加载失败: {e}")
        traceback.print_exc()
        return False
    
    # 检查点3: 验证图片预加载器是否可导入
    print("\n3. 检查图片预加载器...")
    try:
        from app.utils.model_loader import get_model
        print("✅ 模型加载器导入成功")
        # 尝试获取模型
        Article = get_model('Article')
        print(f"✅ 从模型加载器获取Article模型成功")
    except Exception as e:
        print(f"❌ 模型加载器测试失败: {e}")
        traceback.print_exc()
        return False
    
    # 检查点4: 验证错误处理器是否可导入
    print("\n4. 检查错误处理器...")
    try:
        from app.utils.error_handler import ErrorHandler
        print("✅ 错误处理器导入成功")
    except Exception as e:
        print(f"❌ 错误处理器导入失败: {e}")
        traceback.print_exc()
        return False
    
    # 检查点5: 验证应用程序创建是否成功
    print("\n5. 检查应用程序创建...")
    try:
        from app import create_app
        app = create_app()
        print("✅ 应用程序创建成功")
    except Exception as e:
        print(f"❌ 应用程序创建失败: {e}")
        traceback.print_exc()
        return False
    
    print("\n=========== 检查结果 ===========")
    print("✅ 所有测试通过！应用程序启动检查成功。")
    print("您现在可以运行 ./start.sh 启动应用")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 