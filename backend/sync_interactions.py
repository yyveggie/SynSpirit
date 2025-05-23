"""
数据库交互同步脚本
用于创建数据库触发器，实现user_actions表与article_interactions/post_interactions表的数据同步
"""
import os
import sys
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv
from flask import current_app
from app import create_app
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def connect_db():
    """连接到PostgreSQL数据库"""
    try:
        # 获取数据库连接参数
        app = create_app()
        with app.app_context():
            db_uri = app.config['SQLALCHEMY_DATABASE_URI']
            
            # 解析URI以获取连接参数
            # 格式: postgresql://username:password@host:port/database
            parts = db_uri.split('://', 1)[1]
            auth, rest = parts.split('@', 1)
            host_port, database = rest.split('/', 1)
            username, password = auth.split(':', 1)
            
            if ':' in host_port:
                host, port = host_port.split(':', 1)
            else:
                host = host_port
                port = '5432'  # 默认PostgreSQL端口

            # 创建数据库连接
            conn = psycopg2.connect(
                dbname=database,
                user=username,
                password=password,
                host=host,
                port=port
            )
            
            logger.info(f"已成功连接到数据库: {database}@{host}:{port}")
            return conn
    except Exception as e:
        logger.error(f"数据库连接失败: {e}")
        sys.exit(1)

def execute_sql_file(conn, file_path):
    """执行SQL文件"""
    try:
        with open(file_path, 'r') as f:
            sql_content = f.read()
            
        cursor = conn.cursor()
        cursor.execute(sql_content)
        conn.commit()
        cursor.close()
        logger.info(f"已成功执行SQL文件: {file_path}")
    except Exception as e:
        logger.error(f"执行SQL文件失败: {e}")
        conn.rollback()
        sys.exit(1)

def main():
    """主函数"""
    try:
        logger.info("开始执行交互同步脚本...")
        
        # 连接到数据库
        conn = connect_db()
        
        # 获取SQL文件路径
        current_dir = os.path.dirname(os.path.abspath(__file__))
        sql_file = os.path.join(current_dir, 'migrations', 'sync_interactions.sql')
        
        # 检查文件是否存在
        if not os.path.exists(sql_file):
            logger.error(f"SQL文件不存在: {sql_file}")
            sys.exit(1)
            
        # 执行SQL文件
        execute_sql_file(conn, sql_file)
        
        # 关闭连接
        conn.close()
        logger.info("交互同步脚本执行完成!")
        
    except Exception as e:
        logger.error(f"脚本执行失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 