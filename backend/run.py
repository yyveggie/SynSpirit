#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
SynSpirit 后端服务启动脚本

使用方法：
1. 启动开发服务器：python run.py
2. 使用gunicorn部署：gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker -w 1 -b 0.0.0.0:5001 "run:app"

注意：
- 开发模式下使用Flask内置服务器
- 生产环境建议使用gunicorn搭配gevent
"""

# backend/run.py
# **** Gevent Monkey Patching - START ****
# 必须放在所有其他导入（尤其是标准库和网络相关）之前
from gevent import monkey
monkey.patch_all()
# **** Gevent Monkey Patching - END ****

import os
import sys
import logging
import redis
import time
from dotenv import load_dotenv
from app import create_app as flask_create_app

# 配置日志记录
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('logs/app.log')
    ]
)
logger = logging.getLogger(__name__)

# 创建logs目录
os.makedirs('logs', exist_ok=True)

# 创建Flask应用实例 - 为gunicorn提供
app = flask_create_app()

# 创建应用实例函数 - 保留向后兼容
def create_app():
    return flask_create_app()

# 测试Redis连接
def test_redis_connection():
    try:
        # 加载环境变量以获取Redis URL
        load_dotenv()
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        logger.info(f"尝试连接Redis: {redis_url}")
        
        client = redis.from_url(redis_url)
        test_key = f"redis_test_{time.time()}"
        client.set(test_key, "测试连接成功")
        value = client.get(test_key)
        client.delete(test_key)
        
        if value:
            logger.info(f"Redis连接测试成功: {value.decode('utf-8')}")
            return True
        else:
            logger.error("Redis连接测试失败: 无法写入或读取测试键")
            return False
    except Exception as e:
        logger.error(f"Redis连接测试失败: {e}")
        return False

# 直接运行此脚本时启动Flask开发服务器
if __name__ == '__main__':
    # 加载.env中的环境变量
    load_dotenv()
    
    # 测试Redis连接
    redis_ok = test_redis_connection()
    if not redis_ok:
        logger.warning("Redis连接测试失败，但将继续启动应用")
    
    app_host = os.getenv('API_HOST', '0.0.0.0')
    app_port = int(os.getenv('API_PORT', 5001))
    app_debug = os.getenv('API_DEBUG', 'True').lower() == 'true'
    
    # 打印应用配置信息
    logger.info(f"应用配置: HOST={app_host}, PORT={app_port}, DEBUG={app_debug}")
    logger.info(f"Redis URL: {os.getenv('REDIS_URL', 'redis://localhost:6379/0')}")
    
    # 启动应用
    from app import socketio
    socketio.run(app, host=app_host, port=app_port, debug=app_debug)
