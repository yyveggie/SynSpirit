import os
import sys

# 确保脚本可以找到 app 模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User
from app.utils.cos_storage import cos_storage # 导入cos_storage实例
from werkzeug.datastructures import FileStorage # 用于模拟文件对象

def run_set_ai_avatar():
    app = create_app()
    with app.app_context():
        print("Flask 应用上下文已加载。")

        # 1. 定义 AI 头像的本地路径 (相对于 backend 目录)
        #    用户提供的路径: /Users/mushroom/Library/CloudStorage/OneDrive-共享的库-onedrive/Project/SynSpirit/frontend/src/assets/images/ai.jpg
        #    脚本在 backend 目录运行，所以相对路径是 ../frontend/src/assets/images/ai.jpg
        local_image_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'assets', 'images', 'ai.jpg')
        
        if not os.path.exists(local_image_path):
            print(f"错误：AI 头像文件未找到于: {local_image_path}")
            return

        print(f"准备上传 AI 头像: {local_image_path}")

        try:
            # 2. 上传图片到 COS
            # cos_storage.upload_file 需要一个类似 Flask request.files['image'] 的对象
            # 我们需要构造一个 FileStorage 对象
            with open(local_image_path, 'rb') as f:
                # 从文件名获取 content_type，或者硬编码
                content_type = 'image/jpeg' # ai.jpg
                if local_image_path.endswith('.png'):
                    content_type = 'image/png'
                elif local_image_path.endswith('.svg'):
                    content_type = 'image/svg+xml'
                
                file_object = FileStorage(
                    stream=f,
                    filename=os.path.basename(local_image_path),
                    content_type=content_type
                )
                
                # 为 AI 头像指定一个子文件夹，例如 'avatars' 或 'system_avatars'
                # 使用 'avatars' 与普通用户头像保持一致
                print("正在上传到 COS...")
                cos_url = cos_storage.upload_file(file_object, subfolder='avatars')

            if not cos_url:
                print("错误：上传 AI 头像到 COS 失败。请检查日志和 COS 配置。")
                return

            print(f"AI 头像成功上传到 COS: {cos_url}")

            # 3. 更新数据库中 AI 用户的头像
            ai_user_id = -1
            ai_user = User.query.get(ai_user_id)

            if not ai_user:
                print(f"错误：未找到 ID 为 {ai_user_id} 的 AI 用户。")
                # 你可能需要先创建这个用户，如果他不存在
                # print("创建一个新的AI用户...")
                # ai_user = User(id=ai_user_id, email='ai@example.com', nickname='Lynn AI')
                # ai_user.set_password('a_very_strong_password_for_ai') # 设置一个密码
                # db.session.add(ai_user)
                # # 需要先提交以获取ID，或者确保ID可以手动设置
                # try:
                #     db.session.commit() # 如果ID是自增的，这里会失败
                #     print(f"AI用户 {ai_user_id} 已创建。")
                #     ai_user = User.query.get(ai_user_id) # 重新获取
                # except Exception as e_create:
                #     db.session.rollback()
                #     print(f"创建AI用户失败: {e_create}")
                #     print("请确保 User 表允许 id = -1，或先手动创建该用户。")
                #     return
                # 如果用户不存在，这里直接返回。你需要确保用户存在。
                return


            print(f"正在更新用户 ID {ai_user_id} ({ai_user.nickname}) 的头像...")
            ai_user.avatar = cos_url
            db.session.commit()
            print(f"AI 用户 (ID: {ai_user_id}) 的头像已成功更新为: {cos_url}")

        except Exception as e:
            db.session.rollback()
            print(f"处理 AI 头像时发生错误: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    # 确保环境变量已加载 (如果使用 .env 文件并且脚本独立运行)
    from dotenv import load_dotenv
    # 假设 .env 文件在 backend 目录的父目录 (项目根目录)
    dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
        print(f"从 {dotenv_path} 加载环境变量。")
    else:
        # 如果 backend 目录下也有 .env
        dotenv_path_alt = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
        if os.path.exists(dotenv_path_alt):
            load_dotenv(dotenv_path_alt)
            print(f"从 {dotenv_path_alt} 加载环境变量。")
        else:
            print("警告：未找到 .env 文件。请确保 COS 环境变量已设置。")

    run_set_ai_avatar()