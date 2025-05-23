# Redis缓存故障排查指南

本文档提供关于Redis缓存系统的常见问题和解决方案。

## 1. 确认Redis服务器是否正常运行

### macOS

```bash
# 检查Redis状态
brew services list | grep redis

# 如果未运行，启动Redis
brew services start redis

# 手动启动Redis（另一种方式）
redis-server /usr/local/etc/redis.conf
```

### Linux

```bash
# 检查Redis状态
systemctl status redis-server

# 如果未运行，启动Redis
sudo systemctl start redis-server
```

### 验证连接

```bash
# 测试连接
redis-cli ping
# 应返回 "PONG"

# 检查当前键
redis-cli keys "synspirit:*"
```

## 2. 确认Redis配置正确

### 检查配置文件

- 确保`.env`文件中包含正确的Redis URL：
  ```
  REDIS_URL=redis://localhost:6379/0
  ```

### 确认配置已加载

- 检查应用日志中的Redis初始化信息
- 查看Redis连接是否成功

## 3. 常见问题与解决方案

### Redis连接被拒绝

**症状**：日志中显示"Connection refused"错误。

**解决方案**：
- 确认Redis服务运行中
- 验证端口是否正确(默认6379)
- 检查防火墙设置

### 缓存键不存在

**症状**：`keys synspirit:img:*`命令返回空结果。

**可能原因**：
1. 缓存前缀不匹配
2. URL验证失败，未存入缓存
3. `no_cache=1`参数阻止缓存
4. Redis连接异常导致无法写入

**解决方案**：
- 在前端控制台日志中检查代理URL生成
- 在后端日志中检查图片代理处理
- 临时增加日志级别获取更多信息

### 修复步骤

1. **确认Redis服务启动**
   ```bash
   redis-cli ping
   ```

2. **验证Redis连接配置**
   ```python
   import redis
   r = redis.Redis()
   r.ping()  # 应返回True
   ```

3. **手动测试缓存操作**
   ```python
   import redis
   r = redis.Redis()
   key = 'synspirit:img:test'
   r.set(key, 'test_data')
   assert r.get(key) == b'test_data'
   ```

4. **检查URL编码**
   - 确保URL正确编码，特别是包含特殊字符的URL
   - 前端使用`encodeURIComponent(url)`编码URL参数

5. **检查浏览器网络请求**
   - 审查前端请求URL格式
   - 验证后端响应状态码

## 4. 验证解决方案

在问题解决后，可以通过以下方式验证：

```bash
# 检查Redis中的图片缓存键
redis-cli keys "synspirit:img:*"

# 查看键数量
redis-cli dbsize

# 检查键内容(注意二进制数据可能无法正确显示)
redis-cli --raw get "synspirit:img:键哈希值"

# 检查键的过期时间(TTL，单位秒)
redis-cli ttl "synspirit:img:键哈希值"
```

## 5. 最佳实践

- 在开发环境增加日志级别以获取更多诊断信息
- 使用Redis监控工具(如RedisInsight)可视化缓存状态
- 定期检查缓存命中率和系统性能
- 按照缓存更新策略设置合理的TTL
- 确保Redis内存配置足够处理预期的缓存量 