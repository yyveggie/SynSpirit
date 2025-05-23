# -*- coding: utf-8 -*-
"""
此模块包含用于处理文件上传（特别是图片）到腾讯云 COS 的 Flask 蓝图。
主要提供:
- /api/upload/image 端点，用于通过 POST 请求上传单个图片文件。
- /api/upload/images 端点，用于通过 POST 请求上传多个图片文件。
- /api/proxy/image 端点，用于代理访问腾讯云COS上的图片，解决跨域问题。
上传过程需要用户通过 JWT 进行身份验证。
上传成功后，返回图片的公共访问 URL。
支持指定目标子文件夹。
"""
import os
import traceback
import requests
from flask import Blueprint, request, jsonify, current_app, Response, send_file, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app.utils.cos_storage import cos_storage # 导入 COS 工具
from app.utils.cache_manager import ImageCache # 导入Redis缓存管理
from io import BytesIO
import re
import time
import hashlib
from urllib.parse import urlparse, unquote
import pickle

# 修改：移除url_prefix，让Flask app注册时统一管理路由前缀
uploads_bp = Blueprint('uploads_bp', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'} # 允许的图片格式
MAX_IMAGES = 9  # 一次请求最多上传的图片数量
DEFAULT_SUBFOLDER = 'user_shared_images'  # 默认子文件夹

def allowed_file(filename):
    """检查文件名是否具有允许的扩展名。"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_extension_from_url(url):
    """从URL中提取文件扩展名"""
    parsed_url = urlparse(url)
    path = unquote(parsed_url.path)
    
    # 尝试从路径中提取扩展名
    if '.' in path:
        ext = path.rsplit('.', 1)[1].lower()
        # 只返回合法的扩展名
        if ext in ALLOWED_EXTENSIONS:
            return ext
    
    # 如果无法从URL路径提取扩展名，返回默认值
    return 'jpg'

@uploads_bp.route('/proxy/image', methods=['GET'])
def proxy_cos_image():
    """
    代理访问图片，解决跨域问题。
    
    通过url参数接收完整的图片URL，然后后端获取图片并返回给前端。
    使用Redis分布式缓存，高效处理并发请求，支持跨实例缓存共享。
    
    请求示例: /api/upload/proxy/image?url=https://example.com/image.jpg
    
    返回:
        - 成功: 图片二进制数据 (状态码: 200)
        - 失败: {"error": "错误信息"} (状态码: 400或500)
    """
    # 获取url参数
    image_url = request.args.get('url')
    if not image_url:
        current_app.logger.warning("图片代理请求缺少url参数")
        return jsonify({"error": "缺少url参数"}), 400
    
    # 解码URL（重要：前端传来的URL已经是百分比编码的）
    try:
        image_url = unquote(image_url)
    except Exception as e:
        current_app.logger.error(f"URL解码失败: {e}")
        # 如果解码失败，尝试使用原始URL
    
    # 获取是否禁用缓存的参数
    no_cache = request.args.get('no_cache', '0') == '1'
    
    # 获取图片类型参数（如果提供）
    image_type = request.args.get('type')
    
    # 调试日志
    current_app.logger.debug(f"处理图片代理请求: URL={image_url[:50] if len(image_url) > 50 else image_url}, type={image_type}, no_cache={no_cache}")
    
    # 如果未禁用缓存，尝试从Redis缓存获取
    if not no_cache:
        cached_data = ImageCache.get(image_url, image_type)
        if cached_data:
            # 反序列化缓存数据
            try:
                cached_dict = pickle.loads(cached_data)
                img_data = cached_dict['data']
                content_type = cached_dict['content_type']
                current_app.logger.debug(f"[CACHE_HIT] 从Redis获取图片缓存: {image_url[:50]}...")
                return send_file(
                    BytesIO(img_data),
                    mimetype=content_type,
                    max_age=3600 * 24  # 设置浏览器缓存为1天
                )
            except Exception as e:
                current_app.logger.error(f"解析缓存数据失败: {e}", exc_info=True)
                # 继续执行以从源获取图片
    
    # 缓存未命中或禁用缓存，从源URL获取图片
    try:
        # 设置超时防止请求挂起
        timeout = 10  # 10秒超时
        current_app.logger.debug(f"[CACHE_MISS] 从源获取图片: {image_url[:50]}...")
        
        # 设置请求头，模拟浏览器请求
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': request.host_url,  # 设置Referer为当前站点
        }
        
        response = requests.get(image_url, stream=True, timeout=timeout, headers=headers)
        if response.status_code != 200:
            current_app.logger.warning(f"从源获取图片失败，状态码: {response.status_code}")
            # 提供一个默认的错误图片而不是返回错误，以提高用户体验
            static_error_img = os.path.join(current_app.root_path, 'static', 'img', 'image_error.png')
            if os.path.exists(static_error_img):
                with open(static_error_img, 'rb') as f:
                    error_img_data = f.read()
                return send_file(
                    BytesIO(error_img_data),
                    mimetype='image/png',
                    max_age=3600 * 24  # 设置浏览器缓存为1天
                )
            else:
                return jsonify({"error": f"获取图片失败，状态码: {response.status_code}"}), response.status_code
        
        # 获取内容类型和图片数据
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        img_data = response.content
        
        # 不禁用缓存时，存储到Redis
        if not no_cache:
            # 如果未指定图片类型，尝试从URL检测
            if not image_type:
                # 导入检测函数，避免循环导入
                from app.utils.image_preloader import detect_image_type_from_url
                image_type = detect_image_type_from_url(image_url)
                
            cache_result = ImageCache.set(image_url, img_data, content_type, image_type)
            current_app.logger.debug(f"[CACHE_STORE] 图片已存储到Redis缓存: {image_url[:50]}..., 类型: {image_type}, 结果: {cache_result}")
        
        # 返回图片，并设置浏览器缓存
        return send_file(
            BytesIO(img_data), 
            mimetype=content_type,
            max_age=3600 * 24  # 设置浏览器缓存为1天
        )
        
    except requests.RequestException as e:
        # 处理请求异常 (超时、连接错误等)
        error_msg = f"请求图片源时出错: {str(e)}"
        current_app.logger.error(error_msg)
        # 检查错误类型是否为超时
        if isinstance(e, requests.Timeout):
            error_msg += " (请求超时)"
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        # 处理其他未预期的异常
        error_msg = f"代理图片时发生错误: {str(e)}"
        current_app.logger.error(error_msg, exc_info=True)
        return jsonify({"error": error_msg}), 500

# 添加缓存统计接口
@uploads_bp.route('/cache/stats', methods=['GET'])
def get_cache_stats():
    """获取缓存统计信息的API端点"""
    try:
        from app.utils.cache_manager import CacheStats
        stats = CacheStats.get_stats()
        return jsonify(stats), 200
    except Exception as e:
        return jsonify({"error": f"获取缓存统计信息失败: {str(e)}"}), 500

# 添加缓存清理接口
@uploads_bp.route('/cache/clear', methods=['POST'])
@jwt_required() # 需要JWT认证
def clear_cache():
    """清理缓存的API端点，需要管理员权限"""
    from app.models import User
    from app.utils import cache_manager
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # 检查用户是否为管理员
    if not user or not user.is_admin:
        return jsonify({"error": "需要管理员权限"}), 403
    
    try:
        # 从请求中获取缓存类型参数
        cache_type = request.json.get('cache_type', 'all')
        
        # 获取Redis客户端
        redis_client = cache_manager.cache._write_client
        cache_prefix = cache_manager.cache.config['CACHE_KEY_PREFIX']
        
        # 根据缓存类型清理不同的缓存
        if cache_type == 'image' or cache_type == 'all':
            image_pattern = f"{cache_prefix}{cache_manager.KEY_PREFIX['IMAGE']}*"
            image_keys = redis_client.keys(image_pattern)
            if image_keys:
                redis_client.delete(*image_keys)
                
        if cache_type == 'data' or cache_type == 'all':
            data_pattern = f"{cache_prefix}{cache_manager.KEY_PREFIX['DATA']}*"
            data_keys = redis_client.keys(data_pattern)
            if data_keys:
                redis_client.delete(*data_keys)
                
        if cache_type == 'count' or cache_type == 'all':
            count_pattern = f"{cache_prefix}{cache_manager.KEY_PREFIX['COUNT']}*"
            count_keys = redis_client.keys(count_pattern)
            if count_keys:
                redis_client.delete(*count_keys)
        
        return jsonify({
            "success": True,
            "message": f"已清理{cache_type}类型的缓存"
        }), 200
    except Exception as e:
        return jsonify({"error": f"清理缓存失败: {str(e)}"}), 500

# 添加内存监控和清理接口
@uploads_bp.route('/cache/monitor', methods=['POST'])
@jwt_required() # 需要JWT认证
def trigger_memory_monitor():
    """手动触发内存监控和清理的API端点，需要管理员权限"""
    from app.models import User
    from app.utils.cache_manager import monitor_memory_usage
    
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    # 检查用户是否为管理员
    if not user or not user.is_admin:
        return jsonify({"error": "需要管理员权限"}), 403
    
    try:
        # 执行内存监控
        result = monitor_memory_usage(current_app)
        
        if result:
            return jsonify({
                "success": True,
                "message": "内存监控和清理已执行",
                "time": time.strftime("%Y-%m-%d %H:%M:%S")
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "内存监控执行失败，请查看日志"
            }), 500
    except Exception as e:
        return jsonify({
            "error": f"内存监控执行出错: {str(e)}"
        }), 500

@uploads_bp.route('/image', methods=['POST'])
# 移除JWT认证要求，允许未登录用户上传图片
# @jwt_required()
def upload_image_to_cos():
    """
    处理 /api/upload/image 的 POST 请求。

    从请求的 form-data 中获取 'image' 文件，
    验证文件类型，然后使用 app.utils.cos_storage 中的
    upload_file 方法将其上传到配置好的腾讯云 COS存储桶。
    
    可选参数:
      - subfolder: 指定要上传到的子文件夹 (默认: 'user_shared_images')

    Returns:
        JSON response: 包含 'imageUrl' (上传成功) 或 'error' (上传失败)。
        Status Codes: 201 (成功), 400 (请求错误), 500 (服务器内部错误)。
    """
    current_app.logger.info(f"收到图片上传请求: {request.path}")
    # 由于移除了jwt_required，这里可能没有用户ID
    # current_user_id = get_jwt_identity()

    # 1. 检查请求中是否存在名为 'image' 的文件部分
    if 'image' not in request.files:
        current_app.logger.warning("请求中缺少 'image' 文件部分")
        return jsonify({"error": "请求中未找到名为 'image' 的文件部分"}), 400

    file = request.files['image']

    # 2. 检查是否选择了文件
    if file.filename == '':
        current_app.logger.warning("未选择任何文件")
        return jsonify({"error": "没有选择文件"}), 400

    # 3. 检查文件类型是否允许
    if not allowed_file(file.filename):
        current_app.logger.warning(f"不允许的文件类型: {file.filename}")
        return jsonify({"error": f"不允许的文件类型。允许的类型: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    # 4. 获取子文件夹参数（如果有）
    subfolder = request.form.get('subfolder', DEFAULT_SUBFOLDER)
    current_app.logger.info(f"使用子文件夹: {subfolder}")

    # 5. 尝试上传文件到 COS
    try:
        current_app.logger.info(f"尝试上传文件 '{file.filename}' 到 COS...")
        # 直接上传文件流到 COS，使用指定的子文件夹
        image_url = cos_storage.upload_file(file, subfolder=subfolder)
        
        if image_url:
            current_app.logger.info(f"图片成功上传到 COS，URL: {image_url}")
            return jsonify({"imageUrl": image_url}), 201 # 返回成功和图片 URL
        else:
            current_app.logger.error("cos_storage.upload_file 未返回有效的 URL")
            return jsonify({"error": "上传文件到云存储失败"}), 500

    except Exception as e:
        # 记录详细的异常信息
        current_app.logger.error(f"上传图片 '{file.filename}' 到 COS 时发生异常: {e}")
        # 打印堆栈跟踪到日志/控制台，方便调试
        traceback.print_exc()
        return jsonify({"error": "服务器内部错误，上传图片失败"}), 500 

@uploads_bp.route('/images', methods=['POST'])
# 移除JWT认证要求，允许未登录用户上传图片
# @jwt_required()
def upload_multiple_images():
    """
    处理 /api/upload/images 的 POST 请求。
    
    允许一次上传多个图片文件，返回所有成功上传图片的URL列表。
    
    请求格式:
        - multipart/form-data 包含多个 'images' 字段，每个包含一个图片文件
        - 可选参数 'subfolder' 指定上传目标子文件夹
        
    返回:
        - 成功: {"imageUrls": ["url1", "url2", ...]} (状态码: 201)
        - 部分成功: {"imageUrls": ["url1"], "errors": ["file2 error msg"]} (状态码: 207)
        - 失败: {"error": "错误信息"} (状态码: 400或500)
    """
    current_app.logger.info("收到多图片上传请求")

    # 1. 确保请求中包含图片
    if 'images' not in request.files:
        current_app.logger.warning("请求中缺少 'images' 字段")
        return jsonify({"error": "请求中未找到图片文件"}), 400
        
    files = request.files.getlist('images')
    
    # 2. 检查是否有选择的文件
    if len(files) == 0:
        current_app.logger.warning("没有选择任何文件")
        return jsonify({"error": "没有选择文件"}), 400
        
    # 3. 强制限制上传图片数量
    if len(files) > MAX_IMAGES:
        current_app.logger.warning(f"尝试上传的图片数量 {len(files)} 超过上限 {MAX_IMAGES}")
        return jsonify({"error": f"每次请求最多只能上传 {MAX_IMAGES} 张图片"}), 400

    # 4. 获取子文件夹参数（如果有）
    subfolder = request.form.get('subfolder', DEFAULT_SUBFOLDER)
    current_app.logger.info(f"使用子文件夹: {subfolder}")
    
    # 5. 处理每个文件
    image_urls = []  # 成功上传的图片URL
    errors = []      # 失败的文件及错误信息
    
    for file in files:
        # 跳过空文件名
        if file.filename == '':
            errors.append(f"跳过未命名的文件")
            continue
            
        # 检查文件类型
        if not allowed_file(file.filename):
            errors.append(f"文件 '{file.filename}' 不是允许的类型，允许类型: {', '.join(ALLOWED_EXTENSIONS)}")
            continue
            
        try:
            # 上传到COS
            image_url = cos_storage.upload_file(file, subfolder=subfolder)
            if image_url:
                image_urls.append(image_url)
                current_app.logger.info(f"图片 '{file.filename}' 成功上传到 COS: {image_url}")
            else:
                errors.append(f"文件 '{file.filename}' 上传失败：未返回URL")
                current_app.logger.error(f"文件 '{file.filename}' 上传失败：cos_storage.upload_file未返回URL")
                
        except Exception as e:
            error_msg = f"文件 '{file.filename}' 上传失败: {str(e)}"
            errors.append(error_msg)
            current_app.logger.error(error_msg)
            traceback.print_exc()
    
    # 根据上传结果返回不同的响应
    if not image_urls and errors:
        # 所有文件都失败
        return jsonify({
            "error": "所有文件上传失败",
            "errors": errors
        }), 500
    elif image_urls and errors:
        # 部分成功，部分失败 - 返回207状态码(Multi-Status)
        return jsonify({
            "imageUrls": image_urls,
            "errors": errors,
            "message": "部分文件上传成功，部分失败"
        }), 207
    else:
        # 全部成功
        current_app.logger.info(f"所有{len(image_urls)}张图片上传成功")
        return jsonify({
            "imageUrls": image_urls,
            "message": "所有文件上传成功"
        }), 201 