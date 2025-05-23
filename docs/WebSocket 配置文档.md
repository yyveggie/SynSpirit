# WebSocket 配置文档

本文档概述了 SynSpirit 项目中 WebSocket 的配置和使用情况，方便开发人员理解和维护实时通信功能。

## 后端配置 (Flask-SocketIO)

后端使用 `Flask-SocketIO` 库来实现 WebSocket 通信。

**1. 初始化与配置:**

*   **库:** `flask_socketio`
*   **初始化文件:** `backend/app/__init__.py`
*   **实例创建:**
    ```python
    from flask_socketio import SocketIO
    socketio = SocketIO()
    ```
*   **应用集成与 CORS:** 在 `create_app` 函数中，`socketio` 实例与 Flask 应用集成，并配置了 CORS (跨源资源共享)：
    ```python
    from app.config import CORS_ORIGINS # 从配置导入允许的源
    # ...
    socketio.init_app(
        app,
        cors_allowed_origins=CORS_ORIGINS, # 允许来自前端域名的连接
        ping_timeout=20,
        ping_interval=10,
        logger=True,         # 启用 SocketIO 日志
        engineio_logger=True # 启用 EngineIO 底层日志
    )
    ```
    *   `CORS_ORIGINS` 定义在 `backend/app/config.py` 中，指定了允许连接 WebSocket 的前端地址。
*   **消息队列 (Message Queue):** (隐式配置) 虽然代码中没有显式传递 `message_queue` 参数给 `SocketIO()`，但 `Flask-SocketIO` 在生产环境中通常建议配置消息队列（如 Redis 或 RabbitMQ）以支持多进程或多服务器部署。请检查 `backend/app/config.py` 中是否包含 `REDIS_URL` 或类似的配置，`Flask-SocketIO` 可能会自动检测并使用它。
*   **运行:** WebSocket 服务器通过 `socketio.run()` 在 `backend/run.py` 中启动：
    ```python
    from app import create_app, socketio
    from app.config import API_HOST, API_PORT, API_DEBUG
    # ...
    if __name__ == '__main__':
        socketio.run(app, debug=API_DEBUG, host=API_HOST, port=API_PORT)
    ```

**2. 事件处理:**

*   **处理器位置:** WebSocket 事件处理器主要位于 `backend/app/sockets/` 目录下，例如 `community_chat.py`。
*   **注册方式:** 事件处理器函数定义在特定模块中，然后通过一个注册函数（如 `register_community_chat_handlers(socketio)`）将其绑定到 `socketio` 实例上。这种方式有助于代码组织。
    ```python
    # backend/app/sockets/community_chat.py
    def register_community_chat_handlers(socketio):
        @socketio.on('disconnect')
        def disconnect_handler(): ...
        @socketio.on('join')
        def join_handler(data): ...
        @socketio.on('leave')
        def leave_handler(data): ...
        @socketio.on('send_message')
        def send_message_handler(data): ...
        # ... 其他事件
    ```
*   **主要事件 (示例):**
    *   `connect`: 处理客户端连接，验证 JWT 令牌，并将 `sid` (Session ID) 与 `user_id` 关联存储在 `sid_to_user` 字典中 (定义于 `backend/app/__init__.py`)。
    *   `disconnect`: 处理客户端断开连接，从 `sid_to_user` 中移除对应的 `sid`。
    *   `join`: 客户端加入特定房间（如 `community_topicSlug`）。
    *   `leave`: 客户端离开房间。
    *   `send_message`: 接收客户端发送的消息，验证用户身份，保存到数据库 (`ChatMessage` 模型)，然后广播给房间内的所有用户。支持 `@lynn` AI 指令。
    *   `request_history`: 客户端请求历史聊天记录。

**3. 用户身份验证:**

*   WebSocket 连接通过 JWT (JSON Web Token) 进行身份验证。
*   客户端在连接时通过 `auth` 参数传递 Token。
*   后端在 `connect` 事件中解码 Token，获取 `user_id`，并将其与 `sid` 关联。
*   在处理需要认证的事件（如 `send_message`）时，后端通过 `sid` 从 `sid_to_user` 映射中查找 `user_id` 来验证用户身份。

## 前端配置 (socket.io-client)

前端使用 `socket.io-client` 库与后端 WebSocket 服务器进行通信。

**1. 库与导入:**

*   **库:** `socket.io-client`
*   **导入:**
    ```typescript
    import { io, Socket } from 'socket.io-client';
    ```

**2. 连接建立:**

*   **触发位置:** 通常在需要实时功能的页面组件加载时建立连接，例如 `CommunityTopicPage.tsx`, `ArticlePage.tsx` 等。
*   **服务器地址:** 使用 `API_BASE_URL` (定义于 `frontend/src/config.ts`) 作为基础地址。由于 `API_BASE_URL` 为空字符串，实际连接地址将是相对于前端页面的路径（由 Vite/Webpack 的 proxy 配置转发到后端）。
*   **连接代码示例 (`CommunityTopicPage.tsx`):**
    ```typescript
    import { io, Socket } from 'socket.io-client';
    import { API_BASE_URL } from '../config';
    import { useAuth } from '../context/AuthContext'; // 用于获取 token

    // ... 组件内部 ...
    const { user } = useAuth(); // 获取包含 token 的用户信息
    const socketRef = useRef<Socket | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        // ... 其他逻辑 ...

        const connectSocket = () => {
            const roomName = `community_${topicSlug}`; // 动态房间名
            const token = localStorage.getItem('token'); // 从 localStorage 获取 token

            // 创建 Socket 实例
            const newSocket = io(API_BASE_URL, { // API_BASE_URL 为 ''
                path: '/socket.io', // Socket.IO 默认路径
                auth: { token: token } // 通过 auth 参数传递 token
                // 注意: ArticlePage.tsx 中还指定了 transports: ['websocket']
            });

            socketRef.current = newSocket;
            setSocket(newSocket);

            // 监听连接事件
            newSocket.on('connect', () => {
                console.log(`[Socket] Connected (SID: ${newSocket.id}). Emitting join...`);
                setIsChatConnected(true);
                // 发送 'join' 事件加入房间
                newSocket.emit('join', { room: roomName, username: user?.nickname || 'Anonymous' });
                // 请求历史记录等...
            });

            // 监听其他事件 (receive_message, status, error 等)
            newSocket.on('receive_message', (message: RealtimeChatMessage) => {
                // 处理收到的消息
            });

            // 监听断开连接事件
            newSocket.on('disconnect', (reason) => {
                console.log(`[Socket] Disconnected: ${reason}`);
                setIsChatConnected(false);
            });

            // ... 其他事件监听 ...
        };

        connectSocket();

        // 组件卸载时断开连接
        return () => {
            if (socketRef.current) {
                console.log("[Cleanup] Disconnecting socket.");
                socketRef.current.disconnect();
            }
        };
    }, [topicSlug, user]); // 依赖项可能包含 topicSlug, user 等
    ```

**3. 事件交互:**

*   **加入房间:** 连接成功后，客户端发送 `join` 事件，并附带房间名和用户名。
*   **发送消息:** 用户输入消息后，客户端发送 `send_message` 事件，包含房间名、消息内容和是否提及 AI (`@lynn`)。
*   **接收消息:** 客户端监听 `receive_message` 事件，将收到的消息显示在聊天界面。
*   **状态/错误处理:** 监听 `status` (如用户加入/离开) 和 `error` 事件。
*   **请求历史:** 客户端可能发送 `request_history` 事件来获取历史消息。

## 关键点总结

*   **技术栈:** 后端使用 Flask-SocketIO，前端使用 socket.io-client。
*   **通信协议:** 基于 WebSocket，由 Socket.IO 库封装。
*   **主要用途:** 实现社区主题的实时聊天功能。
*   **认证:** 通过 JWT 在连接时认证。
*   **房间管理:** 使用 Socket.IO 的房间机制 (`join_room`, `leave_room`) 来隔离不同主题的聊天。
*   **消息持久化:** 后端将聊天消息存储在数据库 (`ChatMessage` 模型)。
*   **部署考虑:** 如果部署到多服务器或多进程环境，需要确保后端配置了基于 Redis 或其他共享存储的消息队列，否则 Socket.IO 无法在不同实例间广播消息。

希望这份文档能帮助您和后续的开发者更好地理解项目的 WebSocket 实现！如果您需要了解特定部分的更多细节，请随时提出。