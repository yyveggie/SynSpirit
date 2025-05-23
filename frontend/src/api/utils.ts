/**
 * API工具函数
 * 提供通用的API请求相关工具方法
 */

/**
 * 获取认证请求头
 * 从localStorage中获取token并添加到请求头中
 */
export const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const token = localStorage.getItem('token');
  if (token) {
    // 确保没有Bearer前缀，因为后端可能期望直接使用token
    const tokenValue = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    headers['Authorization'] = tokenValue;
  }
  
  return headers;
}; 