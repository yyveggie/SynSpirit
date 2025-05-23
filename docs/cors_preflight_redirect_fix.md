# Flask 应用中 `/api/articles` CORS 预检请求重定向问题的排查与解决

本文档记录了在开发 SynSpirit 项目时，遇到的前端首页文章列表无法加载（Network Error），以及相关的 CORS 预检请求失败问题的排查过程和最终解决方案。

## 问题现象

前端应用 (运行于 `http://localhost:3000`) 在尝试从后端 API (`http://localhost:5001/api/articles`) 获取文章列表时失败。浏览器开发者工具控制台显示以下 CORS 错误：

```
Access to XMLHttpRequest at 'http://localhost:5001/api/articles?...' from origin 'http://localhost:3000' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: Redirect is not allowed for a preflight request.
```

同时，网络请求标签页显示对 `/api/articles` 的 `OPTIONS` 预检请求收到了 HTTP 308 永久重定向的响应。

## 问题分析

1.  **CORS 预检请求:** 由于前后端分离且端口不同，浏览器在发送实际的 `GET /api/articles` 请求前，会先发送一个 `OPTIONS /api/articles` 预检请求，以确认服务器许可。
2.  **服务器重定向:** 后端服务器（Flask + Gunicorn + GeventWebSocketWorker）在收到 `OPTIONS /api/articles` 请求时，返回了 308 重定向。
3.  **CORS 策略冲突:** CORS 规范禁止对预检请求的响应进行重定向。因此，浏览器阻止了后续的 `GET` 请求。
4.  **重定向原因:** 通过添加调试日志发现，当 `OPTIONS` 请求到达 `/api/articles` (无尾部斜杠) 时，Flask 未能匹配到任何处理 `OPTIONS` 方法的端点 (`Endpoint=None`)。这触发了 Werkzeug/Gunicorn 的 URL 规范化行为，试图将其重定向到带有尾部斜杠的版本 `/api/articles/`。

## 失败的尝试

1.  **移除手动 OPTIONS 处理:** 尝试移除 `articles.py` 蓝图中可能存在的、手动处理 `OPTIONS` 请求的路由函数。无效，因为重定向发生在路由到蓝图函数之前。
2.  **在路由定义中允许 OPTIONS:** 尝试修改 `articles.py` 中的 `@articles_bp.route('/', methods=['GET', 'OPTIONS'])`，并在函数内处理 `OPTIONS` 请求。仍然无效，可能是因为底层重定向逻辑在 Flask 将请求匹配到此端点和方法组合之前就已触发。

## 最终解决方案：全局拦截

成功的解决方案是在请求进入 Flask 路由系统进行深度匹配之前，使用 `@app.before_request` 全局拦截器提前处理有问题的 `OPTIONS` 请求。

1.  **恢复路由定义:** 确保 `backend/app/routes/articles.py` 中的 `get_articles_api` 函数只声明处理 `GET` 方法。
    ```python
    # backend/app/routes/articles.py
    @articles_bp.route('/', methods=['GET']) 
    @articles_bp.route('/<path:ignore>', methods=['GET']) # 处理带斜杠的 GET
    def get_articles_api():
        # ... (只处理 GET 请求) ...
    ```

2.  **修改全局请求处理器 (`@app.before_request`)**: 在 `backend/app/__init__.py` 的 `create_app` 函数中，修改 `@app.before_request` 处理器，使其能识别并立即响应 `OPTIONS /api/articles` 请求。
    ```python
    # backend/app/__init__.py
    # ... (在 CORS(app, ...) 初始化之后) ...

    @app.before_request
    def handle_precarious_options():
        # 检查是否是针对 /api/articles 的 OPTIONS 请求
        if request.method == 'OPTIONS' and request.path == '/api/articles':
            print(f"\n*** DEBUG [Before Request Intercept]: Handling OPTIONS for {request.path} globally ***\n", flush=True)
            # 创建一个 204 No Content 响应
            # Flask-CORS 会自动为此响应添加必要的 Access-Control-* 头部
            response = app.make_response(('', 204)) 
            return response # 直接返回响应，阻止后续处理和重定向
            
        # 对于其他请求，继续正常处理 (隐式返回 None)
        print(f"\n*** DEBUG [Before Request]: Method={request.method}, Path={request.path} ... ***\n", flush=True) 
    ```

## 原理

通过 `@app.before_request`，我们在 Flask/Werkzeug/Gunicorn 执行任何可能导致重定向的 URL 规范化操作**之前**，就捕获了 `OPTIONS /api/articles` 这个特定的预检请求。通过立即返回一个带有正确 CORS 头部（由 Flask-CORS 自动添加）的 `204 No Content` 响应，我们满足了浏览器的预检要求，从而允许了后续的 `GET` 请求顺利进行。 