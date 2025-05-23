import os
import time
import uuid
from flask import current_app
from qcloud_cos import CosConfig
from qcloud_cos import CosS3Client
from qcloud_cos.cos_exception import CosServiceError, CosClientError
import logging

class COSStorage:
    """腾讯云对象存储工具类"""
    
    def __init__(self):
        self.config = None
        self.client = None
        self.initialized = False
        # 在初始化时不调用init_client，而是延迟到第一次使用时
    
    def ensure_initialized(self):
        """确保客户端已初始化"""
        if not self.initialized:
            self.init_client()
        return self.initialized
        
    def init_client(self):
        """初始化COS客户端"""
        try:
            # 获取配置信息
            secret_id = os.environ.get('AWS_ACCESS_KEY_ID')
            secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
            region = os.environ.get('COS_REGION_NAME', 'ap-shanghai')
            scheme = 'https'
            
            # 创建配置对象
            self.config = CosConfig(
                Region=region,
                SecretId=secret_id,
                SecretKey=secret_key,
                Scheme=scheme
            )
            
            # 创建客户端
            self.client = CosS3Client(self.config)
            self.initialized = True
            
            # 使用普通logging而不是current_app.logger，因为可能在应用上下文外调用
            logging.info("腾讯云COS客户端初始化成功")
        except Exception as e:
            logging.error(f"腾讯云COS客户端初始化失败: {str(e)}")
            self.initialized = False
    
    def upload_file(self, file_object, subfolder='covers'):
        """
        上传文件到腾讯云COS
        
        Args:
            file_object: 文件对象(如Flask的request.files中的文件)
            subfolder: 子文件夹名，用于分类存储(如'covers'、'editor'等)
            
        Returns:
            str: 上传成功返回文件的COS URL，失败返回None
        """
        if not self.ensure_initialized():
            try:
                current_app.logger.error("COS客户端未初始化，无法上传文件")
            except RuntimeError:
                logging.error("COS客户端未初始化，无法上传文件")
            return None
            
        try:
            bucket = os.environ.get('COS_BUCKET_NAME')
            if not bucket:
                try:
                    current_app.logger.error("未设置COS_BUCKET_NAME环境变量")
                except RuntimeError:
                    logging.error("未设置COS_BUCKET_NAME环境变量")
                return None
                
            # 生成唯一文件名，避免重名
            original_filename = file_object.filename
            ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
            unique_filename = f"{subfolder}/{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}.{ext}"
            
            # 上传文件
            self.client.upload_file_from_buffer(
                Bucket=bucket,
                Body=file_object,
                Key=unique_filename,
                ContentType=file_object.content_type if hasattr(file_object, 'content_type') else 'application/octet-stream'
            )
            
            # 返回文件URL
            domain = os.environ.get('COS_PUBLIC_DOMAIN')
            if domain:
                return f"{domain}/{unique_filename}"
            else:
                region = os.environ.get('COS_REGION_NAME', 'ap-shanghai')
                return f"https://{bucket}.cos.{region}.myqcloud.com/{unique_filename}"
                
        except CosServiceError as e:
            try:
                current_app.logger.error(f"腾讯云COS服务错误: {str(e)}")
            except RuntimeError:
                logging.error(f"腾讯云COS服务错误: {str(e)}")
            return None
        except CosClientError as e:
            try:
                current_app.logger.error(f"腾讯云COS客户端错误: {str(e)}")
            except RuntimeError:
                logging.error(f"腾讯云COS客户端错误: {str(e)}")
            return None
        except Exception as e:
            try:
                current_app.logger.error(f"上传文件到腾讯云COS时发生错误: {str(e)}")
            except RuntimeError:
                logging.error(f"上传文件到腾讯云COS时发生错误: {str(e)}")
            return None
            
    def delete_file(self, file_url):
        """
        从COS删除文件
        
        Args:
            file_url: 文件的完整URL或相对路径
            
        Returns:
            bool: 删除成功返回True，失败返回False
        """
        if not self.ensure_initialized():
            try:
                current_app.logger.error("COS客户端未初始化，无法删除文件")
            except RuntimeError:
                logging.error("COS客户端未初始化，无法删除文件")
            return False
            
        try:
            bucket = os.environ.get('COS_BUCKET_NAME')
            if not bucket:
                try:
                    current_app.logger.error("未设置COS_BUCKET_NAME环境变量")
                except RuntimeError:
                    logging.error("未设置COS_BUCKET_NAME环境变量")
                return False
                
            # 从URL中提取对象键
            domain = os.environ.get('COS_PUBLIC_DOMAIN', '')
            if domain and file_url.startswith(domain):
                key = file_url.replace(f"{domain}/", "")
            elif file_url.startswith('http'):
                # 解析常规URL
                from urllib.parse import urlparse
                parsed = urlparse(file_url)
                key = parsed.path.lstrip('/')
            else:
                # 假设是相对路径
                key = file_url
                
            # 删除文件
            self.client.delete_object(
                Bucket=bucket,
                Key=key
            )
            
            return True
                
        except CosServiceError as e:
            try:
                current_app.logger.error(f"腾讯云COS服务错误: {str(e)}")
            except RuntimeError:
                logging.error(f"腾讯云COS服务错误: {str(e)}")
            return False
        except CosClientError as e:
            try:
                current_app.logger.error(f"腾讯云COS客户端错误: {str(e)}")
            except RuntimeError:
                logging.error(f"腾讯云COS客户端错误: {str(e)}")
            return False
        except Exception as e:
            try:
                current_app.logger.error(f"从腾讯云COS删除文件时发生错误: {str(e)}")
            except RuntimeError:
                logging.error(f"从腾讯云COS删除文件时发生错误: {str(e)}")
            return False

# 创建单例实例
cos_storage = COSStorage() 