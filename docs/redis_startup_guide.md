# Redis快速启动指南

本指南提供在本地快速启动Redis服务并验证缓存系统的步骤。

## 1. 安装Redis

### macOS

使用Homebrew安装Redis：

```bash
# 安装Redis
brew install redis

# 启动Redis服务
brew services start redis
```

### Linux (Ubuntu/Debian)

```bash
# 安装Redis
sudo apt update
sudo apt install redis-server

# 启动Redis服务
sudo systemctl start redis-server
```

### Windows

1. 下载Windows版Redis: https://github.com/microsoftarchive/redis/releases
2. 解压后运行`redis-server.exe`

## 2. 验证Redis启动状态

验证Redis是否正常运行：

```bash
redis-cli ping
# 应返回 PONG
```

## 3. 为项目配置Redis

1. 创建`.env`文件（如果不存在）：

```bash
cd /path/to/SynSpirit
touch backend/.env
```

2. 在`.env`文件中添加Redis配置：

```
# Redis配置
REDIS_URL=redis://localhost:6379/0
```

3. 确保正确加载`.env`文件：

```python
# 检查backend/app/config.py中是否有
from dotenv import load_dotenv
load_dotenv()
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
```

## 4. 启动并测试应用

```bash
# 启动后端服务
cd backend
python run.py
```

观察启动日志，确认Redis连接成功。应该看到类似信息：

```
缓存系统已初始化，类型: RedisCache, URL: redis://localhost:6379/0
Redis缓存连接测试成功
```

## 5. 验证缓存是否正常工作

1. 在浏览器中正常访问网站
2. 加载几张图片
3. 检查Redis中是否有缓存键：

```bash
redis-cli keys "synspirit:img:*"
```

如果看到列出的键，表示缓存系统工作正常。

## 6. 监控缓存

监视缓存使用情况：

```bash
# 查看Redis信息
redis-cli info

# 查看内存使用
redis-cli info memory

# 监视命令执行（慎用，数据量可能很大）
redis-cli monitor
```

## 7. 访问缓存统计API

项目内置了缓存统计API，在登录后可访问：

```
GET /api/cache-stats
```

## 8. 常见错误

1. **"连接被拒绝"错误**：检查Redis是否正在运行
2. **无缓存键**：可能是图片URL不符合缓存条件或请求参数含`no_cache=1`
3. **权限错误**：确保应用有权限访问Redis端口

## 9. 清理缓存

如需清理所有缓存：

```bash
# 清除特定前缀的键
redis-cli --scan --pattern "synspirit:img:*" | xargs redis-cli del

# 清空整个数据库（谨慎使用）
redis-cli flushdb
```

## 10. 停止Redis

```bash
# macOS
brew services stop redis

# Linux
sudo systemctl stop redis-server

# Windows
结束redis-server.exe进程
``` 