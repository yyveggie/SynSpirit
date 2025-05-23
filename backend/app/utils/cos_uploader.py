import os
import boto3
from botocore.exceptions import NoCredentialsError, ClientError
from botocore.client import Config
from flask import current_app
import uuid
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_to_cos(file_storage, object_prefix=''):
    """
    Uploads a file to Tencent Cloud COS.

    Args:
        file_storage (FileStorage): The file object from request.files.
        object_prefix (str): Optional prefix for the object key (e.g., 'avatars/').

    Returns:
        str: The public URL of the uploaded file, or None if upload failed.
    """
    if not file_storage or file_storage.filename == '' or not allowed_file(file_storage.filename):
        current_app.logger.error("上传文件无效或类型不允许")
        return None

    # Get COS config from Flask app config (loaded from config.py -> .env)
    access_key_id = current_app.config.get('AWS_ACCESS_KEY_ID')
    secret_access_key = current_app.config.get('AWS_SECRET_ACCESS_KEY')
    bucket_name = current_app.config.get('COS_BUCKET_NAME')
    endpoint_url = current_app.config.get('COS_ENDPOINT_URL')
    region_name = current_app.config.get('COS_REGION_NAME')
    public_domain = current_app.config.get('COS_PUBLIC_DOMAIN')

    if not all([access_key_id, secret_access_key, bucket_name, endpoint_url, region_name, public_domain]):
        current_app.logger.error("COS配置不完整，无法上传")
        return None

    s3_client = boto3.client(
        's3',
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        endpoint_url=endpoint_url,
        region_name=region_name,
        config=Config(s3={'addressing_style': 'virtual'})
    )

    # Generate a unique filename
    filename = secure_filename(file_storage.filename)
    file_ext = filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    object_key = f"{object_prefix}{unique_filename}" # e.g., 'avatars/uuid.jpg'

    try:
        s3_client.upload_fileobj(
            file_storage,  # The file object itself
            bucket_name,
            object_key,
            ExtraArgs={
                'ContentType': file_storage.content_type,
                'ACL': 'public-read' # 设置为公共读
            }
        )
        # Construct the public URL
        file_url = f"{public_domain}/{object_key}"
        current_app.logger.info(f"文件成功上传到COS: {file_url}")
        return file_url
    except NoCredentialsError:
        current_app.logger.error("COS凭证未找到")
        return None
    except ClientError as e:
        current_app.logger.error(f"COS上传失败: {e}")
        return None
    except Exception as e:
        current_app.logger.error(f"COS上传时发生未知错误: {e}")
        return None 