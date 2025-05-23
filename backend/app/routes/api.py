"""
此模块定义了通用的、基础性的 API 端点。

主要功能:
- 提供 `/health` 健康检查端点，用于确认服务状态和数据库连接。

依赖模型: (间接依赖 db)
使用 Flask 蓝图: api_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request, current_app, Response, send_file
from app import db
import requests
import os
import hashlib
from urllib.parse import urlparse, unquote
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.utils.cache_manager import CacheStats
import time

api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查端点，用于确认API服务正常运行"""
    try:
        # 尝试执行一个简单的数据库查询
        db.session.execute('SELECT 1').fetchone()
        return jsonify({
            'status': 'ok',
            'message': '服务正常运行',
            'database': 'connected'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': '服务运行中，但数据库连接异常',
            'error': str(e),
            'database': 'disconnected'
        }), 500 

@api_bp.route('/info')
def api_info():
    return jsonify({
        'name': 'SynSpirit API',
        'version': '1.0.0',
        'status': 'running'
    })

# --- 修改：图片代理路由，增加本地缓存功能 ---
@api_bp.route('/proxy-image')
def proxy_image():
    """
    代理图片请求，解决跨域问题，并实现本地缓存。
    客户端可以通过 /api/proxy-image?url=<图片URL> 访问任何图片资源。
    """
    url_param = request.args.get('url')
    if not url_param:
        return jsonify({"error": "请提供图片URL参数"}), 400

    # --- 新增：对获取到的 URL 参数进行解码 --- 
    try:
        original_url = unquote(url_param)
        current_app.logger.info(f"解码后的原始 URL: {original_url}")
    except Exception as decode_err:
        current_app.logger.error(f"URL 解码失败: {url_param}, Error: {decode_err}")
        return jsonify({"error": "无效的图片URL参数"}), 400
    # --- 结束新增 --- 

    # 获取缓存目录路径 (在 create_app 中配置)
    cache_dir = current_app.config.get('IMAGE_CACHE_FOLDER')
    if not cache_dir:
        current_app.logger.error("图片缓存目录未配置!")
        return jsonify({"error": "服务器内部错误：缓存未配置"}), 500

    try:
        # --- 修改：使用解码后的 original_url 生成哈希和请求 --- 
        url_hash = hashlib.md5(original_url.encode('utf-8')).hexdigest()
        parsed_url = urlparse(original_url)
        # --- 结束修改 ---
        _, ext = os.path.splitext(parsed_url.path)
        if not ext:
            # 如果URL路径没有扩展名，尝试从查询参数或直接猜测（这里简化，默认为.jpg）
            ext = '.jpg' 
        cache_filename = f"{url_hash}{ext}"
        cache_filepath = os.path.join(cache_dir, cache_filename)

        # 检查缓存是否存在
        if os.path.exists(cache_filepath):
            current_app.logger.info(f"提供缓存图片: {cache_filepath} for url: {original_url}")
            return send_file(cache_filepath)

        # 缓存不存在，从源地址获取
        current_app.logger.info(f"缓存未命中，正在下载图片: {original_url}")
        # --- 修改：使用解码后的 original_url 发起请求 --- 
        # --- 新增：添加详细日志 --- 
        current_app.logger.info(f"Proxy: Attempting download from: {original_url}")
        image_response = requests.get(original_url, stream=True, timeout=20) 
        current_app.logger.info(f"Proxy: Download response status code: {image_response.status_code}")
        # --- 结束新增 --- 
        # --- 结束修改 ---

        if image_response.status_code != 200:
            # --- 修改：日志中记录解码后的 URL --- 
            current_app.logger.error(f"从源地址 {original_url} 获取图片失败，状态码: {image_response.status_code}")
            return jsonify({
                "error": f"无法从源服务器获取图片，状态码: {image_response.status_code}"
            }), image_response.status_code
            # --- 结束修改 ---
        
        # 确保缓存目录存在
        os.makedirs(cache_dir, exist_ok=True)
        
        # 将下载的图片写入缓存文件
        with open(cache_filepath, 'wb') as f:
            for chunk in image_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        current_app.logger.info(f"图片已缓存: {cache_filepath}")
        
        # 发送缓存的文件
        return send_file(cache_filepath)

    except requests.exceptions.Timeout:
        current_app.logger.error(f"代理图片请求超时: {original_url}")
        return jsonify({"error": "请求图片超时"}), 504 # Gateway Timeout
    except requests.exceptions.RequestException as e:
        current_app.logger.error(f"代理图片请求失败 ({original_url}): {str(e)}")
        return jsonify({"error": f"请求图片失败: {str(e)}"}), 500
    except Exception as e:
        # 捕获文件写入等其他潜在错误
        current_app.logger.error(f"代理图片时发生未知错误 ({original_url}): {str(e)} ({type(e).__name__})")
        # 如果缓存写入失败，尝试清理可能不完整的文件
        if 'cache_filepath' in locals() and os.path.exists(cache_filepath):
            try:
                os.remove(cache_filepath)
            except Exception as remove_err:
                current_app.logger.error(f"清理缓存文件失败: {remove_err}")
        return jsonify({"error": f"服务器内部错误"}), 500
# --- 结束修改 --- 

@api_bp.route('/cache-stats', methods=['GET'])
@jwt_required()  # 限制只有已登录用户可访问
def get_cache_stats():
    """获取Redis缓存统计信息"""
    try:
        # 获取Redis缓存统计
        stats = CacheStats.get_stats()
        
        # 添加额外信息
        stats['server_time'] = time.strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({
            'status': 'success',
            'data': stats
        })
    except Exception as e:
        current_app.logger.error(f"获取缓存统计信息失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"获取缓存统计失败: {str(e)}"
        }), 500