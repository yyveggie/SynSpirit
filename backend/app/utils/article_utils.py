"""
文章工具模块

提供与文章模型(Article)相关的工具函数，包括：
- 更新文章浏览量
- 处理文章相关的缓存操作
- 统一文章交互逻辑处理
- 获取文章列表的缓存实现

这个模块旨在减少代码重复，提高可维护性，并确保所有API端点使用一致的方法操作文章。
"""

from flask import current_app, request
from app import db
from app.models.article import Article
from app.utils.cache_manager import CounterCache, DataCache
from sqlalchemy.orm import joinedload
import hashlib
import json
from app.utils.cache_manager import TTL
from sqlalchemy import asc, desc
import pickle
from app.models.user import User

# 从缓存管理器获取Redis客户端
def get_redis_client():
    """获取Redis客户端实例"""
    from app.utils.cache_manager import cache
    if hasattr(cache, '_write_client'):
        return cache._write_client
    else:
        # 如果缓存管理器未初始化，则直接创建Redis客户端
        import redis
        redis_url = current_app.config.get('REDIS_URL', 'redis://localhost:6379/0')
        return redis.from_url(redis_url)

# 获取Redis客户端
redis_client = get_redis_client()

def update_article_view_count(article):
    """
    更新文章浏览量
    
    使用Article模型的increment_view_count方法，该方法会优先使用缓存，
    失败时回退到直接数据库更新。这是更新文章浏览量的推荐方法。
    
    参数:
        article: Article对象实例
        
    返回:
        int: 更新后的浏览量
    """
    try:
        if not article:
            current_app.logger.error("update_article_view_count调用时传入了空的article对象")
            return 0
            
        # 使用Article模型的increment_view_count方法增加浏览量
        # 该方法优先使用缓存，失败时回退到直接更新数据库
        new_count = article.increment_view_count()
        current_app.logger.info(f"文章浏览量已更新: ID={article.id}, slug={article.slug}, 新浏览量={new_count}")
        return new_count
    except Exception as e:
        current_app.logger.error(f"更新文章浏览量失败: {e}")
        # 异常情况下回退到直接更新（虽然increment_view_count已有回退机制）
        try:
            # 尝试直接更新数据库
            article.view_count = (article.view_count or 0) + 1
            db.session.commit()
            return article.view_count
        except Exception as inner_e:
            current_app.logger.error(f"回退更新文章浏览量失败: {inner_e}")
            db.session.rollback()
            return article.view_count or 0

def get_article_by_slug(slug, include_deleted=False):
    """
    通过slug获取文章，预加载作者信息
    
    参数:
        slug: 文章的slug标识
        include_deleted: 是否包含已删除的文章（默认不包含）
        
    返回:
        Article对象或None
    """
    query = Article.query.options(joinedload(Article.author_user))
    
    if not include_deleted:
        query = query.filter(Article.is_deleted == False)
        
    return query.filter_by(slug=slug).first()

def get_article_by_id(article_id, include_deleted=False):
    """
    通过ID获取文章，预加载作者信息
    
    参数:
        article_id: 文章ID
        include_deleted: 是否包含已删除的文章（默认不包含）
        
    返回:
        Article对象或None
    """
    query = Article.query.options(joinedload(Article.author_user))
    
    if not include_deleted:
        query = query.filter(Article.is_deleted == False)
        
    return query.filter_by(id=article_id).first() 

def generate_article_list_cache_key(params):
    """
    根据请求参数生成文章列表缓存键
    
    参数:
        params: 包含筛选条件的字典，通常来自请求参数
        
    返回:
        str: 缓存键
    """
    # 提取常用参数
    limit = params.get('limit', 15)
    offset = params.get('offset', 0)
    category = params.get('category', '')
    tag = params.get('tag', '')
    sort_by = params.get('sort_by', 'created_at')
    sort_order = params.get('sort_order', 'desc')
    fields = params.get('fields', '')
    
    # 创建参数字典并按键排序，确保相同参数生成相同的缓存键
    key_dict = {
        'limit': limit,
        'offset': offset,
        'category': category,
        'tag': tag,
        'sort_by': sort_by,
        'sort_order': sort_order,
        'fields': fields
    }
    
    # 将字典转换为排序后的JSON字符串
    key_json = json.dumps(key_dict, sort_keys=True)
    
    # 使用MD5生成哈希值作为缓存键的一部分
    key_hash = hashlib.md5(key_json.encode()).hexdigest()
    
    # 返回最终的缓存键 - 使用data:article_list前缀，与DataCache类的设计一致
    return f"data:article_list:{key_hash}"

def get_cached_articles_list(params):
    """获取缓存的文章列表，如果缓存不存在则从数据库获取并缓存
    
    Args:
        params: 包含查询参数的字典
        
    Returns:
        dict: 包含articles和total的字典
    """
    try:
        # 生成缓存键
        cache_key = generate_article_list_cache_key(params)
        current_app.logger.debug(f"尝试获取文章列表缓存，键: {cache_key}")
        
        # 尝试从缓存获取
        cached_data = redis_client.get(cache_key)
        
        # 如果缓存存在，则返回缓存的数据
        if cached_data:
            try:
                result = pickle.loads(cached_data)
                articles_count = len(result.get('articles', []))
                total_count = result.get('total', 0)
                current_app.logger.debug(f"缓存命中，返回{articles_count}篇文章，总数{total_count}")
                return result
            except Exception as e:
                current_app.logger.error(f"反序列化缓存数据失败: {str(e)}", exc_info=True)
                # 缓存数据损坏，继续从数据库获取
        else:
            current_app.logger.debug(f"缓存未命中，将从数据库获取")
        
        # 从数据库获取数据
        result = fetch_articles_from_db(params)
        
        # 检查结果是否有效
        if not result or not isinstance(result, dict):
            current_app.logger.error(f"数据库查询返回无效结果: {result}")
            return {'articles': [], 'total': 0}
            
        # 确保结果中包含必要的键
        if 'articles' not in result:
            current_app.logger.warning("数据库结果中缺少'articles'键，添加空列表")
            result['articles'] = []
            
        if 'total' not in result:
            current_app.logger.warning("数据库结果中缺少'total'键，添加0")
            result['total'] = 0
        
        # 设置缓存过期时间
        ttl = get_article_list_cache_ttl(params)
        
        try:
            # 序列化并缓存结果
            serialized_data = pickle.dumps(result)
            data_size = len(serialized_data)
            current_app.logger.debug(f"缓存文章列表，键: {cache_key}，大小: {data_size}字节，TTL: {ttl}秒")
            
            # 设置缓存
            redis_client.setex(cache_key, ttl, serialized_data)
            current_app.logger.debug(f"文章列表已成功缓存")
        except Exception as e:
            current_app.logger.error(f"缓存文章列表失败: {str(e)}", exc_info=True)
            # 缓存失败不影响返回结果
        
        articles_count = len(result.get('articles', []))
        total_count = result.get('total', 0)
        current_app.logger.debug(f"返回从数据库获取的{articles_count}篇文章，总数{total_count}")
        return result
        
    except Exception as e:
        current_app.logger.error(f"获取缓存文章列表失败: {str(e)}", exc_info=True)
        # 出错时返回空结果
        return {'articles': [], 'total': 0}

def get_article_list_cache_ttl(params):
    """
    根据查询参数确定合适的缓存时间
    
    参数:
        params: 包含筛选条件的字典
        
    返回:
        int: 缓存时间（秒）
    """
    # 默认缓存时间
    default_ttl = TTL['DATA_MEDIUM']  # 5分钟
    
    # 首页最新文章（无分类、标签筛选，按创建时间排序）
    if (not params.get('category') and not params.get('tag') and 
            params.get('sort_by') == 'created_at' and params.get('sort_order') == 'desc'):
        return default_ttl
    
    # 分类或标签筛选的文章列表
    if params.get('category') or params.get('tag'):
        return TTL['DATA_SHORT'] * 2  # 2分钟
    
    # 其他类型的文章列表
    return TTL['DATA_SHORT']  # 1分钟

def fetch_articles_from_db(params):
    """从数据库获取文章列表
    
    Args:
        params: 包含查询参数的字典，包括limit, offset, category, tag, sort_by, sort_order, fields
        
    Returns:
        dict: 包含articles和total的字典
    """
    try:
        current_app.logger.info(f"从数据库获取文章列表，参数: {params}")
        
        # 解析参数
        limit = params.get('limit', 15)
        offset = params.get('offset', 0)
        category = params.get('category', '')
        tag = params.get('tag', '')
        sort_by = params.get('sort_by', 'created_at')
        sort_order = params.get('sort_order', 'desc')
        
        # 创建查询
        query = Article.query.filter(Article.is_deleted == False)
        current_app.logger.debug(f"初始查询条件: Article.is_deleted == False")
        
        # 添加筛选条件
        if category:
            query = query.filter(Article.category == category)
            current_app.logger.debug(f"添加分类筛选: Article.category == {category}")
            
        if tag:
            query = query.filter(Article.tags.contains([tag]))
            current_app.logger.debug(f"添加标签筛选: Article.tags.contains([{tag}])")
        
        # 添加排序
        if sort_order.lower() == 'asc':
            query = query.order_by(asc(getattr(Article, sort_by)))
            current_app.logger.debug(f"添加升序排序: Article.{sort_by} ASC")
        else:
            query = query.order_by(desc(getattr(Article, sort_by)))
            current_app.logger.debug(f"添加降序排序: Article.{sort_by} DESC")
        
        # 获取总数
        total = query.count()
        current_app.logger.debug(f"查询文章总数: {total}")
        
        # 应用分页
        query = query.limit(limit).offset(offset)
        current_app.logger.debug(f"应用分页: limit={limit}, offset={offset}")
        
        # 执行查询
        articles = query.all()
        current_app.logger.debug(f"查询结果: {len(articles)}篇文章")
        
        # 预加载作者信息
        user_ids = [article.user_id for article in articles]
        authors = {}
        if user_ids:
            author_query = User.query.filter(User.id.in_(user_ids))
            for author in author_query:
                authors[author.id] = author
            current_app.logger.debug(f"预加载了{len(authors)}个作者信息")
        
        # 转换为字典列表
        articles_list = []
        for article in articles:
            article_dict = article.to_dict()
            
            # 添加作者信息
            if article.user_id in authors:
                author = authors[article.user_id]
                article_dict['author'] = author.to_dict_basic()
                
            articles_list.append(article_dict)
            
        result = {
            'articles': articles_list,
            'total': total
        }
        
        current_app.logger.info(f"从数据库获取文章列表完成，返回{len(articles_list)}篇文章，总数{total}")
        return result
        
    except Exception as e:
        current_app.logger.error(f"从数据库获取文章列表失败: {str(e)}", exc_info=True)
        return {'articles': [], 'total': 0}

def invalidate_article_list_cache():
    """
    失效所有文章列表缓存
    
    当文章增删改时调用此函数，确保用户能看到最新数据。
    
    返回:
        int: 失效的缓存项数量
    """
    pattern = "synspirit:data:article_list:*"
    count = DataCache.invalidate_pattern(pattern)
    current_app.logger.info(f"已失效 {count} 个文章列表缓存")
    return count 