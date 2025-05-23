"""
图片预加载工具

用于主动缓存热门图片，提升首屏加载速度和整体用户体验。
提供以下功能：
- 预加载热门文章和动态中的图片
- 定期更新缓存内容
- 支持手动触发预加载
- 避免重复缓存相同图片
- 图片加载错误自动重试
- 支持优先级队列缓存重要图片
- 按内容类型分类缓存图片
"""

import requests
import logging
import time
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import current_app
from bs4 import BeautifulSoup
from sqlalchemy import desc, func
from app.utils.model_loader import get_model
from app.utils.cache_manager import ImageCache
import random
import json
from urllib.parse import urlparse, urljoin

# 预加载配置
CONFIG = {
    'MAX_CONCURRENT_LOADS': 10,      # 最大并发加载数（增加）
    'MAX_IMAGES_PER_SOURCE': 100,    # 每个来源最多加载的图片数（增加）
    'MAX_ARTICLES': 30,             # 预加载的文章数量
    'MAX_DYNAMICS': 50,             # 预加载的动态数量
    'MAX_POSTS': 30,                # 预加载的帖子数量
    'MAX_PROFILES': 20,             # 预加载的用户头像数量
    'REQUEST_TIMEOUT': 15,           # 请求超时时间(秒)
    'IMAGE_EXTENSIONS': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'],  # 支持的图片扩展名
    'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'RETRY_COUNT': 3,                # 加载失败时的重试次数
    'RETRY_DELAY': 2,                # 重试间隔(秒)
    'PRELOAD_INTERVAL': 10 * 60,     # 预加载间隔(秒)，默认10分钟
    'LOG_LEVEL': logging.INFO,       # 日志级别
}

# 正则表达式：匹配URL中的图片链接
IMAGE_URL_PATTERN = re.compile(r'https?://[^\s<>"\']+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s<>"\']*)?', re.IGNORECASE)

# 临时记录已经预加载的图片，避免短时间内重复加载
_recently_preloaded = set()
_preload_lock = threading.Lock()
_is_preloading = False
_preload_stats = {
    'total_attempted': 0,
    'total_success': 0,
    'total_failed': 0,
    'last_run': None,
    'last_duration': 0,
    'sources': {
        'article': {'attempted': 0, 'success': 0},
        'dynamic': {'attempted': 0, 'success': 0},
        'post': {'attempted': 0, 'success': 0},
        'profile': {'attempted': 0, 'success': 0},
        'cover': {'attempted': 0, 'success': 0},
    }
}

def setup_logger():
    """设置预加载器日志"""
    logger = logging.getLogger('image_preloader')
    logger.setLevel(CONFIG['LOG_LEVEL'])
    
    # 检查是否已经添加了处理器，避免重复
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger

# 创建日志器
logger = setup_logger()

def extract_image_urls_from_html(html_content):
    """从HTML内容中提取图片URL"""
    if not html_content:
        return []
    
    # 使用BeautifulSoup解析HTML
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 找出所有img标签
    image_tags = soup.find_all('img')
    
    # 提取图片URL
    image_urls = []
    for img in image_tags:
        src = img.get('src')
        if src and not src.startswith('data:'):
            image_urls.append(src)
    
    # 查找内联样式中的背景图片URL
    style_tags = soup.find_all(['div', 'span', 'section'], style=True)
    for tag in style_tags:
        style = tag.get('style', '')
        if 'background-image' in style:
            url_match = re.search(r'url\([\'"]?(.*?)[\'"]?\)', style)
            if url_match:
                url = url_match.group(1)
                if url and not url.startswith('data:'):
                    image_urls.append(url)
    
    # 使用正则表达式查找内容中的其他图片URL
    text_content = soup.get_text()
    image_urls.extend(IMAGE_URL_PATTERN.findall(text_content))
    
    # 去重
    return list(set(image_urls))

def extract_image_urls_from_text(text_content):
    """从文本内容中提取图片URL"""
    if not text_content:
        return []
    
    # 使用正则表达式查找文本中的图片URL
    image_urls = IMAGE_URL_PATTERN.findall(text_content)
    
    # 去重
    return list(set(image_urls))

def detect_image_type_from_url(url):
    """从URL尝试检测图片类型"""
    url_lower = url.lower()
    
    # 检测URL中的特征
    if any(x in url_lower for x in ['/article', 'article_', 'article-']):
        return 'article'
    elif any(x in url_lower for x in ['/post', 'post_', 'post-']):
        return 'post'
    elif any(x in url_lower for x in ['/dynamic', '/moment']):
        return 'dynamic'
    elif any(x in url_lower for x in ['/avatar', '/profile', '/user-pic']):
        return 'profile'
    elif any(x in url_lower for x in ['/cover', '/banner', '/header']):
        return 'cover'
    
    # 无法确定类型时，根据URL来源域名判断
    parsed_url = urlparse(url)
    if 'cdn' in parsed_url.netloc or 'image' in parsed_url.netloc:
        return 'general'
        
    # 默认为通用类型
    return 'general'

def preload_image(url, image_type=None, retry_count=None):
    """预加载单个图片到缓存"""
    try:
        from app import create_app
        app_for_thread = create_app()
    except ImportError:
        logger.error("[preload_image] 无法导入 create_app 或创建 app 实例。单次图片预加载可能失败。")
        return False

    with app_for_thread.app_context():
        if not url:
            return False

        # Ensure URL is absolute
        if '://' not in url and url.startswith('/'):
            try:
                # Try to get base URL from app config
                scheme = current_app.config.get('PREFERRED_URL_SCHEME', 'http')
                server_name = current_app.config.get('SERVER_NAME')
                if server_name:
                    base_url = f"{scheme}://{server_name}"
                else:
                    # Fallback for local development if SERVER_NAME is not set
                    # Assuming default Flask port 5000. Adjust if your port is different.
                    base_url = f"http://127.0.0.1:{current_app.config.get('FLASK_RUN_PORT', 5000)}"
                
                original_url = url
                url = urljoin(base_url, url)
                logger.debug(f"相对 URL '{original_url}' 已转换为绝对 URL '{url}'")
            except Exception as e:
                logger.error(f"转换相对 URL 失败: {original_url}, 错误: {e}", exc_info=True)
                return False

        if retry_count is None:
            retry_count = CONFIG['RETRY_COUNT']
        
        if image_type is None:
            image_type = detect_image_type_from_url(url)
        
        url_key = f"{image_type}:{url}"
        if url_key in _recently_preloaded:
            logger.debug(f"图片已在近期预加载 (上下文内): {url[:50]}... (类型: {image_type})")
            return True
        
        if ImageCache.get(url, image_type): # 这个调用现在在上下文中
            logger.debug(f"图片已在缓存中 (上下文内): {url[:50]}... (类型: {image_type})")
            return True
        
        _preload_stats['total_attempted'] += 1
        if image_type in _preload_stats['sources']:
            _preload_stats['sources'][image_type]['attempted'] += 1
        
        time.sleep(random.uniform(0.1, 0.5))
        
        for attempt in range(retry_count + 1):
            try:
                headers = {
                    'User-Agent': CONFIG['USER_AGENT'],
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                }
                
                if attempt > 0:
                    logger.info(f"重试 ({attempt}/{retry_count}) 加载图片 (上下文内): {url[:50]}...")
                    time.sleep(CONFIG['RETRY_DELAY'] * attempt)
                
                response = requests.get(
                    url, 
                    stream=True, 
                    timeout=CONFIG['REQUEST_TIMEOUT'], 
                    headers=headers
                )
                
                if response.status_code == 200:
                    content_type = response.headers.get('Content-Type', 'image/jpeg')
                    img_data = response.content
                    
                    cache_result = ImageCache.set(url, img_data, content_type, image_type)
                    
                    if cache_result:
                        _recently_preloaded.add(url_key)
                        if len(_recently_preloaded) > 2000: 
                            _recently_preloaded.clear()
                        
                        _preload_stats['total_success'] += 1
                        if image_type in _preload_stats['sources']:
                            _preload_stats['sources'][image_type]['success'] += 1
                        
                        logger.debug(f"成功预加载图片 (上下文内): {url[:70]}... ({len(img_data)/1024:.1f}KB, 类型: {image_type})")
                        return True
                    else:
                        logger.warning(f"图片缓存失败 (上下文内): {url[:70]}... (类型: {image_type})")
                else:
                    logger.warning(f"图片请求失败，状态码: {response.status_code}, URL (上下文内): {url[:50]}... (类型: {image_type})")
            
            except requests.Timeout:
                logger.warning(f"图片请求超时 (上下文内): {url[:50]}... (类型: {image_type})")
            except Exception as e:
                logger.error(f"预加载图片异常 (上下文内): {url[:50]}..., 错误: {str(e)}", exc_info=True) # 添加 exc_info=True
        
        _preload_stats['total_failed'] += 1
        return False

def preload_images(image_urls, source_type=None):
    """预加载一组图片到缓存"""
    if not image_urls:
        return 0
    
    logger.info(f"开始预加载{len(image_urls)}张图片，来源: {source_type or '未知'}")
    
    # 限制图片数量
    image_urls = image_urls[:CONFIG['MAX_IMAGES_PER_SOURCE']]
    
    # 成功加载的图片数量
    success_count = 0
    
    # 并发加载图片
    with ThreadPoolExecutor(max_workers=CONFIG['MAX_CONCURRENT_LOADS']) as executor:
        # 使用字典跟踪每个future对应的URL和类型
        future_to_url = {}
        for url in image_urls:
            img_type = detect_image_type_from_url(url) if source_type == 'general' else source_type
            future_to_url[executor.submit(preload_image, url, img_type)] = (url, img_type)
        
        # 处理完成的任务
        for future in as_completed(future_to_url):
            url, img_type = future_to_url[future]
            try:
                success = future.result()
                if success:
                    success_count += 1
            except Exception as e:
                logger.error(f"处理预加载任务结果异常: {url[:70]}..., 错误: {str(e)}")
    
    logger.info(f"预加载完成，成功: {success_count}/{len(image_urls)}张图片，来源: {source_type or '未知'}")
    return success_count

def preload_article_images(article_limit=None):
    """预加载热门文章的图片"""
    if article_limit is None:
        article_limit = CONFIG['MAX_ARTICLES']
        
    try:
        # 使用model_loader加载模型
        Article = get_model('Article')
        
        # 获取最热门文章（按浏览量排序）
        articles = Article.query.order_by(desc(Article.view_count)).limit(article_limit).all()
        
        logger.info(f"开始预加载{len(articles)}篇热门文章的图片")
        
        all_image_urls = []
        
        # 收集所有封面图
        cover_images = []
        
        for article in articles:
            # 从文章内容提取图片URL
            image_urls = []
            
            # 从封面图获取URL（单独处理为封面类型）
            if article.cover_image:
                cover_images.append(article.cover_image)
            
            # 从文章内容提取图片URL
            if article.content:
                content_urls = extract_image_urls_from_html(article.content)
                image_urls.extend(content_urls)
            
            logger.debug(f"文章[{article.id}]: {article.title} - 找到{len(image_urls)}张内容图片")
            all_image_urls.extend(image_urls)
        
        # 先预加载封面图（优先级更高）
        cover_count = preload_images(cover_images, 'cover')
        
        # 再预加载文章内容图片
        article_count = preload_images(all_image_urls, 'article')
        
        # 返回总预加载数
        return cover_count + article_count
    except Exception as e:
        logger.error(f"预加载文章图片失败: {str(e)}")
        return 0

def preload_dynamic_images(dynamic_limit=None):
    """预加载动态的图片"""
    if dynamic_limit is None:
        dynamic_limit = CONFIG['MAX_DYNAMICS']
        
    try:
        # 使用model_loader加载模型
        Dynamic = get_model('Dynamic')
        
        # 获取最新动态
        dynamics = Dynamic.query.order_by(desc(Dynamic.created_at)).limit(dynamic_limit).all()
        
        logger.info(f"开始预加载{len(dynamics)}条最新动态的图片")
        
        all_image_urls = []
        
        for dynamic in dynamics:
            # 从动态内容提取图片URL
            image_urls = []
            
            # 提取引用/分享图片
            if dynamic.quoted_type in ['post', 'article'] and dynamic.quoted_id:
                if dynamic.quoted_image_url:
                    image_urls.append(dynamic.quoted_image_url)
            
            # 提取附加图片
            if dynamic.images:
                # 处理字符串或列表格式
                if isinstance(dynamic.images, str):
                    try:
                        img_list = json.loads(dynamic.images)
                        if isinstance(img_list, list):
                            image_urls.extend(img_list)
                    except:
                        # 可能是单个URL
                        image_urls.append(dynamic.images)
                elif isinstance(dynamic.images, list):
                    image_urls.extend(dynamic.images)
            
            # 提取动态内容中的图片URL
            if dynamic.content:
                content_urls = extract_image_urls_from_text(dynamic.content)
                image_urls.extend(content_urls)
            
            logger.debug(f"动态[{dynamic.id}] - 找到{len(image_urls)}张图片")
            all_image_urls.extend(image_urls)
        
        # 预加载所有动态图片
        return preload_images(all_image_urls, 'dynamic')
    except Exception as e:
        logger.error(f"预加载动态图片失败: {str(e)}")
        return 0

def preload_post_images(post_limit=None):
    """预加载热门帖子的图片"""
    if post_limit is None:
        post_limit = CONFIG['MAX_POSTS']
        
    try:
        # 使用model_loader加载模型
        Post = get_model('Post')
        
        # 获取热门帖子
        posts = Post.query.order_by(desc(Post.view_count)).limit(post_limit).all()
        
        logger.info(f"开始预加载{len(posts)}个热门帖子的图片")
        
        all_image_urls = []
        cover_images = []
        
        for post in posts:
            # 从帖子内容提取图片URL
            image_urls = []
            
            # 从帖子封面获取URL
            if hasattr(post, 'cover_image') and post.cover_image:
                cover_images.append(post.cover_image)
            
            # 从帖子内容提取图片URL
            if post.content:
                content_urls = extract_image_urls_from_html(post.content)
                image_urls.extend(content_urls)
            
            logger.debug(f"帖子[{post.id}]: {post.title} - 找到{len(image_urls)}张图片")
            all_image_urls.extend(image_urls)
        
        # 先预加载封面图
        cover_count = preload_images(cover_images, 'cover')
        
        # 再预加载帖子内容图片
        post_count = preload_images(all_image_urls, 'post')
        
        return cover_count + post_count
    except Exception as e:
        logger.error(f"预加载帖子图片失败: {str(e)}")
        return 0

def preload_profile_images(user_limit=None):
    """预加载活跃用户的头像"""
    if user_limit is None:
        user_limit = CONFIG['MAX_PROFILES']
        
    try:
        # 使用model_loader加载模型
        User = get_model('User')
        
        # 获取最活跃的用户
        users = User.query.order_by(desc(User.last_login)).limit(user_limit).all()
        
        logger.info(f"开始预加载{len(users)}个活跃用户的头像")
        
        profile_images = []
        
        for user in users:
            if hasattr(user, 'avatar') and user.avatar:
                # 如果头像是本地 /assets/ 路径，则不预加载，因为它可能是占位符或由前端处理
                if user.avatar.startswith('/assets/'):
                    logger.debug(f"跳过预加载本地占位符头像: {user.avatar} (用户ID: {user.id})")
                    continue 
                profile_images.append(user.avatar)
        
        # 预加载所有用户头像
        return preload_images(profile_images, 'profile')
    except Exception as e:
        logger.error(f"预加载用户头像失败: {str(e)}")
        return 0

def force_flush_cache():
    """强制清空_recently_preloaded缓存"""
    global _recently_preloaded
    count = len(_recently_preloaded)
    _recently_preloaded.clear()
    logger.info(f"已清空最近预加载记录缓存，释放了{count}条记录")
    return count

def preload_all_hot_images(force=False):
    """预加载所有热门内容的图片"""
    global _is_preloading
    
    # 防止重复预加载
    with _preload_lock:
        if _is_preloading and not force:
            logger.info("已有预加载任务正在运行，跳过本次预加载")
            return
        _is_preloading = True
    
    try:
        logger.info("开始全站热门内容图片预加载...")
        start_time = time.time()
        
        # 首先预加载活跃用户头像
        profile_count = preload_profile_images()
        
        # 预加载热门文章图片
        article_count = preload_article_images()
        
        # 预加载最新动态图片
        dynamic_count = preload_dynamic_images()
        
        # 预加载热门帖子图片
        post_count = preload_post_images()
        
        # 更新统计信息
        _preload_stats['last_run'] = time.time()
        elapsed = time.time() - start_time
        _preload_stats['last_duration'] = elapsed
        
        # 计算总耗时
        logger.info(f"预加载完成！共加载 {profile_count + article_count + dynamic_count + post_count} 张图片，耗时: {elapsed:.2f}秒")
        
        # 如果完成预加载后，_recently_preloaded 大小超过一定阈值，清空以释放内存
        if len(_recently_preloaded) > 1000:
            force_flush_cache()
        
    except Exception as e:
        logger.error(f"预加载热门图片失败: {str(e)}")
    finally:
        with _preload_lock:
            _is_preloading = False

def get_preload_stats():
    """获取预加载统计信息"""
    return {
        **_preload_stats,
        'cache_stats': ImageCache.get_stats(),
        'is_preloading': _is_preloading,
        'recently_preloaded_count': len(_recently_preloaded),
    }

_preload_thread = None

def start_preload_thread():
    """启动预加载线程"""
    def preload_worker():
        logger.info("图片预加载服务已启动 (内嵌 worker)")
        
        # 启动后先等待一段时间，避免系统启动时负载过高
        time.sleep(10) 
        
        # 在 preload_worker 内部导入并创建 app 实例
        try:
            from app import create_app # 假设 create_app 在 app 包的 __init__.py 中
            app = create_app() # 调用工厂函数创建 app 实例
        except ImportError:
            logger.critical("[image_preloader] 无法从 app 包导入 create_app 或创建 app 实例。预加载功能将无法正常工作。", exc_info=True)
            return # 无法获取 app，退出线程

        while True:
            try:
                # 使用应用上下文执行预加载
                with app.app_context():
                    logger.debug("[image_preloader] Entering app_context for preloading.")
                    preload_all_hot_images() # 这个函数内部会进行数据库查询等操作
                    logger.debug("[image_preloader] Exiting app_context after preloading.")

            except Exception as e:
                logger.error(f"[image_preloader] 预加载线程主循环异常: {str(e)}", exc_info=True)
            
            # 等待下一次预加载
            interval = CONFIG.get('PRELOAD_INTERVAL', 600) # 使用 .get() 并提供默认值
            logger.info(f"[image_preloader] 等待 {interval/60:.1f} 分钟后进行下一次预加载...")
            time.sleep(interval)
    
    # 创建并启动预加载线程
    preload_thread = threading.Thread(target=preload_worker, daemon=True, name="ImagePreloader")
    preload_thread.start()
    logger.info(f"图片预加载线程已启动: {preload_thread.name} (using nested worker definition)")
    return preload_thread 