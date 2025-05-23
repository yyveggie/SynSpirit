import os
import numpy as np
from sqlalchemy import text
from app import db
from app.models import Tool, Article
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 设置OpenAI API密钥

class VectorStore:
    """向量存储服务，提供嵌入和相似性搜索功能"""

    @staticmethod
    def generate_embedding(text):
        """生成文本嵌入向量"""
        try:
            if not text:
                return None

            response = client.embeddings.create(model="text-embedding-ada-002",
            input=text)
            embedding = response.data[0].embedding
            return embedding
        except Exception as e:
            print(f"生成嵌入向量失败: {str(e)}")
            return None

    @staticmethod
    def update_tool_embedding(tool_id):
        """更新工具的嵌入向量"""
        tool = Tool.query.get(tool_id)
        if not tool:
            return False

        # 组合工具信息用于嵌入
        text_for_embedding = f"{tool.name} {tool.description or ''} {tool.content or ''}"
        if tool.tags:
            text_for_embedding += f" {' '.join(tool.tags)}"

        embedding = VectorStore.generate_embedding(text_for_embedding)
        if embedding:
            tool.vector_embedding = embedding
            db.session.commit()
            return True
        return False

    @staticmethod
    def update_article_embedding(article_id):
        """更新文章的嵌入向量"""
        article = Article.query.get(article_id)
        if not article:
            return False

        # 组合文章信息用于嵌入
        text_for_embedding = f"{article.title} {article.summary or ''} {article.content[:1000] or ''}"
        if article.tags:
            text_for_embedding += f" {' '.join(article.tags)}"

        embedding = VectorStore.generate_embedding(text_for_embedding)
        if embedding:
            article.vector_embedding = embedding
            db.session.commit()
            return True
        return False

    @staticmethod
    def search_similar_tools(query_text, limit=5):
        """搜索与查询文本相似的工具"""
        query_embedding = VectorStore.generate_embedding(query_text)
        if not query_embedding:
            return []

        # 使用向量相似性搜索
        sql = text(
            """
            SELECT id, name, description, category_id,
                   source_url, tags, 1 - (vector_embedding <=> :embedding) AS similarity
            FROM tools
            WHERE vector_embedding IS NOT NULL
            ORDER BY similarity DESC
            LIMIT :limit
            """
        )

        result = db.session.execute(
            sql, 
            {"embedding": query_embedding, "limit": limit}
        )

        tools = []
        for row in result:
            tool = {
                'id': row.id,
                'name': row.name,
                'description': row.description,
                'category_id': row.category_id,
                'source_url': row.source_url,
                'tags': row.tags,
                'similarity': float(row.similarity)
            }
            tools.append(tool)

        return tools

    @staticmethod
    def search_tools_by_category(query_text, category_id, limit=5):
        """搜索特定类别中与查询文本相似的工具"""
        query_embedding = VectorStore.generate_embedding(query_text)
        if not query_embedding:
            return []

        # 使用向量相似性搜索并筛选类别
        sql = text(
            """
            SELECT id, name, description, category_id,
                   source_url, tags, 1 - (vector_embedding <=> :embedding) AS similarity
            FROM tools
            WHERE vector_embedding IS NOT NULL AND category_id = :category_id
            ORDER BY similarity DESC
            LIMIT :limit
            """
        )

        result = db.session.execute(
            sql, 
            {"embedding": query_embedding, "category_id": category_id, "limit": limit}
        )

        tools = []
        for row in result:
            tool = {
                'id': row.id,
                'name': row.name,
                'description': row.description,
                'category_id': row.category_id,
                'source_url': row.source_url,
                'tags': row.tags,
                'similarity': float(row.similarity)
            }
            tools.append(tool)

        return tools 