from app import create_app
from app.models import Article, Post, Comment, PostComment
from app import db
from sqlalchemy import func

app = create_app()

with app.app_context():
    # 使用聚合函数判断是否有评论
    articles = db.session.query(
        Article.id, 
        Article.title, 
        func.count(Comment.id).label('comment_count')
    ).outerjoin(
        Comment, Comment.article_id == Article.id
    ).group_by(Article.id).limit(10).all()
    
    if articles:
        print("有效的文章及其评论情况:")
        for article in articles:
            has_comments = "有评论" if article.comment_count > 0 else "无评论"
            print(f"文章ID: {article.id}, 标题: {article.title[:30]}..., {has_comments} ({article.comment_count}条)")
    else:
        print("没有找到文章")

    posts = db.session.query(
        Post.id, 
        Post.title, 
        func.count(PostComment.id).label('comment_count')
    ).outerjoin(
        PostComment, PostComment.post_id == Post.id
    ).group_by(Post.id).limit(10).all()
    
    if posts:
        print("\n有效的帖子及其评论情况:")
        for post in posts:
            has_comments = "有评论" if post.comment_count > 0 else "无评论"
            print(f"帖子ID: {post.id}, 标题: {post.title[:30]}..., {has_comments} ({post.comment_count}条)")
    else:
        print("\n没有找到帖子") 