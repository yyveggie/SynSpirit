import React, { useState, useEffect } from 'react';
import { testApiConnection } from '../api/articleApi';
import { API_BASE_URL } from '../config';

interface ApiConnectionTestProps {
  onClose: () => void;
}

const ApiConnectionTest: React.FC<ApiConnectionTestProps> = ({ onClose }) => {
  const [testStatus, setTestStatus] = useState<string>('');
  const [testResults, setTestResults] = useState<any>({});
  const [apiUrl, setApiUrl] = useState<string>(API_BASE_URL || '(相对路径)');
  const [loading, setLoading] = useState<boolean>(false);
  
  // 测试API连接
  const runConnectionTest = async () => {
    setLoading(true);
    try {
      const result = await testApiConnection();
      setTestStatus(result.status);
      setTestResults(result);
    } catch (error) {
      setTestStatus('error');
      setTestResults({ error: error instanceof Error ? error.message : '未知错误' });
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    runConnectionTest();
  }, []);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-gray-800 text-white p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
        <button 
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold mb-4">API连接测试</h2>
        
        <div className="mb-6">
          <p className="mb-2">当前API基础URL: <code className="bg-gray-700 px-2 py-1 rounded">{apiUrl}</code></p>
          
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <button 
                onClick={runConnectionTest}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '测试中...' : '重新测试连接'}
              </button>
            </div>
            
            <div>
              <div className={`px-4 py-2 rounded ${
                testStatus === 'success' ? 'bg-green-800' : 
                testStatus.startsWith('error') ? 'bg-red-800' : 
                'bg-yellow-800'
              }`}>
                状态: {loading ? '测试中...' : 
                  testStatus === 'success' ? '连接成功' : 
                  testStatus === 'network-error' ? '网络错误' :
                  testStatus.startsWith('error') ? `服务器错误 (${testStatus})` : 
                  testStatus || '未知'}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">CORS问题诊断</h3>
          
          <p className="text-sm text-gray-300 mb-4">
            如果遇到CORS错误，可能是以下原因：
          </p>
          
          <ul className="list-disc list-inside text-sm space-y-2 bg-gray-700/50 p-4 rounded">
            <li>后端服务器未配置允许前端域名的跨域访问</li>
            <li>后端服务器未正确响应preflight请求</li>
            <li>后端服务器未启动或无法访问</li>
            <li>API URL配置错误</li>
          </ul>
          
          <div className="mt-4">
            <h4 className="font-medium mb-2">解决方案：</h4>
            <ol className="list-decimal list-inside text-sm space-y-2 bg-gray-700/50 p-4 rounded">
              <li>确保后端服务器正在运行</li>
              <li>检查后端CORS配置，确保添加了前端域名</li>
              <li>在后端添加以下CORS头：
                <code className="block mt-1 bg-gray-600 p-2 rounded text-xs">
                  Access-Control-Allow-Origin: *<br />
                  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS<br />
                  Access-Control-Allow-Headers: Content-Type, Authorization
                </code>
              </li>
              <li>修改前端配置使用相对路径 (config.ts中设置API_BASE_URL为空字符串)</li>
              <li>配置前端开发服务器代理，转发API请求到后端</li>
            </ol>
          </div>
        </div>
        
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">调试信息</h3>
          <pre className="bg-gray-900 p-3 rounded text-xs overflow-auto max-h-40">
            {JSON.stringify(testResults, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ApiConnectionTest; 