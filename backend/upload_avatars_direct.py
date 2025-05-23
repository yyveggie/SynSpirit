#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
系统头像上传工具 - 直接版
不使用app上下文，直接使用COS配置
"""
import os
import io
import uuid
import requests
import logging
from qcloud_cos import CosConfig
from qcloud_cos import CosS3Client
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

# 加载环境变量
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 系统头像配置
AVATARS = {
    "lynn_avatar.png": "https://avatars.githubusercontent.com/u/1382577?s=200&v=4",
    "default_avatar.png": "https://www.gravatar.com/avatar/?d=mp&s=400"
}

def upload_avatar(avatar_name, avatar_url):
    """上传单个头像"""
    logger.info(f"处理头像: {avatar_name}")
    
    # 获取COS配置
    secret_id = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('COS_REGION_NAME', 'ap-shanghai')
    bucket = os.environ.get('COS_BUCKET_NAME')
    public_domain = os.environ.get('COS_PUBLIC_DOMAIN')
    
    if not all([secret_id, secret_key, region, bucket]):
        logger.error("COS配置不完整，无法上传")
        return False
        
    # 创建COS客户端
    config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
    client = CosS3Client(config)
    
    # 下载头像
    try:
        logger.info(f"从 {avatar_url} 下载头像...")
        response = requests.get(avatar_url)
        if response.status_code != 200:
            logger.error(f"下载失败: HTTP {response.status_code}")
            return False
            
        file_content = response.content
        content_type = response.headers.get('content-type', 'image/png')
    except Exception as e:
        logger.error(f"下载头像时出错: {e}")
        return False
        
    # 上传到COS
    try:
        # 生成文件路径
        object_key = f"system/{avatar_name}"
        
        # 上传文件
        client.put_object(
            Bucket=bucket,
            Body=file_content,
            Key=object_key,
            ContentType=content_type
        )
        
        # 生成URL
        if public_domain:
            url = f"{public_domain}/{object_key}"
        else:
            url = f"https://{bucket}.cos.{region}.myqcloud.com/{object_key}"
            
        logger.info(f"✅ 上传成功: {url}")
        return True
    except Exception as e:
        logger.error(f"上传到COS时出错: {e}")
        return False

def main():
    """主函数"""
    logger.info("开始上传系统头像...")
    
    for name, url in AVATARS.items():
        success = upload_avatar(name, url)
        if success:
            logger.info(f"头像 {name} 上传成功")
        else:
            logger.error(f"头像 {name} 上传失败")
    
    logger.info("系统头像上传完成！")

if __name__ == "__main__":
    main() 