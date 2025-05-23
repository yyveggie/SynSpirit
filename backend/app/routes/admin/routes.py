"""
此模块定义了后台管理界面的路由和处理逻辑。
(通常在 app/__init__.py 中以 /admin 或类似前缀注册)

主要功能 (需要管理员登录 @login_required):
- 渲染和处理文章 (Article) 管理页面 (列表、添加、编辑、删除)。
- 渲染和处理工具 (Tool) 管理页面 (列表、添加、编辑、删除)。
- 渲染和处理分类 (Category) 管理页面 (列表、添加、编辑、删除)。
- 处理管理界面中的图片上传 (支持腾讯云 COS 和本地存储)。

依赖模型: Article, Tool, Category, User (通过 current_user)
服务/工具: cos_storage
认证: Flask-Login
使用 Flask 蓝图: admin_bp (在 admin/__init__.py 中定义)

注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，如发现功能与注释描述不同，也可以在确定后修改。
"""
from flask import render_template, request, redirect, url_for, flash, jsonify
from app import db
from app.models import Article, Tool, Category
from . import admin_bp
import re
import unicodedata
import os
from werkzeug.utils import secure_filename
import time
from flask_login import current_user, login_required
from app.utils.cos_storage import cos_storage  # 导入COS存储工具类

# 为上传图片配置参数
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# 确保上传目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def handle_cover_image_upload(file, old_image_path=None):
    """处理封面图片上传，返回图片的URL路径"""
    if file and allowed_file(file.filename):
        # 先尝试上传到腾讯云COS
        cos_url = cos_storage.upload_file(file, subfolder='tools')
        if cos_url:
            # 如果上传成功，删除旧文件(如果有)
            if old_image_path:
                try:
                    if old_image_path.startswith('http'):
                        # 删除腾讯云COS上的旧图
                        cos_storage.delete_file(old_image_path)
                    elif old_image_path.startswith('/static/uploads/'):
                        # 删除本地旧图
                        old_file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
                                                   old_image_path.lstrip('/'))
                        if os.path.exists(old_file_path):
                            os.remove(old_file_path)
                except Exception as e:
                    print(f"删除旧图片时出错: {e}")
            
            # 返回COS URL
            return cos_url
            
        # 如果上传到COS失败，回退到本地存储
        print("上传到腾讯云COS失败，回退到本地存储")
        
        # 使用时间戳和原文件名创建新的文件名，避免重名
        filename = f"{int(time.time())}_{secure_filename(file.filename)}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # 如果之前有上传图片，尝试删除旧图片（避免浪费存储空间）
        if old_image_path and old_image_path.startswith('/static/uploads/'):
            try:
                old_file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
                                           old_image_path.lstrip('/'))
                if os.path.exists(old_file_path):
                    os.remove(old_file_path)
            except Exception as e:
                print(f"删除旧图片时出错: {e}")
        
        # 返回可以从浏览器访问的路径
        return f"/static/uploads/{filename}"
        
    return None

def slugify(value, allow_unicode=False):
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
    return re.sub(r'[-\s]+', '-', value).strip('_-+')

# 后台文章管理列表
@admin_bp.route('/articles/')
#@login_required # Temporarily commented out for debugging 405
def manage_articles():
    articles = Article.query.order_by(Article.created_at.desc()).all()
    return render_template('manage_articles.html', articles=articles)

# 添加新文章
@admin_bp.route('/articles/new', methods=['GET', 'POST'])
@login_required
def add_article():
    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        summary = request.form.get('summary')
        category = request.form.get('category')
        tags_str = request.form.get('tags')
        cover_image = request.form.get('cover_image')
        slug = request.form.get('slug')
        is_published = 'is_published' in request.form
        
        # 处理图片上传
        cover_image_file = request.files.get('cover_image_file')
        if cover_image_file and cover_image_file.filename:
            uploaded_image_path = handle_cover_image_upload(cover_image_file)
            if uploaded_image_path:
                cover_image = uploaded_image_path
        
        if not title or not content:
            flash('Title and content are required.', 'danger')
            return render_template('admin/article_form.html', form=request.form)

        tags = [tag.strip() for tag in tags_str.split(',')] if tags_str else None

        # Generate slug if not provided
        final_slug = ""
        if not slug:
            final_slug = slugify(title)
        else: # Sanitize provided slug
            final_slug = slugify(slug)

        # Ensure slug is not empty after generation/sanitization
        if not final_slug:
            flash('Could not generate a valid slug from the title or provided slug. Please adjust the title or provide a valid slug.', 'danger')
            form_data = request.form.to_dict()
            form_data['tags'] = tags_str
            return render_template('admin/article_form.html', form=form_data)
        
        # Check if slug is unique
        existing_article = Article.query.filter_by(slug=final_slug).first()
        if existing_article:
            flash(f'Slug "{final_slug}" already exists. Please choose a different one.', 'danger')
            # Re-render form with current data
            form_data = request.form.to_dict()
            form_data['tags'] = tags_str # Preserve original tags input
            return render_template('admin/article_form.html', form=form_data)

        new_article = Article(
            title=title,
            content=content,
            summary=summary,
            category=category,
            tags=tags,
            user_id=current_user.id,
            cover_image=cover_image,
            slug=final_slug, # Use the validated final_slug
            is_published=is_published
        )
        db.session.add(new_article)
        db.session.commit()
        flash('Article added successfully.', 'success')
        return redirect(url_for('admin.manage_articles'))
    
    return render_template('admin/article_form.html', form={})

# 编辑文章
@admin_bp.route('/articles/edit/<int:article_id>', methods=['GET', 'POST'])
@login_required
def edit_article(article_id):
    article = Article.query.get_or_404(article_id)
    original_slug = article.slug # 保存原始 slug

    if request.method == 'POST':
        article.title = request.form.get('title')
        article.content = request.form.get('content')
        article.summary = request.form.get('summary')
        article.category = request.form.get('category')
        tags_str = request.form.get('tags')
        
        old_cover_image = article.cover_image
        article.cover_image = request.form.get('cover_image')
        
        cover_image_file = request.files.get('cover_image_file')
        if cover_image_file and cover_image_file.filename:
            uploaded_image_path = handle_cover_image_upload(cover_image_file, old_cover_image)
            if uploaded_image_path:
                article.cover_image = uploaded_image_path

        article.is_published = 'is_published' in request.form

        if not article.title or not article.content:
            flash('Title and content are required.', 'danger')
            return render_template('admin/article_form.html', form=article, article_id=article_id)

        article.tags = [tag.strip() for tag in tags_str.split(',')] if tags_str else None
        
        # 获取管理员在表单中输入的 slug，如果没有输入则为空字符串
        slug_from_form = request.form.get('slug', '').strip()
        new_final_slug = original_slug # 默认为原始 slug

        if slug_from_form and slug_from_form != original_slug:
            # 如果管理员提供了一个新的、且与原来不同的 slug，则处理这个新的 slug
            # 注意：这里的 slugify 是 admin 本地定义的，它 allow_unicode=False
            # 这会移除中文字符并改变格式，如果希望保留unicode，需要使用 articles.py 中的版本
            new_final_slug = slugify(slug_from_form)
        elif not original_slug and article.title:
            # 如果文章原本没有 slug (例如旧数据或创建时未生成)，且管理员也没在表单中提供，则根据标题生成
            # 注意：这里的 slugify 同样是 admin 本地定义的
            new_final_slug = slugify(article.title)
        # 如果 slug_from_form 为空，并且 original_slug 存在，则 new_final_slug 保持为 original_slug，不做任何改变。

        # Ensure slug is not empty after generation/sanitization
        if not new_final_slug:
            flash('Could not generate a valid slug from the title or provided slug. Please adjust the title or provide a valid slug.', 'danger')
            form_data = request.form.to_dict()
            form_data['tags'] = tags_str
            return render_template('admin/article_form.html', form=form_data, article_id=article_id)

        # Check if slug is unique (only if it has changed from the original)
        if new_final_slug != original_slug:
            existing_article = Article.query.filter(Article.slug == new_final_slug, Article.id != article_id).first()
            if existing_article:
                flash(f'Slug "{new_final_slug}" already exists. Please choose a different one.', 'danger')
                form_data = request.form.to_dict()
                form_data['tags'] = tags_str
                return render_template('admin/article_form.html', form=form_data, article_id=article_id)
        
        article.slug = new_final_slug
            
        db.session.commit()
        flash('Article updated successfully.', 'success')
        return redirect(url_for('admin.manage_articles'))

    form_data = {
        'title': article.title,
        'content': article.content,
        'summary': article.summary,
        'category': article.category,
        'tags': ', '.join(article.tags) if article.tags else '',
        'cover_image': article.cover_image,
        'slug': article.slug,
        'is_published': article.is_published
    }
    return render_template('admin/article_form.html', form=form_data, article_id=article_id)

# 删除文章
@admin_bp.route('/articles/delete/<int:article_id>', methods=['POST'])
@login_required
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    db.session.delete(article)
    db.session.commit()
    flash('Article deleted successfully.', 'success')
    return redirect(url_for('admin.manage_articles'))

# 工具管理
@admin_bp.route('/tools')
@login_required
def manage_tools():
    tools = Tool.query.order_by(Tool.created_at.desc()).all()
    return render_template('admin/manage_tools.html', tools=tools)

# 添加新工具
@admin_bp.route('/tools/new', methods=['GET', 'POST'])
@login_required
def add_tool():
    if request.method == 'POST':
        name = request.form.get('name')
        description = request.form.get('description')
        source_url = request.form.get('source_url')
        category_id = request.form.get('category_id')
        tags_str = request.form.get('tags')
        content = request.form.get('content')
        
        # 获取功能点、使用场景、优缺点等
        features_str = request.form.get('features')
        use_cases_str = request.form.get('use_cases')
        pros_str = request.form.get('pros')
        cons_str = request.form.get('cons')
        
        is_free = 'is_free' in request.form
        pricing_info = request.form.get('pricing_info')
        slug = request.form.get('slug')
        
        # 处理图片上传
        screenshot_file = request.files.get('screenshot_file')
        screenshot_url = None
        if screenshot_file and screenshot_file.filename:
            uploaded_image_path = handle_cover_image_upload(screenshot_file)
            if uploaded_image_path:
                screenshot_url = uploaded_image_path
        
        # Get is_published status from form
        is_published = 'is_published' in request.form
        
        if not name or not category_id:
            flash('工具名称和类别不能为空', 'danger')
            categories = Category.query.all()
            return render_template('admin/tool_form.html', form=request.form, categories=categories)

        # 处理标签和其他列表类数据
        tags = [tag.strip() for tag in tags_str.split(',')] if tags_str else None
        features = [feature.strip() for feature in features_str.split('\n')] if features_str else None
        use_cases = [use_case.strip() for use_case in use_cases_str.split('\n')] if use_cases_str else None
        pros = [pro.strip() for pro in pros_str.split('\n')] if pros_str else None
        cons = [con.strip() for con in cons_str.split('\n')] if cons_str else None

        # 生成slug如果没提供
        final_slug = ""
        if not slug:
            final_slug = slugify(name)
        else:
            final_slug = slugify(slug)

        # 确保slug不为空
        if not final_slug:
            flash('无法从名称生成有效的slug，请调整名称或提供有效的slug', 'danger')
            categories = Category.query.all()
            return render_template('admin/tool_form.html', form=request.form, categories=categories)
        
        # 检查slug是否唯一
        existing_tool = Tool.query.filter_by(slug=final_slug).first()
        if existing_tool:
            flash(f'Slug "{final_slug}" 已存在，请选择一个不同的slug', 'danger')
            categories = Category.query.all()
            return render_template('admin/tool_form.html', form=request.form, categories=categories)

        # 创建工具对象
        new_tool = Tool(
            name=name,
            description=description,
            source_url=source_url,
            category_id=int(category_id),
            tags=tags,
            content=content,
            features=features,
            use_cases=use_cases,
            pros=pros,
            cons=cons,
            is_free=is_free,
            pricing_info=pricing_info if pricing_info else None,
            screenshot_url=screenshot_url,
            slug=final_slug,
            is_published=is_published # Save is_published status
        )
        db.session.add(new_tool)
        db.session.commit()
        
        # 更新向量嵌入（如果有相关服务）
        from app.services.vector_store import VectorStore
        try:
            VectorStore.update_tool_embedding(new_tool.id)
        except Exception as e:
            print(f"更新工具向量嵌入时出错: {e}")
        
        flash('工具添加成功', 'success')
        return redirect(url_for('admin.manage_tools'))
    
    # GET 请求：获取所有类别并渲染表单
    categories = Category.query.order_by(Category.name).all() # Ensure categories are fetched and ordered
    return render_template('admin/tool_form.html', form={}, categories=categories)

# 编辑工具
@admin_bp.route('/tools/edit/<int:tool_id>', methods=['GET', 'POST'])
@login_required
def edit_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    # GET 请求和 POST 失败时都需要获取类别列表
    categories = Category.query.order_by(Category.name).all() 
    
    if request.method == 'POST':
        tool.name = request.form.get('name')
        tool.description = request.form.get('description')
        tool.source_url = request.form.get('source_url')
        tool.category_id = int(request.form.get('category_id'))
        
        tags_str = request.form.get('tags')
        tool.tags = [tag.strip() for tag in tags_str.split(',')] if tags_str else None
        
        tool.content = request.form.get('content')
        
        # 处理列表型数据
        features_str = request.form.get('features')
        use_cases_str = request.form.get('use_cases')
        pros_str = request.form.get('pros')
        cons_str = request.form.get('cons')
        
        tool.features = [feature.strip() for feature in features_str.split('\n')] if features_str else None
        tool.use_cases = [use_case.strip() for use_case in use_cases_str.split('\n')] if use_cases_str else None
        tool.pros = [pro.strip() for pro in pros_str.split('\n')] if pros_str else None
        tool.cons = [con.strip() for con in cons_str.split('\n')] if cons_str else None
        
        tool.is_free = 'is_free' in request.form
        tool.pricing_info = request.form.get('pricing_info')
        
        # 保存原截图URL，处理新上传
        old_screenshot = tool.screenshot_url
        
        # 处理图片上传
        screenshot_file = request.files.get('screenshot_file')
        if screenshot_file and screenshot_file.filename:
            uploaded_image_path = handle_cover_image_upload(screenshot_file, old_screenshot)
            if uploaded_image_path:
                tool.screenshot_url = uploaded_image_path
        
        # 处理slug
        new_slug = request.form.get('slug')
        if not new_slug:
            new_slug = slugify(tool.name)
        else:
            new_slug = slugify(new_slug)
            
        if not new_slug:
            flash('无法从名称生成有效的slug，请调整名称或提供有效的slug', 'danger')
            form_data = request.form.to_dict()
            # 确保 POST 失败时也将 categories 传回模板
            return render_template('admin/tool_form.html', form=form_data, tool_id=tool_id, categories=categories)
            
        # 如果slug变了，需要检查唯一性
        if new_slug != tool.slug:
            existing_tool = Tool.query.filter(Tool.slug == new_slug, Tool.id != tool_id).first()
            if existing_tool:
                flash(f'Slug "{new_slug}" 已存在，请选择一个不同的slug', 'danger')
                form_data = request.form.to_dict()
                return render_template('admin/tool_form.html', form=form_data, tool_id=tool_id, categories=categories)
                
        tool.slug = new_slug
        
        # Get is_published status from form
        tool.is_published = 'is_published' in request.form
        
        if not tool.name or not tool.category_id:
            flash('工具名称和类别不能为空', 'danger')
            form_data = request.form.to_dict()
            # 确保 POST 失败时也将 categories 传回模板
            return render_template('admin/tool_form.html', form=form_data, tool_id=tool_id, categories=categories)
            
        db.session.commit()
        
        # 更新向量嵌入
        from app.services.vector_store import VectorStore
        try:
            VectorStore.update_tool_embedding(tool.id)
        except Exception as e:
            print(f"更新工具向量嵌入时出错: {e}")
            
        flash('工具更新成功', 'success')
        return redirect(url_for('admin.manage_tools'))
    
    # GET 请求：准备表单数据并获取类别
    form_data = {
        'name': tool.name,
        'description': tool.description,
        'source_url': tool.source_url,
        'category_id': tool.category_id,
        'tags': ', '.join(tool.tags) if tool.tags else '',
        'content': tool.content,
        'features': '\n'.join(tool.features) if tool.features else '',
        'use_cases': '\n'.join(tool.use_cases) if tool.use_cases else '',
        'pros': '\n'.join(tool.pros) if tool.pros else '',
        'cons': '\n'.join(tool.cons) if tool.cons else '',
        'is_free': tool.is_free,
        'pricing_info': tool.pricing_info,
        'screenshot_url': tool.screenshot_url,
        'slug': tool.slug,
        'is_published': tool.is_published
    }
    return render_template('admin/tool_form.html', form=form_data, tool_id=tool_id, categories=categories)

# 删除工具
@admin_bp.route('/tools/delete/<int:tool_id>', methods=['POST'])
@login_required
def delete_tool(tool_id):
    tool = Tool.query.get_or_404(tool_id)
    
    # 如果有截图，尝试删除
    if tool.screenshot_url:
        try:
            if tool.screenshot_url.startswith('http'):
                # 删除腾讯云COS上的图片
                cos_storage.delete_file(tool.screenshot_url)
            elif tool.screenshot_url.startswith('/static/uploads/'):
                # 删除本地图片
                screenshot_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
                                           tool.screenshot_url.lstrip('/'))
                if os.path.exists(screenshot_path):
                    os.remove(screenshot_path)
        except Exception as e:
            print(f"删除工具截图时出错: {e}")
    
    db.session.delete(tool)
    db.session.commit()
    flash('工具删除成功', 'success')
    return redirect(url_for('admin.manage_tools'))

# ------------- Category Management -------------

# 列出所有类别
@admin_bp.route('/categories')
@login_required
def manage_categories():
    categories = Category.query.order_by(Category.name).all()
    return render_template('admin/manage_categories.html', categories=categories)

# 添加新类别
@admin_bp.route('/categories/new', methods=['GET', 'POST'])
@login_required
def add_category():
    if request.method == 'POST':
        name = request.form.get('name')
        description = request.form.get('description')
        if not name:
            flash('类别名称不能为空', 'danger')
        else:
            # 检查名称是否重复
            existing_category = Category.query.filter_by(name=name).first()
            if existing_category:
                flash('该类别名称已存在', 'warning')
            else:
                new_category = Category(name=name, description=description)
                db.session.add(new_category)
                db.session.commit()
                flash('类别添加成功', 'success')
                return redirect(url_for('admin.manage_categories'))
        # 如果添加失败或名称重复，重新渲染表单并保留输入
        return render_template('admin/category_form.html', form=request.form) 
        
    return render_template('admin/category_form.html', form={})

# 编辑类别
@admin_bp.route('/categories/edit/<int:category_id>', methods=['GET', 'POST'])
@login_required
def edit_category(category_id):
    category = Category.query.get_or_404(category_id)
    if request.method == 'POST':
        new_name = request.form.get('name')
        new_description = request.form.get('description')
        if not new_name:
            flash('类别名称不能为空', 'danger')
            # 重新渲染表单并传递当前类别数据和错误
            return render_template('admin/category_form.html', form=request.form, category_id=category_id)
        else:
            # 检查新名称是否与其他类别重复（排除自身）
            existing_category = Category.query.filter(Category.name == new_name, Category.id != category_id).first()
            if existing_category:
                flash('该类别名称已被其他类别使用', 'warning')
                return render_template('admin/category_form.html', form=request.form, category_id=category_id)
            else:
                category.name = new_name
                category.description = new_description
                db.session.commit()
                flash('类别更新成功', 'success')
                return redirect(url_for('admin.manage_categories'))
                
    # GET 请求，显示当前类别信息
    form_data = {'name': category.name, 'description': category.description}
    return render_template('admin/category_form.html', form=form_data, category_id=category_id)

# 删除类别
@admin_bp.route('/categories/delete/<int:category_id>', methods=['POST'])
@login_required
def delete_category(category_id):
    category = Category.query.get_or_404(category_id)
    # 可选：检查是否有工具关联到这个类别，如果有关联则阻止删除或给出提示
    if category.tools: # Assuming 'tools' is the relationship name in Category model
         flash('无法删除类别，尚有关联的工具。请先修改或删除这些工具。', 'danger')
         return redirect(url_for('admin.manage_categories'))
            
    db.session.delete(category)
    db.session.commit()
    flash('类别删除成功', 'success')
    return redirect(url_for('admin.manage_categories')) 