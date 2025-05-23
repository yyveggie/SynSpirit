/**
 * 全局配置文件
 */

// API基础URL
// 可以是绝对URL(例如http://localhost:5001)或相对URL(例如空字符串'')
// 使用相对URL可以避免CORS问题，但需要在前端服务器配置代理
// export const API_BASE_URL = ''; // 使用相对路径，避免CORS问题

// 如果需要调试时使用绝对路径，可以取消下面一行的注释并注释上面一行
export const API_BASE_URL = 'http://localhost:5001';

// 默认语言
export const DEFAULT_LANGUAGE = 'zh-CN';

// 应用信息
export const APP_NAME = 'SynSpirit';

// --- 修改：默认头像配置 ---
// 使用首字母头像服务代替原来的头像
export const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?name=L&background=8A2BE2&color=fff&size=200&bold=true&rounded=true';
export const DEFAULT_USER_AVATAR = 'https://synspirit-test-131313901.cos.ap-shanghai.myqcloud.com/system/default_avatar.png';
// --- 结束修改 ---

// --- 新增：Socket.IO服务器地址配置 ---
// 根据环境自动选择正确的Socket.IO服务器地址
// 本地开发环境使用localhost:5001
// 生产环境使用相对路径和环境变量
export const getSocketIOServerURL = () => {
  if (process.env.NODE_ENV === 'production') {
    // 生产环境：使用与API相同的主机
    return API_BASE_URL || window.location.origin;
  } else {
    // 开发环境：显式指定后端地址
    return 'http://localhost:5001';
  }
};
// --- 结束新增 ---

export const SOCKET_CONFIG = {
  // 从环境变量获取，有默认值
  serverUrl: process.env.REACT_APP_SOCKET_SERVER_URL || (
    process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:5001'
  ),
  path: process.env.REACT_APP_SOCKET_PATH || '/socket.io',
  reconnectionAttempts: parseInt(process.env.REACT_APP_SOCKET_RECONNECT_ATTEMPTS || '10'),
  reconnectionDelay: parseInt(process.env.REACT_APP_SOCKET_RECONNECT_DELAY || '1000'),
  reconnectionDelayMax: parseInt(process.env.REACT_APP_SOCKET_RECONNECT_DELAY_MAX || '5000'),
  timeout: parseInt(process.env.REACT_APP_SOCKET_TIMEOUT || '20000'),
  transports: (process.env.REACT_APP_SOCKET_TRANSPORTS || 'websocket,polling').split(','),
  forceNew: process.env.REACT_APP_SOCKET_FORCE_NEW === 'true',
  secure: process.env.REACT_APP_SOCKET_SECURE === 'true'
};

// 后端还需配合Redis适配器实现集群支持
// 例如：io.adapter(createAdapter(redisClient));