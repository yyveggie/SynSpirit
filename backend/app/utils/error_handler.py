"""
增强错误处理模块

提供全站错误处理功能，包括：
- 针对不同类型的请求提供个性化错误响应
- 404错误智能处理，包括文章slug、用户名等路径模式的识别
- 错误日志记录和分析
- 管理员错误监控接口
"""

from flask import jsonify, request, current_app, render_template, redirect
import re
import time
import json
import threading
from collections import defaultdict, Counter
import traceback
from datetime import datetime, timedelta

# 定义URL模式及错误提示
URL_PATTERNS = [
    # 文章相关
    (re.compile(r'/api/articles/([^/]+)'), "文章不存在或已被删除"),
    (re.compile(r'/articles/([^/]+)'), "文章不存在或已被删除"),
    # 用户相关
    (re.compile(r'/api/users/([^/]+)'), "用户不存在或已被删除"),
    (re.compile(r'/users/([^/]+)'), "用户不存在或已被删除"),
    # 帖子相关
    (re.compile(r'/api/posts/([^/]+)'), "帖子不存在或已被删除"),
    (re.compile(r'/posts/([^/]+)'), "帖子不存在或已被删除"),
    # 动态相关
    (re.compile(r'/api/dynamics/([^/]+)'), "动态不存在或已被删除"),
    (re.compile(r'/dynamics/([^/]+)'), "动态不存在或已被删除"),
    # 评论相关
    (re.compile(r'/api/comments/([^/]+)'), "评论不存在或已被删除"),
    # 后台相关
    (re.compile(r'/api/admin/'), "管理员功能不存在或无权限访问"),
]

# 错误计数和统计
_error_lock = threading.Lock()
_error_stats = {
    'last_reset': time.time(),
    'total_count': 0,
    'by_code': defaultdict(int),  # 按状态码统计
    'by_endpoint': defaultdict(int),  # 按端点统计
    'by_pattern': defaultdict(int),  # 按URL模式统计
    'recent_errors': [],  # 最近的错误列表
    'ip_count': Counter()  # IP计数器
}

class ErrorHandler:
    """错误处理器"""
    
    @staticmethod
    def register_handlers(app):
        """注册所有错误处理器"""
        
        @app.errorhandler(404)
        def handle_not_found(e):
            """处理404错误"""
            path = request.path
            method = request.method
            client_ip = request.remote_addr
            
            # 根据URL模式提供个性化响应
            error_msg = "请求的资源不存在"
            matched_pattern = None
            
            for pattern, msg in URL_PATTERNS:
                if pattern.search(path):
                    error_msg = msg
                    matched_pattern = pattern.pattern
                    break
            
            # 记录错误信息
            ErrorHandler._record_error(404, path, method, client_ip, error_msg, matched_pattern)
            
            # 检查请求是否为API
            if path.startswith('/api/'):
                return jsonify({
                    'error': 'not_found',
                    'message': error_msg,
                    'status': 404
                }), 404
            else:
                # 非API请求可能是前端路由，返回较友好的JSON响应
                return jsonify({
                    'error': 'not_found',
                    'message': error_msg,
                    'status': 404,
                    'path': path
                }), 404
        
        @app.errorhandler(500)
        def handle_server_error(e):
            """处理500错误"""
            path = request.path
            method = request.method
            client_ip = request.remote_addr
            
            # 获取详细的错误信息
            error_detail = str(e)
            error_trace = traceback.format_exc()
            
            # 记录完整错误到日志
            current_app.logger.error(f"服务器错误: {path} - {error_detail}\n{error_trace}")
            
            # 记录错误统计
            ErrorHandler._record_error(500, path, method, client_ip, error_detail)
            
            # API请求返回JSON
            if path.startswith('/api/'):
                return jsonify({
                    'error': 'server_error',
                    'message': '服务器内部错误，请稍后再试',
                    'status': 500
                }), 500
            else:
                # 非API请求返回JSON
                return jsonify({
                    'error': 'server_error',
                    'message': '服务器内部错误，请稍后再试',
                    'status': 500,
                    'path': path
                }), 500
        
        # 注册其他常见错误代码
        for code in [400, 401, 403, 405, 429]:
            app.register_error_handler(code, ErrorHandler._create_error_handler(code))
    
    @staticmethod
    def _create_error_handler(status_code):
        """创建特定状态码的错误处理器"""
        def handler(e):
            path = request.path
            method = request.method
            client_ip = request.remote_addr
            
            # 根据状态码设置错误消息
            error_msgs = {
                400: "请求无效",
                401: "未授权访问",
                403: "禁止访问",
                405: "不支持的请求方法",
                429: "请求过于频繁"
            }
            error_msg = error_msgs.get(status_code, "请求出错")
            
            # 记录错误
            ErrorHandler._record_error(status_code, path, method, client_ip, error_msg)
            
            # 返回JSON响应
            return jsonify({
                'error': f'error_{status_code}',
                'message': error_msg,
                'status': status_code
            }), status_code
        
        return handler
    
    @staticmethod
    def _record_error(status_code, path, method, client_ip, error_msg, pattern=None):
        """记录错误统计信息"""
        with _error_lock:
            # 更新总计数
            _error_stats['total_count'] += 1
            
            # 按状态码统计
            _error_stats['by_code'][status_code] += 1
            
            # 按端点统计 (简化路径，移除ID等)
            endpoint = ErrorHandler._simplify_path(path)
            _error_stats['by_endpoint'][endpoint] += 1
            
            # 按模式统计
            if pattern:
                _error_stats['by_pattern'][pattern] += 1
            
            # 按IP统计
            _error_stats['ip_count'][client_ip] += 1
            
            # 记录最近错误
            # 限制保存的错误数量
            MAX_RECENT_ERRORS = 100
            
            _error_stats['recent_errors'].append({
                'timestamp': datetime.now().isoformat(),
                'status_code': status_code,
                'path': path,
                'method': method,
                'client_ip': client_ip,
                'message': error_msg
            })
            
            # 如果超过最大数量，移除最早的错误
            if len(_error_stats['recent_errors']) > MAX_RECENT_ERRORS:
                _error_stats['recent_errors'] = _error_stats['recent_errors'][-MAX_RECENT_ERRORS:]
    
    @staticmethod
    def _simplify_path(path):
        """简化路径，替换ID为占位符"""
        # 替换数字ID
        path = re.sub(r'/\d+', '/{id}', path)
        # 替换UUID
        path = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{uuid}', path)
        # 替换slug
        path = re.sub(r'/[a-zA-Z0-9_-]+(?=[/?]|$)', '/{slug}', path)
        return path
    
    @staticmethod
    def get_error_stats():
        """获取错误统计信息"""
        with _error_lock:
            # 创建副本避免线程安全问题
            stats_copy = {
                'total_count': _error_stats['total_count'],
                'by_code': dict(_error_stats['by_code']),
                'by_endpoint': dict(_error_stats['by_endpoint']),
                'by_pattern': dict(_error_stats['by_pattern']),
                'recent_errors': _error_stats['recent_errors'][-20:],  # 最近20条
                'top_ips': dict(_error_stats['ip_count'].most_common(10)),  # 前10个IP
                'last_reset': _error_stats['last_reset']
            }
            return stats_copy
    
    @staticmethod
    def reset_stats():
        """重置错误统计"""
        with _error_lock:
            _error_stats['last_reset'] = time.time()
            _error_stats['total_count'] = 0
            _error_stats['by_code'] = defaultdict(int)
            _error_stats['by_endpoint'] = defaultdict(int)
            _error_stats['by_pattern'] = defaultdict(int)
            _error_stats['recent_errors'] = []
            _error_stats['ip_count'] = Counter()
            
        return {"success": True, "message": "错误统计已重置"} 