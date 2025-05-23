import os
import json
import numpy as np
from app.models.models import Tool, Category
from app.services.tool_generator import OpenAIClient
from app import db

class RAGService:
    """基于检索增强生成的聊天服务"""
    
    def __init__(self, api_key=None):
        """
        初始化RAG服务
        
        参数:
        api_key (str): OpenAI API密钥，如果为None则从环境变量获取
        """
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OpenAI API密钥未提供")
        
        self.openai_client = OpenAIClient(self.api_key)
        self.vector_cache = {}  # 简单的向量缓存
    
    def _get_embedding(self, text):
        """
        获取文本的向量嵌入
        
        参数:
        text (str): 输入文本
        
        返回:
        list: 向量嵌入
        """
        # 检查缓存
        if text in self.vector_cache:
            return self.vector_cache[text]
        
        # 调用OpenAI API获取嵌入
        try:
            payload = {
                "model": "text-embedding-ada-002",
                "input": text
            }
            
            response = self.openai_client.generate_completion(
                prompt="",
                model="text-embedding-ada-002",
                messages=[{"role": "user", "content": text}]
            )
            
            # 模拟嵌入结果（实际应从API响应中提取）
            # 在实际实现中，应该从response中提取embedding
            embedding = np.random.rand(1536).tolist()  # 模拟1536维的嵌入向量
            
            # 缓存结果
            self.vector_cache[text] = embedding
            
            return embedding
        except Exception as e:
            print(f"获取嵌入失败: {str(e)}")
            # 返回随机向量作为后备
            return np.random.rand(1536).tolist()
    
    def _compute_similarity(self, vec1, vec2):
        """
        计算两个向量的余弦相似度
        
        参数:
        vec1 (list): 第一个向量
        vec2 (list): 第二个向量
        
        返回:
        float: 余弦相似度
        """
        vec1 = np.array(vec1)
        vec2 = np.array(vec2)
        
        # 计算余弦相似度
        dot_product = np.dot(vec1, vec2)
        norm_vec1 = np.linalg.norm(vec1)
        norm_vec2 = np.linalg.norm(vec2)
        
        if norm_vec1 == 0 or norm_vec2 == 0:
            return 0
        
        return dot_product / (norm_vec1 * norm_vec2)
    
    def _get_tool_embedding(self, tool):
        """
        获取工具的向量嵌入
        
        参数:
        tool (Tool): 工具对象
        
        返回:
        list: 向量嵌入
        """
        # 如果工具已有向量嵌入，直接返回
        if tool.vector_embedding:
            try:
                return json.loads(tool.vector_embedding)
            except:
                pass
        
        # 构建工具描述文本
        tool_text = f"{tool.name}. {tool.description}"
        
        # 获取嵌入
        embedding = self._get_embedding(tool_text)
        
        # 更新工具的向量嵌入
        tool.vector_embedding = json.dumps(embedding)
        db.session.commit()
        
        return embedding
    
    def recommend_tools(self, query, limit=3):
        """
        根据查询推荐工具
        
        参数:
        query (str): 用户查询
        limit (int): 返回的工具数量
        
        返回:
        list: 推荐的工具列表
        """
        # 获取查询的向量嵌入
        query_embedding = self._get_embedding(query)
        
        # 获取所有工具
        tools = Tool.query.all()
        
        # 计算相似度并排序
        tool_similarities = []
        for tool in tools:
            tool_embedding = self._get_tool_embedding(tool)
            similarity = self._compute_similarity(query_embedding, tool_embedding)
            tool_similarities.append((tool, similarity))
        
        # 按相似度降序排序
        tool_similarities.sort(key=lambda x: x[1], reverse=True)
        
        # 返回前limit个工具
        recommended_tools = []
        for tool, similarity in tool_similarities[:limit]:
            recommended_tools.append({
                'id': tool.id,
                'name': tool.name,
                'description': tool.description,
                'category': tool.category.name if tool.category else None,
                'similarity': float(similarity)
            })
        
        return recommended_tools
    
    def generate_response(self, user_message, chat_history=None):
        """
        生成聊天回复
        
        参数:
        user_message (str): 用户消息
        chat_history (list): 聊天历史
        
        返回:
        tuple: (回复文本, 推荐工具列表)
        """
        if chat_history is None:
            chat_history = []
        
        # 推荐相关工具
        recommended_tools = self.recommend_tools(user_message)
        
        # 构建提示
        tool_descriptions = ""
        for i, tool in enumerate(recommended_tools):
            tool_descriptions += f"{i+1}. {tool['name']}: {tool['description']}\n"
        
        # 构建完整的聊天历史
        messages = []
        for msg in chat_history:
            role = "assistant" if msg.get("is_bot", False) else "user"
            messages.append({"role": role, "content": msg.get("text", "")})
        
        # 添加系统消息
        system_message = f"""你是AI工具集成网站的助手。根据用户的需求，推荐合适的AI工具。
以下是与用户需求最相关的工具：
{tool_descriptions}
在回复中，自然地推荐这些工具，解释它们如何满足用户需求。保持友好和专业的语气。"""
        
        messages.insert(0, {"role": "system", "content": system_message})
        
        # 添加用户的最新消息
        messages.append({"role": "user", "content": user_message})
        
        try:
            # 调用OpenAI API生成回复
            response = self.openai_client.generate_completion(
                prompt="",
                model="gpt-3.5-turbo",
                messages=messages
            )
            
            # 模拟API响应（实际应从API响应中提取）
            # 在实际实现中，应该从response中提取assistant的回复
            assistant_reply = f"根据您的需求，我推荐以下工具：\n\n"
            for i, tool in enumerate(recommended_tools):
                assistant_reply += f"{i+1}. **{tool['name']}** - {tool['description']}\n\n"
            assistant_reply += "这些工具应该能够帮助您解决问题。您需要了解更多关于某个特定工具的信息吗？"
            
            return assistant_reply, recommended_tools
        except Exception as e:
            print(f"生成回复失败: {str(e)}")
            return "抱歉，我无法生成回复。请稍后再试。", []
