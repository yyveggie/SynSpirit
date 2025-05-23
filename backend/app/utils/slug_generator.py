"""
生成唯一 slug 的工具函数。

为模型生成友好的 URL 标识符，支持中文转拼音，并确保生成的 slug 在特定模型的表中唯一。
"""
import re
import time
import unicodedata
from sqlalchemy import inspect
from pypinyin import lazy_pinyin

def slugify(text):
    """
    将文本转换为 URL 友好的 slug 格式
    
    参数:
        text (str): 要转换的文本
        
    返回:
        str: 格式化后的 slug
    """
    # 如果是中文，先转为拼音
    if any('\u4e00' <= char <= '\u9fff' for char in text):
        # 使用 pypinyin 将中文转换为拼音
        text = '-'.join(lazy_pinyin(text))
    
    # 标准化 Unicode 字符
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    # 转换为小写
    text = text.lower()
    # 替换除字母数字连字符下划线外的字符为连字符
    text = re.sub(r'[^\w\s-]', '', text).strip()
    # 将空格替换为连字符
    text = re.sub(r'[-\s]+', '-', text)
    
    return text

def generate_unique_slug(text, model, exclude_id=None):
    """
    生成唯一的 slug，如果已存在则添加后缀
    
    参数:
        text (str): 要转换为 slug 的文本
        model (db.Model): 需要检查唯一性的 SQLAlchemy 模型
        exclude_id (int, optional): 更新时排除的 ID
        
    返回:
        str: 唯一的 slug
    """
    base_slug = slugify(text)
    slug = base_slug
    counter = 1
    
    # 获取模型的主键名称
    pk_name = inspect(model).primary_key[0].name
    
    while True:
        # 构建查询
        query = model.query.filter(model.slug == slug)
        
        # 如果提供了 exclude_id，排除该 ID
        if exclude_id is not None:
            query = query.filter(getattr(model, pk_name) != exclude_id)
            
        # 检查 slug 是否存在
        exists = query.first() is not None
        
        if not exists:
            break
            
        # 如果存在，添加数字后缀
        slug = f"{base_slug}-{counter}"
        counter += 1
        
        # 防止无限循环，超过一定次数后使用时间戳
        if counter > 100:
            slug = f"{base_slug}-{int(time.time())}"
            break
            
    return slug 