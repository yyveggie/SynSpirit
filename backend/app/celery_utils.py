"""
Celery工具模块

此模块提供Celery的配置和实例，用于处理后台任务。
"""

from celery import Celery
from flask import Flask

# 创建Celery实例
celery = Celery(
    'app',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/0',
    include=['app.tasks']
)

# 默认Celery配置
celery_config = {
    'broker_url': 'redis://localhost:6379/0',
    'result_backend': 'redis://localhost:6379/0',
    'task_serializer': 'json',
    'accept_content': ['json'],
    'result_serializer': 'json',
    'timezone': 'Asia/Shanghai',
    'worker_max_tasks_per_child': 1000,  # 每个worker子进程处理1000个任务后重启
    'task_routes': {
        'app.tasks.update_*': {'queue': 'updates'},
        'app.tasks.generate_*': {'queue': 'ai_generation'},
    }
}

# 更新Celery配置
celery.conf.update(celery_config)

# 保留之前的模拟类，以备万一
class CeleryAppMock:
    """Celery应用程序的模拟对象"""
    def __init__(self):
        self.conf = {}
    
    def task(self, *args, **kwargs):
        """模拟task装饰器"""
        def decorator(func):
            return func
        return decorator

# 使用真正的Celery实例而不是模拟对象
celery_app = celery 