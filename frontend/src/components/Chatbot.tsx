/**
 * 此文件定义了 Chatbot 组件，提供一个悬浮的聊天机器人界面。
 *
 * 主要功能:
 * - 根据 isOpen prop 控制聊天窗口的显示和隐藏。
 * - 提供聊天输入框和消息显示区域。
 * - 与后端聊天 API 进行交互，发送用户消息并接收 AI 响应。
 * - 可能包含一些预设问题或功能按钮。
 * - 作为一个独立的、可嵌入到不同页面的组件。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatLogic, Message } from '../hooks/useChatLogic'; // 导入Hook和Message类型
import { API_BASE_URL } from '../config'; // 仍然需要API_BASE_URL用于测试重连
import { useAuth } from '../context/AuthContext'; // 添加 useAuth 导入

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  toolName?: string;
  toolDescription?: string;
  /** 启用内联模式，适用于嵌入在其他组件中而非悬浮显示 */
  inlineMode?: boolean;
}

// Quick message interface (可以考虑移到共享文件)
interface QuickMessage {
  label: string;
  value: string;
}

const Chatbot: React.FC<ChatbotProps> = ({ isOpen, onClose, inlineMode = false }) => {
  const { token, user } = useAuth(); // 获取用户认证信息
  const [input, setInput] = useState('');
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 768);
  
  // 使用自定义Hook管理核心聊天逻辑
  const {
    messages, 
    setMessages, // 可能需要用于重试逻辑
    currentConversationId,
    setCurrentConversationId, // 可能需要用于导航逻辑
    isLoading,
    apiError,
    isTyping,
    messagesEndRef,
    handleSend: sendChatMessage, // 重命名以避免与内部函数冲突
    loadConversation,
    createNewChat, // Chatbot本身可能不需要这个
    handleRetry: retryApiConnection // 重命名
  } = useChatLogic(); // 初始对话ID由Hook管理

  const closeRef = useRef(onClose);
  
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  
  // 处理重试连接（现在使用Hook中的逻辑，但需要额外fetch测试）
  const handleRetry = () => {
    retryApiConnection(); // 调用Hook中的清理错误状态逻辑
    
    // 这里保留测试连接的逻辑，或者可以将其移入Hook?
    // 为了简单起见，暂时保留在这里，但理想情况是Hook处理所有API交互
    setMessages(prev => [...prev.filter(msg => !msg.content.includes('无法连接到聊天服务') && !msg.content.includes('正在尝试重新连接')),
      { role: 'assistant', content: '正在尝试重新连接...', displayContent: '正在尝试重新连接...' }]);
      
    fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '测试连接', conversation_id: null })
    })
    .then(response => {
      if (response.ok) {
        setMessages(prev => [...prev.filter(msg => msg.content !== '正在尝试重新连接...'),
          { role: 'assistant', content: '连接已恢复！请问有什么需要帮助的？🥰', displayContent: '连接已恢复！请问有什么需要帮助的？🥰' }]);
        const reader = response.body?.getReader();
        if (reader) reader.cancel();
      } else {
        throw new Error('API仍然无法连接');
      }
    })
    .catch(error => {
      console.error('重试连接失败:', error);
      setMessages(prev => [...prev.filter(msg => msg.content !== '正在尝试重新连接...'),
        { role: 'assistant', content: '抱歉，服务器仍然无法连接。请检查后端服务是否正常运行。', displayContent: '抱歉，服务器仍然无法连接。请检查后端服务是否正常运行。' }]);
      // Hook内部已经处理了apiError状态
    });
  };

  // 处理发送消息（调用Hook中的函数）
  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;
    const currentInput = input;
    setInput(''); // 清空输入框
    const newConvId = await sendChatMessage(currentInput);
    if (newConvId && !currentConversationId) {
      // 如果Hook创建了新对话，更新本地状态（如果需要）
      setCurrentConversationId(newConvId);
    }
    // 注意：isLoading, messages, isTyping等状态由Hook自动管理
  };
  
  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  // 快速消息（保持不变，因为这是UI特定部分）
  const quickMessages: QuickMessage[] = [
    { label: '推荐AI绘画工具?', value: '推荐AI绘画工具?' },
    { label: '生成视频的AI?', value: '有什么好用的AI视频生成工具？' },
    { label: '写代码的AI助手?', value: '有哪些适合写代码的AI助手？' }
  ];

  // --- UI Rendering ---
  if (inlineMode) {
    return (
      <div className={`${isOpen ? 'block' : 'hidden'} h-full`}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isOpen ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="h-full"
        >
          <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col w-full h-full">
            {/* Header */} 
            <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200 flex-shrink-0">
              <h3 className="text-gray-800 font-medium text-lg">Lynn</h3>
              <div className="flex space-x-3 items-center">
                {apiError && (
                  <span className="text-xs text-red-500" title={apiError}>连接错误</span>
                )}
                <button 
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-800 transition-colors"
                  title="关闭"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Message list */}
            <div ref={messagesEndRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-100">
              {messages.map((msg, index) => (
                <div key={msg.id ?? `temp-${msg.role}-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-lg text-sm shadow ${msg.role === 'user' ? 'bg-gray-200 text-black' : 'bg-white text-black'}`}>
                    {(msg.displayContent || '').split('\n').map((line, i) => (
                      <span key={i} className="block">{line}</span>
                    ))}
                    {msg.role === 'assistant' && isTyping && index === messages.length - 1 && (
                      <span className="inline-block w-2 h-4 bg-gray-500 ml-0.5 animate-pulse"></span>
                    )}
                    {msg.role === 'assistant' && apiError && msg.content.includes('无法连接到聊天服务') && (
                      <button onClick={handleRetry} className="mt-2 text-xs text-blue-600 hover:underline">
                        重试连接
                      </button>
                    )}
                    {msg.role === 'assistant' && apiError && !msg.content.includes('无法连接到聊天服务') && msg.content.includes('出错啦') && (
                      <span className="block mt-1 text-xs text-red-500">错误: {apiError}</span>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && !isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-black px-4 py-2 rounded-lg text-sm shadow">
                    <span className="italic text-gray-500">Lynn 正在思考...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick messages */} 
            {messages.length <= 1 && !isLoading && ( 
              <div className="flex-shrink-0 p-2 border-t border-gray-200 bg-white flex flex-wrap gap-2 justify-center">
                {quickMessages.map((qm) => (
                  <button
                    key={`qm-${qm.label}-${qm.value}`}
                    onClick={() => { setInput(qm.value); handleSend(); }} 
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input area */} 
            <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的需求..."
                  className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 text-black text-sm"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 text-sm"
                  disabled={isLoading || input.trim() === ''}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 16.571V11.69l3.226-3.225a.5.5 0 01.707 0l1.293 1.293a.5.5 0 010 .707L10.07 13.69V16.57a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /> </svg>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // 浮动窗口模式
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`${isOpen ? 'block' : 'hidden'}`}>
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={isOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 50, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col w-96 max-h-[80vh]"
            style={{ height: '600px' }}
          >
            {/* Header */} 
            <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200 flex-shrink-0">
              <h3 className="text-gray-800 font-medium text-lg">Lynn</h3>
              <div className="flex space-x-3 items-center">
                {apiError && (
                  <span className="text-xs text-red-500" title={apiError}>连接错误</span>
                )}
                <button 
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-800 transition-colors"
                  title="关闭"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Message list */}
            <div ref={messagesEndRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-100">
              {messages.map((msg, index) => (
                <div key={msg.id ?? `temp-${msg.role}-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-lg text-sm shadow ${msg.role === 'user' ? 'bg-gray-200 text-black' : 'bg-white text-black'}`}>
                    {(msg.displayContent || '').split('\n').map((line, i) => (
                      <span key={i} className="block">{line}</span>
                    ))}
                    {msg.role === 'assistant' && isTyping && index === messages.length - 1 && (
                      <span className="inline-block w-2 h-4 bg-gray-500 ml-0.5 animate-pulse"></span>
                    )}
                    {msg.role === 'assistant' && apiError && msg.content.includes('无法连接到聊天服务') && (
                      <button onClick={handleRetry} className="mt-2 text-xs text-blue-600 hover:underline">
                        重试连接
                      </button>
                    )}
                    {msg.role === 'assistant' && apiError && !msg.content.includes('无法连接到聊天服务') && msg.content.includes('出错啦') && (
                      <span className="block mt-1 text-xs text-red-500">错误: {apiError}</span>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && !isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-black px-4 py-2 rounded-lg text-sm shadow">
                    <span className="italic text-gray-500">Lynn 正在思考...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick messages */} 
            {messages.length <= 1 && !isLoading && ( 
              <div className="flex-shrink-0 p-2 border-t border-gray-200 bg-white flex flex-wrap gap-2 justify-center">
                {quickMessages.map((qm) => (
                  <button
                    key={`qm-${qm.label}-${qm.value}`}
                    onClick={() => { setInput(qm.value); handleSend(); }} 
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors"
                  >
                    {qm.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input area */} 
            <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的需求..."
                  className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 text-black text-sm"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-50 text-sm"
                  disabled={isLoading || input.trim() === ''}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 16.571V11.69l3.226-3.225a.5.5 0 01.707 0l1.293 1.293a.5.5 0 010 .707L10.07 13.69V16.57a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /> </svg>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Chatbot;
