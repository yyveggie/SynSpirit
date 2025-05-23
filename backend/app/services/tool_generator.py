import os
import json
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 加载环境变量
load_dotenv()

# 设置OpenAI API密钥

class OpenAIClient:
    """OpenAI API客户端"""

    def __init__(self, api_key=None):
        """
        初始化OpenAI客户端
        
        参数:
        api_key (str): OpenAI API密钥，如果为None则从环境变量获取
        """
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OpenAI API密钥未提供")

        self.api_url = "https://api.openai.com/v1/chat/completions"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

    def generate_completion(self, prompt, model="gpt-3.5-turbo"):
        """
        生成文本补全
        
        参数:
        prompt (str): 提示文本
        model (str): 使用的模型名称
        
        返回:
        dict: API响应
        """
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
            "max_tokens": 1000
        }

        try:
            response = requests.post(
                self.api_url,
                headers=self.headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"OpenAI API调用失败: {str(e)}")
            raise

def fetch_website_content(url):
    """获取网站内容"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        # 解析HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # 提取主要内容
        main_content = ""

        # 获取标题
        title = soup.title.string if soup.title else ""
        main_content += f"标题: {title}\n\n"

        # 获取元描述
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and 'content' in meta_desc.attrs:
            main_content += f"描述: {meta_desc['content']}\n\n"

        # 获取主要文本内容
        for tag in ['h1', 'h2', 'h3', 'p', 'li']:
            elements = soup.find_all(tag)
            for element in elements:
                text = element.get_text(strip=True)
                if text and len(text) > 10:  # 忽略太短的内容
                    main_content += f"{text}\n"

        return main_content
    except Exception as e:
        raise Exception(f"获取网站内容失败: {str(e)}")

def generate_tool_description(url):
    """生成工具描述"""
    try:
        # 获取网站内容
        website_content = fetch_website_content(url)

        # 使用OpenAI生成工具描述
        prompt = f"""
        你是一个AI工具分析专家。请根据以下网站内容，生成一个全面的AI工具介绍。
        
        网站内容:
        {website_content[:3000]}  # 限制内容长度
        
        请生成以下格式的JSON响应:
        1. name: 工具名称
        2. description: 简短描述(一句话)
        3. content: 详细介绍(300-500字)，包括功能特点、适用场景、优缺点等
        4. category_suggestion: 建议的分类(提示工程策略/教育工具/创意与设计/文本与内容/图像生成/视频处理/音频处理/编程助手/数据分析/生产力工具/研究助手/新兴AI趋势)
        5. tags: 相关标签列表(3-5个)
        
        仅返回JSON格式，不要有任何其他文字。
        """

        response = client.chat.completions.create(model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "你是AI工具分析专家，负责提供准确、全面的工具介绍。"},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7,
        max_tokens=1000)

        # 提取并解析生成的内容
        generated_content = response.choices[0].message.content.strip()

        try:
            # 尝试解析JSON
            json_content = json.loads(generated_content)

            # 确保所有必要的字段都存在
            required_fields = ["name", "description", "content", "category_suggestion", "tags"]
            for field in required_fields:
                if field not in json_content:
                    json_content[field] = ""

            return json_content
        except json.JSONDecodeError:
            # 如果无法解析JSON，尝试手动提取内容
            return {
                "name": extract_field(generated_content, "name", "未知工具"),
                "description": extract_field(generated_content, "description", "无描述"),
                "content": extract_field(generated_content, "content", "无详细介绍"),
                "category_suggestion": extract_field(generated_content, "category_suggestion", "未分类"),
                "tags": extract_field(generated_content, "tags", [])
            }

    except Exception as e:
        raise Exception(f"生成工具描述失败: {str(e)}")

def extract_field(text, field_name, default_value):
    """从文本中提取字段值"""
    start_marker = f'"{field_name}":'
    if start_marker in text:
        start_idx = text.index(start_marker) + len(start_marker)
        text_from_field = text[start_idx:].strip()

        if text_from_field.startswith('"'):
            # 字符串类型
            end_idx = text_from_field.find('",', 1)
            if end_idx == -1:
                end_idx = text_from_field.find('"}', 1)

            if end_idx != -1:
                return text_from_field[1:end_idx]
        elif text_from_field.startswith('['):
            # 数组类型
            end_idx = text_from_field.find(']')
            if end_idx != -1:
                array_str = text_from_field[:end_idx+1]
                try:
                    return json.loads(array_str)
                except:
                    pass

    return default_value

def generate_tool_introduction(source_url, api_key=None):
    """
    根据源链接生成工具介绍
    
    参数:
    source_url (str): 工具的源链接
    api_key (str): OpenAI API密钥，如果为None则从环境变量获取
    
    返回:
    dict: 包含生成的工具介绍信息
    """
    try:
        # 获取网页内容
        response = requests.get(source_url, timeout=10)
        response.raise_for_status()

        # 解析网页内容
        soup = BeautifulSoup(response.text, 'html.parser')

        # 提取标题
        title = soup.title.string if soup.title else ""

        # 提取描述
        description = ""
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            description = meta_desc.get('content', '')

        # 提取正文内容（简化处理）
        content = ""
        main_content = soup.find('main')
        if main_content:
            content = main_content.get_text(strip=True)
        else:
            # 尝试获取body内容
            body = soup.find('body')
            if body:
                # 获取前2000个字符作为内容样本
                content = body.get_text(strip=True)[:2000]

        # 准备发送给OpenAI的提示
        prompt = f"""
        根据以下网页内容，生成一个AI工具的介绍:
        
        标题: {title}
        描述: {description}
        内容摘要: {content[:500]}...
        
        请生成以下格式的JSON响应:
        1. name: 工具名称
        2. description: 简短描述（100字以内）
        3. features: 主要功能列表（3-5条）
        4. use_cases: 使用场景列表（3-5条）
        5. pros: 优点列表（3-5条）
        6. cons: 缺点列表（2-3条）
        7. category_suggestion: 建议的分类（从以下选择一个最合适的：提示工程策略、教育工具、创意与设计、内容创作、开发助手、数据分析、生产力工具、多模态AI、AI助手与聊天机器人、本地部署模型、AI趋势与新闻、学习资源）
        8. tags: 相关标签列表（3-5个）
        
        仅返回JSON格式，不要有其他文本。
        """

        try:
            # 调用OpenAI API
            client = OpenAIClient(api_key)
            response = client.generate_completion(prompt)

            # 解析响应
            content = response.choices[0].message.content

            # 尝试解析JSON
            try:
                result = json.loads(content)
                return result
            except json.JSONDecodeError:
                # 如果不是有效的JSON，尝试提取JSON部分
                import re
                json_match = re.search(r'({.*})', content, re.DOTALL)
                if json_match:
                    try:
                        result = json.loads(json_match.group(1))
                        return result
                    except:
                        pass

                # 如果仍然失败，返回基本结构
                return {
                    "name": title[:50] if title else "未知工具",
                    "description": description[:100] if description else "这是一个AI工具。",
                    "features": ["无法解析特性"],
                    "use_cases": ["无法解析用例"],
                    "pros": ["无法解析优点"],
                    "cons": ["无法解析缺点"],
                    "category_suggestion": "未分类",
                    "tags": ["AI", "工具"]
                }

        except Exception as api_error:
            print(f"OpenAI API错误: {str(api_error)}")
            # 如果API调用失败，返回基于网页内容的基本信息
            return {
                "name": title[:50] if title else "未知工具",
                "description": description[:100] if description else "这是一个AI工具，可以帮助用户提高工作效率。",
                "features": ["自动提取的特性1", "自动提取的特性2", "自动提取的特性3"],
                "use_cases": ["自动提取的用例1", "自动提取的用例2", "自动提取的用例3"],
                "pros": ["自动提取的优点1", "自动提取的优点2", "自动提取的优点3"],
                "cons": ["自动提取的缺点1", "自动提取的缺点2"],
                "category_suggestion": "未分类",
                "tags": ["AI", "工具", "自动提取"]
            }

    except Exception as e:
        # 记录错误并返回基本信息
        print(f"Error generating tool introduction: {str(e)}")
        return {
            "name": source_url.split('/')[-1] if '/' in source_url else source_url,
            "description": "无法获取工具描述，请手动添加。",
            "features": [],
            "use_cases": [],
            "pros": [],
            "cons": [],
            "category_suggestion": "未分类",
            "tags": []
        }
