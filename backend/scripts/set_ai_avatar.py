import os
import sys
from werkzeug.datastructures import FileStorage

# 将项目根目录添加到 sys.path
# 假设此脚本位于 backend/scripts/set_ai_avatar.py
# 则项目根目录是三级父目录
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# print(f"Project root: {project_root}")
# print(f"Sys.path: {sys.path}")

try:
    from app import create_app, db
    from app.models import User
    from app.utils.cos_storage import cos_storage
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Please ensure this script is run from the 'backend' directory or the project root is correctly in PYTHONPATH.")
    sys.exit(1)

# AI 用户的固定 ID
AI_USER_ID = -1

# AI 头像的本地路径 (相对于项目根目录)
# 请根据实际情况修改此路径
LOCAL_AVATAR_PATH = 'frontend/src/assets/images/ai.jpg'
COS_SUBFOLDER = 'avatars' # 上传到 COS 的子文件夹

def main():
    app = create_app()
    with app.app_context():
        print("Flask app context created.")
        
        # 1. 检查本地头像文件是否存在
        full_avatar_path = os.path.join(project_root, LOCAL_AVATAR_PATH)
        if not os.path.exists(full_avatar_path):
            print(f"Error: AI avatar file not found at {full_avatar_path}")
            return

        print(f"AI avatar file found at: {full_avatar_path}")

        # 2. 模拟 FileStorage 对象并上传到 COS
        try:
            with open(full_avatar_path, 'rb') as f:
                # 为了让 cos_storage.upload_file 正常工作，我们需要提供文件名和 content_type
                # 从文件路径中提取文件名
                filename = os.path.basename(full_avatar_path)
                # 简单地根据扩展名猜测 content_type
                content_type = 'image/jpeg' if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg') else \
                               'image/png' if filename.lower().endswith('.png') else \
                               'image/gif' if filename.lower().endswith('.gif') else \
                               'application/octet-stream'

                # 创建一个类似 Flask FileStorage 的对象
                # cos_storage.upload_file 需要一个有 read() 方法的对象
                # 以及 filename 和 content_type 属性 (尽管它内部似乎会尝试从对象获取)
                
                # cos_storage.upload_file_from_buffer 需要 Body 是字节流, Key, ContentType
                # cos_storage.upload_file 需要 file_object (有 read, filename, content_type)
                
                # 为了匹配 cos_storage.upload_file 的期望，我们创建一个简单的包装器
                class MockFileStorage:
                    def __init__(self, data, filename, content_type):
                        self.stream = data # FileStorage uses 'stream' internally for the data
                        self._filename = filename
                        self._content_type = content_type

                    def read(self, size=-1):
                        return self.stream.read(size)

                    @property
                    def filename(self):
                        return self._filename

                    @property
                    def content_type(self):
                        return self._content_type

                file_data_bytes = f.read()
                # 我们将使用 upload_file_from_buffer，因为它更直接
                # upload_file 的参数是 file_object, subfolder
                # upload_file_from_buffer 的参数是 Bucket, Body, Key, ContentType
                
                # `cos_storage.upload_file` 期望一个类似 Flask request.files 中的文件对象
                # 它会自己处理文件名生成和 Key 的构建
                # 我们需要确保传递给它的对象有 read() 方法和 filename 属性
                
                f.seek(0) # 重置文件指针，因为上面可能读取过
                mock_file = FileStorage(stream=f, filename=filename, content_type=content_type)

                print(f"Uploading '{filename}' to COS subfolder '{COS_SUBFOLDER}'...")
                avatar_cos_url = cos_storage.upload_file(mock_file, subfolder=COS_SUBFOLDER)

            if avatar_cos_url:
                print(f"AI avatar successfully uploaded to COS: {avatar_cos_url}")
            else:
                print("Error: Failed to upload AI avatar to COS. Check COS configuration and logs.")
                return
        except Exception as e:
            print(f"An error occurred during COS upload: {e}")
            import traceback
            traceback.print_exc()
            return

        # 3. 更新数据库中 AI 用户的头像 URL
        ai_user = User.query.get(AI_USER_ID)
        if not ai_user:
            print(f"Error: AI user with ID {AI_USER_ID} not found in the database.")
            # 你可能需要先创建这个用户
            # print("Attempting to create AI user...")
            # ai_user = User(id=AI_USER_ID, username='LynnAI', email='lynn@example.com', role_id=1) # 假设 role_id=1 是AI角色
            # db.session.add(ai_user)
            # db.session.flush() # 获取ID
            # print("AI user created with ID: ", ai_user.id)
            return

        print(f"Found AI user: {ai_user.username if hasattr(ai_user, 'username') else 'N/A'}")
        
        try:
            ai_user.avatar = avatar_cos_url
            db.session.commit()
            print(f"Successfully updated AI user (ID: {AI_USER_ID}) avatar URL to: {avatar_cos_url}")
        except Exception as e:
            db.session.rollback()
            print(f"Error updating AI user avatar in database: {e}")
            import traceback
            traceback.print_exc()
            return
            
        print("AI avatar setup process completed.")

if __name__ == '__main__':
    # 确保环境变量已加载 (如果 .env 文件在项目根目录)
    from dotenv import load_dotenv
    dotenv_path = os.path.join(project_root, '.env')
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
        print(f"Loaded .env file from {dotenv_path}")
    else:
        print(f".env file not found at {dotenv_path}, relying on environment variables set externally.")
    
    main() 