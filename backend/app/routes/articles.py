"""
此模块定义了与文章 (Article) 相关的 API 端点。

主要功能:
- 文章的 CRUD 操作 (创建、读取、更新、删除)。
- 按 ID 或 slug 获取文章详情。
- 获取文章列表，支持按分类、标签筛选，分页和排序。
- 获取文章的唯一标签和分类列表。
- 搜索文章 (语义搜索)。
- 处理文章的评论 (Comment 模型) 和回答 (Answer 模型) 的获取、创建、删除。
- 处理文章相关图片上传 (封面图、编辑器内图片)。
- 获取用户创建的文章系列名称。
- 包含 slugify、图片保存等辅助函数。

依赖模型: Article, ArticleComment, UserAction, Answer, User, Topic, ActionComment
外部服务: VectorStore, COS Storage
使用 Flask 蓝图: articles_bp

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import Blueprint, jsonify, request, render_template, abort, current_app, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from app import db, limiter  # 添加limiter导入
from app.models import Article, Comment, UserAction, Answer, User, Topic, ActionComment
from app.services.vector_store import VectorStore
from sqlalchemy import desc, func, cast, JSON, distinct, or_, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import joinedload, selectinload, relationship
import re
import unicodedata
import time # Import time for unique slugs
import os # Import os for path operations
from werkzeug.utils import secure_filename # For secure filenames
import uuid
from collections import defaultdict
from datetime import datetime
from app.utils.cos_storage import cos_storage  # 导入COS存储工具类
from flask_cors import cross_origin
import json
# 导入article_utils模块
from app.utils.article_utils import update_article_view_count, get_article_by_slug, get_article_by_id

articles_bp = Blueprint('articles', __name__, template_folder='../../templates')

# --- Helper function for slugify ---
def slugify(value, allow_unicode=True):
    """
    Convert to ASCII if 'allow_unicode' is False. Convert spaces or repeated
    dashes to single dashes. Remove characters that aren't alphanumerics,
    underscores, or hyphens. Convert to lowercase. Also strip leading and
    trailing whitespace, dashes, and underscores.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize('NFKC', value)
    else:
        value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    value = re.sub(r'[^\w\s-]', '', value.lower())
    # Add timestamp for uniqueness before replacing spaces
    timestamp = str(int(time.time() * 1000))[-6:] # last 6 digits of ms timestamp
    slug = re.sub(r'[-\s]+', '-', value).strip('-_')
    # Ensure slug is not empty after replacements
    if not slug:
        slug = f"article-{timestamp}"
    else:
        # Append timestamp for uniqueness, limit total length if needed
        slug = f"{slug[:50]}-{timestamp}" # Limit base slug length
    return slug
# --- End Helper ---

# --- Helper ---
def is_admin(identity):
    """
    判断用户是否为管理员，这里简化为用户ID为1的是管理员
    兼容 identity 既可能是 int，也可能是 dict
    """
    if not identity:
        return False
    if isinstance(identity, dict):
        return identity.get('id') == 1
    if isinstance(identity, int):
        return identity == 1
    return False

def get_user_from_jwt():
    """获取JWT中的用户信息"""
    identity = get_jwt_identity()
    if not identity:
        return None
    return identity
# --- End Helper ---

# --- 添加图片保存辅助函数 ---
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_image(file, subfolder='covers'):
    """保存上传的图片文件并返回其相对路径或URL"""
    if not file:
        current_app.logger.error("save_image called with no file object")
        return None
    if not file.filename:
        current_app.logger.warning("save_image called with empty filename")
        return None
        
    if allowed_file(file.filename):
        # 使用腾讯云COS存储图片
        cos_url = cos_storage.upload_file(file, subfolder)
        if cos_url:
            current_app.logger.info(f"[save_image] 图片已上传到腾讯云COS: {cos_url}")
            # 直接返回完整的COS URL，无需任何修改
            return cos_url
            
        # 如果上传到COS失败，回退到本地存储
        current_app.logger.warning("[save_image] 上传到腾讯云COS失败，回退到本地存储")
        filename = secure_filename(file.filename)
        unique_filename = f"{int(time.time() * 1000)}_{filename}"
        
        # 使用 current_app 获取配置
        upload_folder_base = current_app.config.get('UPLOAD_FOLDER')
        if not upload_folder_base:
            current_app.logger.error("UPLOAD_FOLDER not configured in Flask app!")
            return None
        # 使用日志确认获取到的路径
        current_app.logger.info(f"[save_image] Using UPLOAD_FOLDER from current_app: {upload_folder_base}")
        current_app.logger.info(f"[save_image] Received subfolder: {subfolder}")
        
        upload_folder = os.path.join(upload_folder_base, subfolder)
        current_app.logger.info(f"[save_image] Target upload folder: {upload_folder}")
        
        try:
            os.makedirs(upload_folder, exist_ok=True)
        except OSError as e:
            current_app.logger.error(f"Error creating directory {upload_folder}: {e}")
            return None
            
        file_path = os.path.join(upload_folder, unique_filename)
        current_app.logger.info(f"[save_image] Attempting to save file to: {file_path}")
        
        try:
            file.save(file_path)
            relative_path = os.path.join(subfolder, unique_filename)
            posix_relative_path = relative_path.replace(os.path.sep, '/')
            current_app.logger.info(f"[save_image] File saved successfully. Returning relative path: {posix_relative_path}")
            # 修复：返回完整的静态文件URL路径
            return f"/static/uploads/{posix_relative_path}"
        except Exception as e:
            current_app.logger.error(f"Error saving file {unique_filename} to {file_path}: {e}")
            return None
    else:
        current_app.logger.warning(f"[save_image] File type not allowed: {file.filename}")
        return None
# --- 结束图片保存辅助函数 ---

# --- 添加: 获取文章标签接口 ---
@articles_bp.route('/tags', methods=['GET'])
def get_article_tags():
    """
    获取所有文章中出现过的唯一标签列表 (最多返回前 30 个)
    
    该函数处理数据库中各种格式的标签：
    1. 普通JSON数组: ["标签1", "标签2"]
    2. 嵌套JSON字符串: ["[\"标签1\", \"标签2\"]"]
    3. 带逗号的单一字符串: ["标签1, 标签2"]
    4. 带引号和转义的复杂格式
    
    这些不同格式的标签会被正确解析，统一格式，并去重。
    """
    try:
        # 直接使用SQL从数据库获取所有非空标签
        raw_tags_data = db.session.execute(
            "SELECT id, tags FROM articles WHERE tags IS NOT NULL AND tags != 'null' AND tags != '[]'"
        ).fetchall()
        
        # 用于统计标签出现次数的字典
        tag_counts = {}
        
        current_app.logger.info(f"处理 {len(raw_tags_data)} 篇文章的标签...")
        
        # 处理每篇文章的标签
        for row in raw_tags_data:
            article_id, tags_data = row
            
            # 跳过None和空值
            if not tags_data:
                continue
                
            current_app.logger.debug(f"处理文章ID={article_id}的标签: {tags_data}, 类型: {type(tags_data)}")
            
            # 提取标签的函数
            def extract_tags_from_data(data):
                extracted_tags = []
                
                # 如果是字符串，尝试解析JSON
                if isinstance(data, str):
                    # 尝试将字符串解析为JSON
                    try:
                        parsed_data = json.loads(data)
                        return extract_tags_from_data(parsed_data)
                    except:
                        # 不是JSON，视为单个标签
                        return [data.strip()]
                
                # 如果是列表，处理每个元素
                elif isinstance(data, list):
                    for item in data:
                        # 如果列表中的元素是字符串但看起来包含JSON
                        if isinstance(item, str) and (item.startswith('[') or item.startswith('"[')):
                            # 去除多余的引号和转义
                            cleaned_item = item
                            
                            # 处理嵌套的JSON字符串，如 ["[\"标签\"]"]
                            if item.startswith('"[') and item.endswith(']"'):
                                try:
                                    # 将双重编码的JSON字符串还原
                                    decoded = json.loads(f"{{\"tag\":{item}}}")["tag"]
                                    clean_tags = extract_tags_from_data(decoded)
                                    extracted_tags.extend(clean_tags)
                                    continue
                                except:
                                    pass
                            
                            # 检查是否包含逗号，可能是"标签1, 标签2"格式
                            if ',' in item or '，' in item:
                                # 分割并添加每个部分作为独立标签
                                for tag in re.split(r'[,，]', item):
                                    tag = tag.strip()
                                    # 移除可能的引号和方括号
                                    tag = re.sub(r'^[\[\"\']|[\]\"\']$', '', tag)
                                    tag = tag.strip()
                                    if tag:
                                        extracted_tags.append(tag)
                                continue
                            
                            # 处理普通字符串标签
                            item = re.sub(r'^[\[\"\']|[\]\"\']$', '', item)
                            if item.strip():
                                extracted_tags.append(item.strip())
                        
                        # 递归处理嵌套的列表
                        elif isinstance(item, list):
                            extracted_tags.extend(extract_tags_from_data(item))
                        
                        # 处理基本字符串
                        elif isinstance(item, str):
                            if item.strip():
                                extracted_tags.append(item.strip())
                
                return extracted_tags
            
            # 提取文章的所有标签
            tags_list = extract_tags_from_data(tags_data)
            
            # 统计标签出现次数
            for tag in tags_list:
                if tag:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        # 按出现次数排序并限制数量
        sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:30]
        unique_tags = [tag for tag, count in sorted_tags]
        
        current_app.logger.info(f"成功提取 {len(unique_tags)} 个标签")
        return jsonify({"tags": sorted(unique_tags)})
    except Exception as e:
        current_app.logger.error(f"获取文章标签时出错: {e}", exc_info=True)
        return jsonify({"error": f"获取标签失败: {str(e)}"}), 500
# --- 结束添加 ---

@articles_bp.route('/', methods=['GET'])
def get_articles_api():
    """获取所有文章或按类别/标签筛选文章，并包含系列信息，支持指定返回字段"""

    # --- GET 请求处理逻辑 ---
    print(f"\n*** DEBUG [articles.py]: Entered get_articles_api (GET). Request Path={request.path} ***\n", flush=True)
    category = request.args.get('category')
    tag = request.args.get('tag') 
    limit = request.args.get('limit', 10, type=int)
    offset = request.args.get('offset', 0, type=int)
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    fields_str = request.args.get('fields') 
    requested_fields = set(fields_str.split(',')) if fields_str else None

    # --- 再次修改: 使用正确的 relationship 名称 'author_user' --- 
    query = Article.query.options(joinedload(Article.author_user))
    # --- 结束修改 ---
    
    # 原有的过滤条件保持不变
    query = query.filter(Article.is_published == True, Article.is_deleted == False)
    
    if category:
        query = query.filter_by(category=category)
    
    if tag:
        query = query.filter(Article.tags.contains(cast(tag, JSONB)))
        
    if sort_by in ['title', 'created_at', 'updated_at', 'view_count']:
        order_column = getattr(Article, sort_by)
        query = query.order_by(desc(order_column) if sort_order == 'desc' else order_column)
    else:
        query = query.order_by(desc(Article.created_at))
    
    total = query.count()
    articles_from_db = query.offset(offset).limit(limit).all()
    
    processed_articles = []
    for article in articles_from_db:
        if requested_fields:
            # If specific fields are requested, construct dict carefully
            # Rely on article.to_dict() for author info if requested
            base_article_dict_for_fields = article.to_dict(include_content=('content' in requested_fields))
            article_dict = {}

            for field in requested_fields:
                if field == 'author':
                    article_dict['author'] = base_article_dict_for_fields.get('author')
                elif field in base_article_dict_for_fields:
                    article_dict[field] = base_article_dict_for_fields[field]
                elif hasattr(article, field): # Fallback for fields not in to_dict but on model
                    if field in ['created_at', 'updated_at'] and getattr(article, field):
                        article_dict[field] = getattr(article, field).isoformat() + 'Z'
                    else:
                        article_dict[field] = getattr(article, field)
            
            # Ensure essential fields are present if not explicitly requested but implied
            if 'id' not in article_dict and ('id' in requested_fields or not requested_fields): # id is always good to have
                 article_dict['id'] = article.id
            if 'title' not in article_dict and ('title' in requested_fields or not requested_fields):
                 article_dict['title'] = article.title
            if 'slug' not in article_dict and ('slug' in requested_fields or not requested_fields):
                 article_dict['slug'] = article.slug

        else:
            # Default behavior: return standard dict from article.to_dict()
            # This should already include the author with avatar if author_user is loaded.
            article_dict = article.to_dict(include_content=False)

        # --- 系列信息处理 (恢复代码) ---
        # Only fetch/add series info if 'series_articles' is requested or no fields specified
        # --- 恢复 ---
        if not requested_fields or 'series_articles' in requested_fields:
            series_list_for_frontend = []
            if article.series_name and article.user_id:
                 series_query = Article.query.filter(
                    Article.user_id == article.user_id,
                    Article.series_name == article.series_name,
                    Article.is_published == True
                ).order_by(Article.series_order, Article.created_at).all()

                 for series_item in series_query:
                     series_list_for_frontend.append({
                        'id': series_item.id,
                        'title': series_item.title,
                        'slug': series_item.slug,
                        'series_order': series_item.series_order or 0,
                        'is_current': series_item.id == article.id
                     })
            article_dict['series_articles'] = series_list_for_frontend
        # --- 结束恢复 ---
        # --- 结束系列信息处理 ---

        # --- 计算点赞等统计信息 (恢复代码) ---
        # Only calculate counts if requested or no fields specified
        # --- 恢复 ---
        if not requested_fields or any(f in requested_fields for f in ['like_count', 'collect_count', 'share_count', 'comment_count']):
            like_count = UserAction.query.filter_by(
                action_type='like',
                target_type='article',
                target_id=article.id
            ).count()
            collect_count = UserAction.query.filter_by(
                action_type='collect',
                target_type='article',
                target_id=article.id
            ).count()
            share_count = UserAction.query.filter_by(
                action_type='share',
                target_type='article',
                target_id=article.id
            ).count()
            comment_count = Comment.query.filter_by(article_id=article.id).count()

            # Add counts to dict if requested or by default
            if not requested_fields or 'like_count' in requested_fields:
                article_dict['like_count'] = like_count
            if not requested_fields or 'collect_count' in requested_fields:
                article_dict['collect_count'] = collect_count
            if not requested_fields or 'share_count' in requested_fields:
                 article_dict['share_count'] = share_count
            if not requested_fields or 'comment_count' in requested_fields:
                article_dict['comment_count'] = comment_count
        # --- 结束恢复 ---
        # --- 结束统计信息计算 ---

        processed_articles.append(article_dict)
        
    return jsonify({"articles": processed_articles, "total": total})

@articles_bp.route('/<int:id>', methods=['GET'])
def get_article_api(id):
    """获取特定文章详情，并附加用户交互状态"""
    # --- 修改: 使用正确的 relationship 名称，并添加is_deleted过滤条件 --- 
    article = Article.query.filter_by(id=id, is_deleted=False).options(joinedload(Article.author_user)).first_or_404()
    # --- 结束修改 ---

    is_liked = False
    is_collected = False
    like_action_id = None
    collect_action_id = None
    user_id = None
    
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity() 
        # --- 修改：处理 user_identity 可能直接是 int 的情况 --- 
        if user_identity:
            if isinstance(user_identity, dict):
                user_id = user_identity.get('id') 
            elif isinstance(user_identity, int):
                user_id = user_identity
            else:
                # 如果是其他无法处理的类型，记录日志
                current_app.logger.warning(f"Received unexpected JWT identity type: {type(user_identity)}")
        # --- 结束修改 --- 
    except Exception as e:
        current_app.logger.info(f"JWT verification optional failed or no user logged in: {e}")
        pass

    if user_id:
        # 修改：在此函数中，目标对象一定是 Article，所以 target_type 直接是 'article'
        target_type = 'article' 
        like_action = UserAction.query.filter_by(user_id=user_id, action_type='like', target_type=target_type, target_id=article.id).first()
        if like_action:
            is_liked = True
            like_action_id = like_action.id
        collect_action = UserAction.query.filter_by(user_id=user_id, action_type='collect', target_type=target_type, target_id=article.id).first()
        if collect_action:
            is_collected = True
            collect_action_id = collect_action.id

    article_dict = article.to_dict()
    article_dict['is_liked'] = is_liked
    article_dict['is_collected'] = is_collected
    article_dict['like_action_id'] = like_action_id
    article_dict['collect_action_id'] = collect_action_id

    # --- 更新浏览量 --- 
    update_article_view_count(article)
    # --- 结束更新浏览量 ---

    return jsonify(article_dict) # 返回包含交互状态的字典

# --- 修改：调整装饰器顺序 ---
@articles_bp.route('/', methods=['POST'])
@jwt_required()
def create_article_api():
    """创建新文章 (处理 FormData 和文件上传)"""
    # --- 修改：检查是否包含 topic_id --- 
    if 'topic_id' in request.form and request.form.get('topic_id'):
        return jsonify({'error': '创建社区帖子请使用 /api/posts 接口'}), 400
    # --- 结束修改 ---
    
    # 修改: 从 request.form 获取文本数据
    if 'title' not in request.form or 'content' not in request.form:
        return jsonify({'error': '文章标题和内容不能为空'}), 400

    try:
        user_id = get_jwt_identity()
        if user_id is None:
             return jsonify({"error": "无法从令牌中获取用户身份"}), 401 
    except Exception as e:
        current_app.logger.error(f"Error getting JWT identity: {e}")
        return jsonify({"error": "处理令牌时出错"}), 500

    title = request.form['title']
    content = request.form['content']
    category = request.form.get('category')
    summary = request.form.get('summary')
    # 修改: 处理 tags (可以有多个同名 key)
    tags_list_raw = request.form.getlist('tags') 
    # --- 后端二次处理标签 --- 
    tags = []
    if tags_list_raw:
        for tag_item in tags_list_raw:
            # 对每个元素再次按半角或全角逗号分割，并去除空白
            # 使用 re.split 来处理多个分隔符
            split_tags = [t.strip() for t in re.split(r'[,，]', tag_item) if t.strip()]
            tags.extend(split_tags)
    # --- 结束二次处理 ---
    # --- 新增：获取 topic_id --- 
    topic_id_str = request.form.get('topic_id')
    topic_id = None
    if topic_id_str:
        try:
            topic_id = int(topic_id_str)
            # 可选：检查 topic_id 是否有效
            if not Topic.query.get(topic_id):
                 return jsonify({'error': '关联的主题不存在'}), 404
        except ValueError:
            return jsonify({'error': '无效的主题ID格式'}), 400
    # --- 结束新增 ---
    # --- 调试日志：记录原始收到的 tags --- 
    current_app.logger.info(f"[create_article_api] Received raw tags from form: {tags_list_raw}")
    series_name = request.form.get('series_name')
    series_order = request.form.get('series_order') 
    is_published_str = request.form.get('is_published', 'true') # 获取发布状态
    is_published = is_published_str.lower() == 'true'

    # 处理封面图片上传 - 修复：检查正确的字段名 'cover_image'
    cover_image_path = None
    if 'cover_image' in request.files:
        cover_file = request.files['cover_image']
        if cover_file.filename != '': # 检查是否真的上传了文件
            # 记录日志，帮助调试
            current_app.logger.info(f"正在处理封面图片: {cover_file.filename}, 大小: {cover_file.content_length} 字节")
            
            saved_path = save_image(cover_file, subfolder='covers')
            if saved_path:
                # 修改：直接使用 save_image 返回的路径 (可能是 COS URL 或本地相对路径)
                cover_image_path = saved_path
                current_app.logger.info(f"封面图片已保存: {cover_image_path}")
            else:
                current_app.logger.error(f"封面图片 '{cover_file.filename}' 保存失败")
                return jsonify({'error': '封面图片保存失败'}), 500

    # ... (slug 生成逻辑 - 保持不变) ...
    new_slug = slugify(title)
    count = 1
    original_slug = new_slug
    while Article.query.filter_by(slug=new_slug).first():
        new_slug = f"{original_slug}-{count}"
        count += 1
        if count > 10:
            new_slug = f"{original_slug}-{int(time.time() * 1000)}" 
            break
            
    # ... (系列处理逻辑 - 保持不变) ...
    calculated_series_order = None
    if series_name is not None and not isinstance(series_name, str):
        return jsonify({"error": "系列名称必须是字符串"}), 400
    if series_name == "": 
        series_name = None 
    if series_name:
        if series_order is not None:
            try:
                calculated_series_order = int(series_order)
            except (ValueError, TypeError):
                 return jsonify({"error": "系列顺序必须是整数"}), 400
        else:
            max_order = db.session.query(db.func.max(Article.series_order))\
                                .filter_by(user_id=user_id, series_name=series_name)\
                                .scalar()
            calculated_series_order = (max_order or 0) + 1

    article = Article(
        title=title,
        content=content,
        summary=summary,
        category=category,
        tags=tags if tags else None, # 保存 tags 列表
        user_id=user_id,
        cover_image=cover_image_path, # 保存图片路径
        slug=new_slug,
        is_published=is_published,
        series_name=series_name,
        series_order=calculated_series_order
    )

    # --- 调试日志：记录处理后、保存前的 tags --- 
    current_app.logger.info(f"[create_article_api] Processed tags before saving. Type: {type(tags)}, Value: {tags}")

    try:
        db.session.add(article)
        db.session.commit()
        # 记录日志，帮助调试
        current_app.logger.info(f"文章创建成功: ID={article.id}, slug={article.slug}, 封面图片={article.cover_image}")
        # 生成并更新嵌入向量 (如果需要)
        # VectorStore.update_article_embedding(article.id) # --- 注释掉向量嵌入调用 --- 
        return jsonify(article.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating article in DB: {e}")
        return jsonify({'error': '数据库错误，无法创建文章'}), 500

@articles_bp.route('/<string:slug>', methods=['PUT'])
@jwt_required()
def update_article_api(slug):
    """更新文章信息 (处理 FormData 和文件上传)"""
    article = Article.query.filter_by(slug=slug).first_or_404()
    
    # 获取当前用户ID。注意：get_jwt_identity() 返回的就是用户ID（int），不是字典，因此不能用 ['id'] 取值。
    current_user_id = get_jwt_identity()
    if article.user_id != current_user_id:
        return jsonify({'error': '无权修改此文章'}), 403
        
    # 修改: 从 request.form 和 request.files 获取数据
    title = request.form.get('title')
    content = request.form.get('content')
    summary = request.form.get('summary')
    category = request.form.get('category')
    
    # 获取并处理标签 - 修复标签处理，确保能识别中英文逗号
    tags_list_raw = request.form.getlist('tags') # 获取 tag 列表
    
    # 调试日志：记录原始收到的 tags 
    current_app.logger.info(f"[update_article_api] 收到的原始标签: {tags_list_raw}")
    
    # 后端二次处理标签 - 增强处理逻辑，支持中英文逗号 
    tags = []
    if tags_list_raw:
        for tag_item in tags_list_raw:
            # 处理空标签情况（明确要清空标签）
            if tag_item.strip() == '':
                current_app.logger.info("[update_article_api] 检测到明确的空标签，将清空所有标签")
                tags = []
                break
                
            # 使用 re.split 来处理多个分隔符 (中英文逗号)
            split_tags = [t.strip() for t in re.split(r'[,，]', tag_item) if t.strip()]
            tags.extend(split_tags)
    
    # 调试日志：记录处理后的标签
    current_app.logger.info(f"[update_article_api] 处理后的标签: {tags}")
    current_app.logger.info(f"[update_article_api] 原有标签: {article.tags}")
    
    series_name = request.form.get('series_name')
    series_order = request.form.get('series_order')
    is_published_str = request.form.get('is_published') # 编辑时可能没有传
    # cover_image 文件在 request.files['cover_image'] 中
    
    # 检查是否有任何有效数据被发送
    if not request.form and not request.files:
         return jsonify({'error': '没有提供要更新的数据'}), 400

    needs_vector_update = False
    # 更新字段
    if title is not None and title != article.title:
        article.title = title
        # 考虑是否需要更新 slug
        needs_vector_update = True 
    if content is not None and content != article.content:
        article.content = content
        needs_vector_update = True
    if summary is not None:
        article.summary = summary
        needs_vector_update = True # 摘要也可能影响向量
    if category is not None:
        article.category = category
    
    # 标签处理 - 确保明确处理标签更新
    # 即使tags为空列表也进行更新（表示清空标签）
    article.tags = tags
    current_app.logger.info(f"[update_article_api] 更新后的标签: {article.tags}")
    
    # 处理发布状态
    if is_published_str is not None:
         article.is_published = is_published_str.lower() == 'true'
         
    # 处理系列更新
    if 'series_name' in request.form: # 检查 key 是否存在于 form 中
        new_series_name = request.form.get('series_name')
        article.series_name = new_series_name if new_series_name else None
        if not article.series_name:
             article.series_order = None # 如果系列被移除，清除顺序
             
    if 'series_order' in request.form and article.series_name:
         try:
             article.series_order = int(request.form['series_order'])
         except (ValueError, TypeError): 
             pass

    # 处理封面图片更新 - 修复：检查正确的字段名 'cover_image'
    if 'cover_image' in request.files:
        cover_file = request.files['cover_image']
        if cover_file.filename != '':
             # 记录日志，帮助调试
             current_app.logger.info(f"处理编辑文章的封面图片: {cover_file.filename}, 大小: {cover_file.content_length} 字节")
             
             # 删除旧封面图 (如果存在)
             if article.cover_image:
                 try:
                     # 判断路径类型
                     if article.cover_image.startswith('http'):
                         # 删除腾讯云COS中的图片
                         cos_storage.delete_file(article.cover_image)
                     else:
                         # 删除本地文件
                         old_file_rel_path = article.cover_image.replace('/static/uploads/', '', 1)
                         old_file_abs_path = os.path.join(current_app.config['UPLOAD_FOLDER'], old_file_rel_path)
                         if os.path.exists(old_file_abs_path):
                             os.remove(old_file_abs_path)
                 except Exception as e:
                     current_app.logger.error(f"Error deleting old cover image {article.cover_image}: {e}")
                     
             # 保存新封面图
             saved_path = save_image(cover_file, subfolder='covers')
             if saved_path:
                 current_app.logger.info(f"新封面图片已保存: {saved_path}")
                 # 如果是COS URL，直接使用完整URL
                 if saved_path.startswith('http'):
                     article.cover_image = saved_path
                 else:
                     # 本地路径 - 添加前缀
                     article.cover_image = saved_path  # 注意这里不再添加前缀
             else:
                 # 保存失败，记录错误日志
                 current_app.logger.error(f"新封面图片 '{cover_file.filename}' 保存失败")
                 return jsonify({'error': '封面图片保存失败'}), 500
        # 注意：如果 request.files['cover_image'] 存在但 filename 为空，表示字段存在但没有选文件，则不做任何操作，保持原图
    
    # 处理前端发送的现有封面图片 URL
    elif 'existing_cover_image' in request.form and request.form.get('keep_cover_image') == 'true':
        existing_cover_image = request.form.get('existing_cover_image')
        if existing_cover_image:
            current_app.logger.info(f"保留现有封面图片: {existing_cover_image}")
            article.cover_image = existing_cover_image

    try:
        db.session.commit()
        current_app.logger.info(f"文章更新成功: ID={article.id}, slug={article.slug}, 封面图片={article.cover_image}")
        # if needs_vector_update:
        #    VectorStore.update_article_embedding(article.id) # --- 注释掉向量嵌入调用 ---
        return jsonify(article.to_dict())
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating article {slug} in DB: {e}")
        return jsonify({'error': '数据库错误，无法更新文章'}), 500

@articles_bp.route('/<string:slug>', methods=['DELETE'])
@jwt_required()
def delete_article_api(slug):
    """
    软删除文章 API
    --- 修改实现 ---
    不再真正删除文章，而是将文章的is_deleted标记为True
    保留文章记录及其关联的交互记录，避免外键约束冲突
    同时维持历史记录的完整性
    """
    # 获取当前用户ID
    current_user_id = get_jwt_identity()
    
    try:
        # 使用新的会话查询文章
        article = db.session.query(Article).filter_by(slug=slug).first()
        if not article:
            return jsonify({"error": "未找到文章"}), 404

        # 权限检查
        if article.user_id != current_user_id and not is_admin(current_user_id):
            return jsonify({"error": "权限不足"}), 403

        # 使用SQL更新而不是ORM对象更新，避免会话状态问题
        db.session.execute(
            "UPDATE articles SET is_deleted = TRUE, updated_at = NOW() WHERE id = :article_id",
            {"article_id": article.id}
        )
        db.session.commit()
        
        current_app.logger.info(f"文章已软删除: ID={article.id}, slug={article.slug}")
        return jsonify({"message": "文章删除成功"}), 200
    except Exception as e:
        # 确保回滚任何未完成的事务
        try:
            db.session.rollback()
        except:
            pass
        
        current_app.logger.error(f"软删除文章失败: {e}")
        return jsonify({"error": f"删除文章失败: {str(e)}"}), 500

@articles_bp.route('/search', methods=['GET'])
def search_articles_api():
    """搜索相关文章"""
    query = request.args.get('q')
    
    if not query:
        return jsonify({'error': '搜索查询不能为空'}), 400
    
    # 实现简单的关键词搜索
    search = f"%{query}%"
    articles = Article.query.filter(
        (Article.title.ilike(search) | 
         Article.content.ilike(search) | 
         Article.summary.ilike(search)) &
        Article.is_published == True &
        Article.is_deleted == False  # 添加过滤条件，排除已删除文章
    ).limit(10).all()
    
    return jsonify({
        'results': [article.to_dict() for article in articles]
    })

@articles_bp.route('/categories', methods=['GET'])
def get_article_categories_api():
    """获取所有文章分类"""
    categories = db.session.query(Article.category).filter(
        Article.category.isnot(None),
        Article.is_published == True,
        Article.is_deleted == False  # 添加过滤条件，排除已删除文章
    ).distinct().all()
    
    return jsonify({
        'categories': [category[0] for category in categories if category[0]]
    })

@articles_bp.route('/slug/<slug>', methods=['GET'])
@limiter.exempt  # 添加豁免速率限制，因为这是查看文章详情的关键API
def get_article_by_slug_api(slug):
    """通过 slug 获取文章/帖子详情，并附加用户交互状态"""
    article = Article.query.filter_by(slug=slug, is_deleted=False).options(joinedload(Article.author_user)).first_or_404()

    is_liked = False
    is_collected = False
    like_action_id = None
    collect_action_id = None
    user_id = None
    
    try:
        verify_jwt_in_request(optional=True)
        user_identity = get_jwt_identity()
        # --- 修改：处理 user_identity 可能直接是 int 的情况 --- 
        if user_identity:
            if isinstance(user_identity, dict):
                user_id = user_identity.get('id') 
            elif isinstance(user_identity, int):
                user_id = user_identity
            else:
                current_app.logger.warning(f"Received unexpected JWT identity type: {type(user_identity)}")
        # --- 结束修改 --- 
    except Exception as e:
        current_app.logger.info(f"JWT verification optional failed or no user logged in: {e}")
        pass

    if user_id:
        # 修改：在此函数中，目标对象一定是 Article，所以 target_type 直接是 'article'
        target_type = 'article'
        like_action = UserAction.query.filter_by(user_id=user_id, action_type='like', target_type=target_type, target_id=article.id).first()
        if like_action:
            is_liked = True
            like_action_id = like_action.id
        collect_action = UserAction.query.filter_by(user_id=user_id, action_type='collect', target_type=target_type, target_id=article.id).first()
        if collect_action:
            is_collected = True
            collect_action_id = collect_action.id

    # --- 新增：计算点赞、收藏、分享次数 --- 
    like_count = UserAction.query.filter_by(
        action_type='like',
        target_type='article',
        target_id=article.id
    ).count()
    collect_count = UserAction.query.filter_by(
        action_type='collect',
        target_type='article',
        target_id=article.id
    ).count()
    share_count = UserAction.query.filter_by(
        action_type='share', 
        target_type='article', 
        target_id=article.id
    ).count()
    # Calculate comment count for the article
    comment_count = Comment.query.filter_by(
        article_id=article.id
    ).count() 
    # --- 结束新增 ---

    # --- 更新浏览量 --- 
    update_article_view_count(article)
    # --- 结束更新浏览量 ---

    # --- 修改：在返回的字典中包含分享次数 --- 
    article_dict = article.to_dict()
    article_dict['is_liked'] = is_liked
    article_dict['is_collected'] = is_collected
    article_dict['like_action_id'] = like_action_id
    article_dict['collect_action_id'] = collect_action_id
    article_dict['share_count'] = share_count # 添加分享次数
    article_dict['like_count'] = like_count   # 确保点赞数也返回 
    article_dict['collect_count'] = collect_count # 确保收藏数也返回
    article_dict['comment_count'] = comment_count # 添加评论次数
    # --- 结束修改 ---

    return jsonify(article_dict)

@articles_bp.route('/list')
def list_articles():
    """显示文章列表页面"""
    page = request.args.get('page', 1, type=int)
    per_page = 10 # Or get from config

    # Fetch published articles, ordered by creation date
    pagination = Article.query.filter_by(is_published=True)\
                            .order_by(Article.created_at.desc())\
                            .paginate(page=page, per_page=per_page, error_out=False)
    
    articles = pagination.items
    return render_template('articles.html', articles=articles, pagination=pagination)

@articles_bp.route('/view/<slug>')
def view_article(slug):
    """显示单篇文章详情页面"""
    article = Article.query.filter_by(slug=slug, is_published=True).first()
    
    if article is None:
        # If not found by slug or not published, return 404
        abort(404)
        
    # 更新浏览量
    update_article_view_count(article)

    return render_template('article_detail.html', article=article)

# --- 新增：获取文章的回答列表 --- 
@articles_bp.route('/<int:article_id>/answers', methods=['GET'])
def get_article_answers(article_id):
    """获取指定文章的所有回答"""
    article = Article.query.get_or_404(article_id)
    try:
        # 按创建时间排序回答，预加载作者信息以提高效率
        answers = article.answers.options(joinedload(Answer.author)).order_by(Answer.created_at.desc()).all()
        return jsonify([answer.to_dict() for answer in answers])
    except Exception as e:
        current_app.logger.error(f"Error fetching answers for article {article_id}: {e}")
        return jsonify({'error': '获取回答列表失败'}), 500
# --- 结束新增 --- 

# --- 新增：为文章创建新回答 --- 
@articles_bp.route('/<int:article_id>/answers', methods=['POST'])
@jwt_required() # 需要用户登录才能回答
def create_answer(article_id):
    """为指定文章创建新回答"""
    article = Article.query.get_or_404(article_id)
    # 获取当前用户ID。注意：get_jwt_identity() 返回的就是用户ID（int），不是字典，因此不能用 ['id'] 取值。
    current_user_id = get_jwt_identity()
    
    data = request.get_json()
    if not data or not data.get('content'):
        return jsonify({'error': '回答内容不能为空'}), 400

    content = data['content']
    # TODO: 在这里添加 HTML 内容清理 (例如使用 bleach 库) 防止 XSS 攻击
    
    new_answer = Answer(
        content=content,
        article_id=article_id,
        user_id=current_user_id
    )
    
    try:
        db.session.add(new_answer)
        db.session.commit()
        # 返回包含作者信息的完整回答数据
        return jsonify(new_answer.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating answer for article {article_id}: {e}")
        return jsonify({'error': '创建回答失败'}), 500
# --- 结束新增 --- 

# --- 新增：获取当前用户创建的所有系列名称 --- 
@articles_bp.route('/user/series', methods=['GET'])
@jwt_required()
def get_user_series_names():
    """获取当前登录用户创建的所有文章系列名称"""
    try:
        user_id = get_jwt_identity()
        if not user_id:
            return jsonify({"error": "需要登录"}), 401

        # 查询用户创建的所有不重复的 series_name
        series_names = db.session.query(distinct(Article.series_name)).\
            filter(Article.user_id == user_id, Article.series_name != None, Article.series_name != '').\
            order_by(Article.series_name).all()

        # 提取名称列表
        names = [name[0] for name in series_names]

        return jsonify({"series_names": names})

    except Exception as e:
        current_app.logger.error(f"获取用户系列名称时出错: {e}", exc_info=True)
        return jsonify({"error": "获取系列名称失败"}), 500

# --- 新增：获取文章评论的 API 端点 ---
@articles_bp.route('/<int:article_id>/comments', methods=['GET'])
def get_article_comments_api(article_id):
    """获取指定文章的评论列表 (占位/代理实现)
    
    此接口理想情况下应该调用 original_comments.py 中的逻辑，
    或者前端直接请求 /api/original-comments/articles/<article_id>/comments。
    """
    limit = request.args.get('limit', 10, type=int)
    sort_by = request.args.get('sort_by', 'latest')
    cursor_str = request.args.get('cursor')

    article = Article.query.get(article_id)
    if not article:
        return jsonify({"error": "文章未找到"}), 404

    # 提示信息，指明正确的评论获取方式或此接口的待办事项
    # 在实际开发中，这里可能会代理到 original_comments 蓝图的相应服务，
    # 或者重构评论获取逻辑为可共享的服务层函数。
    return jsonify({
        "message": f"此接口 ('/api/articles/{article_id}/comments') 用于获取文章评论。实际的评论数据应由 'original_comments' 模块提供。",
        "suggestion": f"考虑直接使用 /api/original-comments/articles/{article_id}/comments 或完善此接口的代理/调用逻辑。",
        "requested_article_id": article_id,
        "query_params": {"limit": limit, "sort_by": sort_by, "cursor": cursor_str},
        "comments": [] # 占位数据
    }), 200
# --- 结束新增 ---