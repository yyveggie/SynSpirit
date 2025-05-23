# 注册搜索路由
from routes.searchRoutes import router as search_routes
app.register_blueprint(search_routes, url_prefix='/api/search') 