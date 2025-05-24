import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-toastify';
import { API_BASE_URL, getSocketIOServerURL } from '../config';
import { useAuth } from '../context/AuthContext'; // 确保 useAuth 被正确导入
import { User } from '../context/AuthContext';

// 定义聊天消息类型
interface RealtimeChatMessage {
  id: string; 
  userId: number;
  username: string; 
  nickname?: string | null;
  avatar?: string | null;
  message: string;
  timestamp: string;
  is_system_message?: boolean;
  local_id?: string;
}

// 更新 Props 定义
interface CommunityChatPanelProps {
  communityId: number; // 使用社区 ID
  communityType: 'topic' | 'relationship_topic'; // 使用统一的社区类型
  communityName: string; // 使用社区名称

  isOpen: boolean; // 控制面板是否可见
  onClose: () => void; // 关闭回调
}

// *** 修正：格式化时间戳的辅助函数 ***
const formatChatMessageTimestamp = (timestampStr: string): string => {
  if (!timestampStr) return '';

  try {
    // *** 移除 .replace(' ', 'T') + 'Z' ***
    // 后端返回的已经是有效的 ISO 8601 格式 (带 T 和 Z)
    const messageDate = new Date(timestampStr); 

    // 检查日期是否有效
    if (isNaN(messageDate.getTime())) {
       console.error(`[Chat Timestamp] 解析时间戳失败，格式无效: ${timestampStr}`);
       return timestampStr; // 解析失败则返回原始字符串
    }

    const now = new Date();
    // *** 使用 toLocaleString 获取特定时区的 Date 对象进行比较 ***
    const beijingNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const beijingMessageDate = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));

    const todayStartBeijing = new Date(beijingNow.getFullYear(), beijingNow.getMonth(), beijingNow.getDate());
    const yesterdayStartBeijing = new Date(todayStartBeijing);
    yesterdayStartBeijing.setDate(todayStartBeijing.getDate() - 1);

    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Shanghai', // 明确指定北京时间
      hour: '2-digit',
      minute: '2-digit',
      hour12: false, // 使用24小时制
    };
    // *** 直接对原始 Date 对象格式化为北京时间 ***
    const formattedTime = messageDate.toLocaleTimeString('zh-CN', timeOptions);

    if (beijingMessageDate >= todayStartBeijing) {
      return formattedTime; // 今天
    } else if (beijingMessageDate >= yesterdayStartBeijing) {
      return `昨天 ${formattedTime}`; // 昨天
    } else {
      // 更早: YYYY/MM/DD HH:mm
      // *** 从北京时间的 Date 对象获取年月日 ***
      const year = beijingMessageDate.getFullYear();
      const month = (beijingMessageDate.getMonth() + 1).toString().padStart(2, '0');
      const day = beijingMessageDate.getDate().toString().padStart(2, '0');
      return `${year}/${month}/${day} ${formattedTime}`;
    }
  } catch (e) {
    console.error("[Chat Timestamp] 格式化聊天时间戳时捕获到异常:", e);
    return timestampStr; // 出错时返回原始字符串
  }
};

const CommunityChatPanel: React.FC<CommunityChatPanelProps> = ({
  communityId,
  communityType,
  communityName,
  isOpen,
  onClose,
}) => {
  const { user, token } = useAuth(); // 从 Context 获取用户信息和 Token
  // --- 聊天状态 ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [chatMessages, setChatMessages] = useState<RealtimeChatMessage[]>([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [isChatConnected, setIsChatConnected] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isInitialHistoryLoaded, setIsInitialHistoryLoaded] = useState(false);
  // --- 新增状态 ---
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true); // 初始假设有更多历史
  // *** 动画状态 ***
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isConnectionError, setIsConnectionError] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [historyReceived, setHistoryReceived] = useState(false);
  // *** 防止重复发送 ***
  const [isSending, setIsSending] = useState(false);
  const processedMessageIds = useRef<Set<string>>(new Set());
  
  // --- 滚动到底部 ---
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: behavior,
      });
    }
  }, []);

  // --- 面板显示/隐藏效果 ---
  useEffect(() => {
    if (isOpen) {
      // 进入时，先淡入整个容器，但内容保持隐藏状态
      const timer = setTimeout(() => {
        setShowContent(true);
      }, 300); // 等面板淡入后再显示内容
      return () => clearTimeout(timer);
    } else {
      // 退出时，立即隐藏内容
      setShowContent(false);
    }
  }, [isOpen]);

  // --- Socket.IO 连接与事件处理 ---
  useEffect(() => {
    let isMounted = true;
    let socketInstance: Socket | null = null;

    const connectSocket = () => {
      // 必须要有 communityId 和 token 才能连接
      if (!communityId || !token) {
        console.log(`[ChatPanel Connect] Pre-check failed (communityId: ${communityId}, token: ${!!token})`);
        return;
      }

      // 如果已经存在 socket 或正在连接，则先断开
      if (socketRef.current) {
        console.log("[ChatPanel Connect] Disconnecting existing socket before new connection.");
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsChatConnected(false);
        setIsInitialHistoryLoaded(false);
        setChatMessages([]); // 清空消息
      }

      // --- 构建房间名 ---
      const roomName = communityType === 'topic' 
        ? `community_topic_${communityId}` 
        : `community_relationship_topic_${communityId}`;
      console.log(`[ChatPanel Socket] Attempting to connect and join room: ${roomName} (ID: ${communityId})`);

      // --- 重置状态 ---
      setChatMessages([]);
      setIsInitialHistoryLoaded(false);
      setIsChatConnected(false);
      setIsFetchingHistory(false); // 重置加载状态
      setHasMoreHistory(true); // 重置是否有更多历史的状态
      setLoadingProgress(0); // 重置加载进度
      setIsConnectionError(false); // 重置连接错误状态
      setHistoryReceived(false); // 重置历史记录接收状态
      processedMessageIds.current.clear(); // 清空已处理消息ID集合

      // --- 创建 Socket 实例 ---
      socketInstance = io(getSocketIOServerURL(), { // 使用配置函数获取正确的服务器地址
          path: '/socket.io', 
          transports: ['websocket', 'polling'], // 允许WebSocket和轮询两种方式
          auth: { token: token }, // 使用 context 获取的 token
          // 添加重连尝试配置
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 10000
      });
      socketRef.current = socketInstance;
      setSocket(socketInstance); // 更新状态

      // --- 事件监听 ---
      socketInstance.on('connect', () => {
          if (!isMounted || socketRef.current !== socketInstance) return;
          console.log(`[ChatPanel Socket] 连接成功! SID: ${socketInstance?.id}`);
          setIsChatConnected(true); 
          socketInstance?.emit('join', { room: roomName, username: user?.nickname || 'Anonymous' });
          console.log(`[ChatPanel Socket] Emitting initial request_history for room: ${roomName} with limit 30`);
          // 初始加载时，不发送 before_message_id
          socketInstance?.emit('request_history', { room: roomName, limit: 30 }); 
      });

      socketInstance.on('message_history', (data: { history: RealtimeChatMessage[], has_more: boolean, requested_before_id?: string }) => {
          if (!isMounted || socketRef.current !== socketInstance) return;
          
          const { history, has_more, requested_before_id } = data;
          console.log(`[ChatPanel Socket] Received message_history (${history.length} messages). Has more: ${has_more}. Requested before ID: ${requested_before_id}`);
          
          // 更新 hasMoreHistory 状态
          setHasMoreHistory(has_more);

          if (requested_before_id) {
              // --- 加载旧消息 ---
              setIsFetchingHistory(true); // 开始处理旧消息
              const container = chatContainerRef.current;
              const oldScrollHeight = container?.scrollHeight || 0;
              const oldScrollTop = container?.scrollTop || 0;

              // 将新获取的历史消息标记为已处理
              history.forEach(msg => processedMessageIds.current.add(msg.id));
              
              setChatMessages(prev => {
                  // 去重，防止因网络问题重复添加
                  const existingIds = new Set(prev.map(m => m.id));
                  const newHistory = history.filter(m => !existingIds.has(m.id));
                  // 确保 newHistory 是按时间顺序 (旧 -> 新) 的
                  return [...newHistory, ...prev]; // 将旧消息加到前面
              });

              // 保持滚动位置
              requestAnimationFrame(() => { 
                  if (container) {
                      const newScrollHeight = container.scrollHeight;
                      // 关键: 滚动位置恢复逻辑
                      container.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
                      console.log(`[ChatPanel Scroll] Restored scroll after loading older history. OldTop: ${oldScrollTop}, OldHeight: ${oldScrollHeight}, NewHeight: ${newScrollHeight}, NewTop: ${container.scrollTop}`);
                  }
              });
              // 处理完成后，设置加载状态为 false
              setIsFetchingHistory(false);

          } else {
              // --- 初始历史加载 ---
              setHistoryReceived(true);
              
              if (history.length === 0) {
                console.log('[ChatPanel Socket] Initial history is empty.');
                setChatMessages([]); // 确保清空
                setIsInitialHistoryLoaded(true);
                return;
              }
              
              // 将历史消息标记为已处理
              history.forEach(msg => processedMessageIds.current.add(msg.id));
              
              // 直接设置消息并标记完成
              setChatMessages(history);
              setLoadingProgress(100);
              
              // 简单延迟后标记完成
              setTimeout(() => {
                setIsInitialHistoryLoaded(true);
                // 滚动到底部
                scrollToBottom('auto');
              }, 100);
          }
      });

      socketInstance.on('receive_message', (message: RealtimeChatMessage) => {
          if (!isMounted || socketRef.current !== socketInstance) return;
          console.log(`[ChatPanel Socket] Received new message object:`, message);
          console.log(`[ChatPanel Socket] Message local_id from server:`, message.local_id);
          
          // 检查消息是否已经处理过，避免重复
          if (processedMessageIds.current.has(message.id)) {
              console.log(`[ChatPanel Socket] Skipping already processed message: ${message.id}`);
              return;
          }
          
          // 标记消息为已处理
          processedMessageIds.current.add(message.id);
          
          const isOwnMessage = message.userId === user?.id && !message.is_system_message;
          
          // --- Enhanced Logging --- 
          console.log(`[ChatPanel Receive] Processing message ID: ${message.id}, Local ID: ${message.local_id}`);
          console.log(`[ChatPanel Receive] Is own message? ${isOwnMessage} (User ID: ${user?.id}, Message UserID: ${message.userId})`);
          
          setChatMessages(prev => {
              // 如果是自己的消息，尝试替换本地预览
              if (isOwnMessage && message.local_id) {
                  const existingIndex = prev.findIndex(m => m.id === message.local_id);
                  
                  if (existingIndex > -1) {
                      // 替换逻辑
                      const updatedMessages = [...prev];
                      // *** 关键：用服务器确认的消息替换本地预览，确保使用服务器的 ID ***
                      updatedMessages[existingIndex] = { ...message, id: message.id }; 
                      return updatedMessages;
                  } else {
                      // 找不到本地预览时的后备逻辑
                      // Fallback to adding if local preview not found
                      if (prev.some(msg => msg.id === message.id)) { 
                          return prev; // Avoid duplicates if already added somehow
                      }
                      return [...prev, message];
                  }
              } else if (!prev.some(msg => msg.id === message.id)) { // 添加非自己的消息或系统消息（避免重复）
                  return [...prev, message];
              }
              return prev; // 如果是自己的消息且找不到本地预览，或者消息已存在，则不更新
          });

          // 如果收到新消息时用户不在底部附近，可能不滚动，或者给个提示？暂时先滚动
          setTimeout(() => scrollToBottom('smooth'), 100); 
      });

      socketInstance.on('status', (data: { msg: string }) => {
          if (!isMounted || socketRef.current !== socketInstance) return; 
          console.log("[ChatPanel Socket] Status:", data.msg);
      });

      socketInstance.on('error', (error: { message: string }) => {
          if (!isMounted || socketRef.current !== socketInstance) return; 
          console.error("[ChatPanel Socket] Error:", error.message);
          toast.error(`聊天错误: ${error.message}`);
      });

      socketInstance.on('disconnect', (reason) => { 
          if (socketRef.current === socketInstance) { 
              console.log(`[ChatPanel Socket] Disconnected: ${reason}`); 
              setIsChatConnected(false); 
              setIsInitialHistoryLoaded(false); 
          }
      });

      socketInstance.on('connect_error', (err) => { 
          if (socketRef.current === socketInstance) {
              console.error(`[ChatPanel Socket] 连接错误: ${err.message}, 正在尝试重连...`);
              console.error('[ChatPanel Socket] Connection error:', err);
              setIsChatConnected(false); 
              setIsConnectionError(true);
          }
      });
    };

    // 断开连接函数
    const disconnectSocket = () => {
      if (socketRef.current) {
        console.log(`[ChatPanel Disconnect] Disconnecting socket for ${communityType} ID: ${communityId}`);
        // 清理监听器
        socketRef.current.off('connect');
        socketRef.current.off('message_history');
        socketRef.current.off('receive_message');
        socketRef.current.off('status');
        socketRef.current.off('error');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      // 重置状态
      setSocket(null); 
      setIsInitialHistoryLoaded(false);
      setIsChatConnected(false);
      processedMessageIds.current.clear(); // 清空已处理消息ID集合
    };

    // 主要逻辑：根据 isOpen 状态决定连接或断开
    if (isOpen) {
      console.log("[ChatPanel Effect] isOpen is true, attempting to connect.");
      connectSocket();
    } else {
      console.log("[ChatPanel Effect] isOpen is false, disconnecting.");
      disconnectSocket();
    }

    // --- 清理函数 ---
    return () => {
        isMounted = false;
        console.log(`[ChatPanel Effect Cleanup] Component unmounting or dependencies changed.`);
        // 移除对 disconnectSocket 的直接调用，因为依赖项变化时 isOpen 会处理
        // 如果 socketInstance 存在且未被 disconnectSocket 清理，则在此处清理
        if (socketRef.current) {
             console.log("[ChatPanel Effect Cleanup] Performing final disconnect.");
             disconnectSocket(); 
        }
    };
  // 修改依赖项：移除 isOpen，当这些核心 ID 或 token 变化时才重新执行连接逻辑
  // isOpen 的变化通过上面的 if/else 控制连接/断开行为
  }, [communityId, user?.id, token, communityType, scrollToBottom]); 

  // 新增 Effect：单独监听 isOpen 状态变化，执行连接/断开
  useEffect(() => {
    // 这个 Effect 只关心 isOpen 的变化
    if (isOpen) {
      // 如果面板打开，并且当前没有 socket 连接，则尝试连接
      if (!socketRef.current) {
        console.log("[ChatPanel isOpen Effect] Panel opened and no socket, triggering connect logic (handled by main effect if dependencies match).");
        // connectSocket(); // 主要 effect 会处理连接，这里避免重复调用
        // 只需要确保主要 effect 被触发（如果依赖项变化了）
        // 如果依赖项没变，但 socket 断了，需要一种机制重连，上面的逻辑已包含
      } else {
        console.log("[ChatPanel isOpen Effect] Panel opened, socket already exists/connecting.");
      }
    } else {
      // 如果面板关闭，则断开连接
      if (socketRef.current) {
        console.log("[ChatPanel isOpen Effect] Panel closed, triggering disconnect.");
        // 调用断开逻辑
        socketRef.current.disconnect(); // 直接断开
        socketRef.current = null;
        setSocket(null);
        setIsChatConnected(false);
        setIsInitialHistoryLoaded(false);
      } else {
         console.log("[ChatPanel isOpen Effect] Panel closed, no socket to disconnect.");
      }
    }
  }, [isOpen]); // 只依赖 isOpen

  // --- 滚动加载更多历史消息 ---
  useEffect(() => {
      const container = chatContainerRef.current;
      if (!container) return;
      
      const fetchMoreHistory = () => {
          if (!socketRef.current || !hasMoreHistory || isFetchingHistory || chatMessages.length === 0) {
              // 如果正在加载、没有更多历史、或聊天记录为空，则不执行
              return;
          }
          
          // 设置正在加载状态，防止重复触发
          setIsFetchingHistory(true);
          
          // 获取当前最旧的消息 ID 作为游标
          const oldestMessageId = chatMessages[0]?.id;
          
          if (oldestMessageId) {
              const roomName = communityType === 'topic' 
                  ? `community_topic_${communityId}` 
                  : `community_relationship_topic_${communityId}`;
                  
              console.log(`[ChatPanel Scroll] Requesting more history before message ID: ${oldestMessageId}`);
              socketRef.current.emit('request_history', { 
                  room: roomName, 
                  limit: 30, // 可以调整每次加载的数量
                  before_message_id: oldestMessageId 
              });
          } else {
               console.log('[ChatPanel Scroll] No oldest message ID found, cannot fetch more history.');
               setIsFetchingHistory(false); // 如果没有旧消息ID，重置加载状态
          }
      };
      
      const handleScroll = () => {
          // 检查是否滚动到顶部附近
          if (container.scrollTop < 50 && hasMoreHistory && !isFetchingHistory) {
              fetchMoreHistory();
          }
      };
      
      container.addEventListener('scroll', handleScroll);
      
      return () => {
          container.removeEventListener('scroll', handleScroll);
      };
  }, [chatMessages, hasMoreHistory, isFetchingHistory, communityId, communityType, scrollToBottom]); // 添加依赖项

  // --- 发送消息 ---
  const handleSendCommunityChatMessage = () => {
    // 如果已经在发送中，直接返回，防止重复发送
    if (isSending) return;
    
    const roomName = communityType === 'topic' 
      ? `community_topic_${communityId}` 
      : `community_relationship_topic_${communityId}`;

    if (socketRef.current && currentChatMessage.trim() && user && communityId) {
      // 设置发送状态为true
      setIsSending(true);
      
      const messageText = currentChatMessage.trim();
      const isLynnMention = messageText.toLowerCase().includes('@lynn');
      // *** 修改：为本地预览生成唯一 ID ***
      const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      console.log("[ChatPanel] Generated localId for preview:", localId);
      
      const messageData = {
        room: roomName,
        message: messageText,
        is_ai_mention: isLynnMention,
        local_id: localId // *** 发送本地ID给后端，用于确认 ***
      };
      console.log("[ChatPanel] Sending message:", messageData);
      
      const localPreviewMessage: RealtimeChatMessage = {
        id: localId, // *** 使用本地ID ***
        userId: user.id,
        username: user.nickname || user.email, 
        nickname: user.nickname,
        avatar: user.avatar,
        message: messageText,
        timestamp: new Date().toISOString(),
        is_system_message: false
      };
      // *** 修改：添加本地预览消息 ***
      setChatMessages(prev => [...prev, localPreviewMessage]);
      setTimeout(() => scrollToBottom('smooth'), 100); 
      
      // 清空输入框
      setCurrentChatMessage('');

      // *** 修改：处理后端确认/错误 ***
      socketRef.current.emit('send_message', messageData, (response: any) => {
         // 重置发送状态
         setIsSending(false);
         
         if (response?.error) {
              console.error('[ChatPanel] Message send error:', response.error);
              toast.error(`发送失败: ${response.error}`);
              // 可选：移除发送失败的本地预览
              setChatMessages(prev => prev.filter(msg => msg.id !== localId));
          } else if (response?.success && response.message_id) {
              console.log('[ChatPanel] Message send success, confirmed ID:', response.message_id);
              // 添加服务器返回的消息ID到已处理列表，避免重复添加
              if (response.message_id) {
                processedMessageIds.current.add(response.message_id);
              }
          } else {
              console.warn('[ChatPanel] Message send response did not contain success or error confirmation.');
          }
      });
    } else {
        if (!socketRef.current || !isChatConnected) toast.error("聊天服务未连接");
        else if (!currentChatMessage.trim()) toast.warn("请输入消息");
        else if (!user) toast.error("请先登录");
        else if (!communityId) console.error("无法发送消息: communityId 未提供");
    }
  };

  // --- 渲染聊天面板 ---
  return (
      <div
        className={`w-full transition-opacity duration-700 ease-in-out mt-4 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* 容器没有阴影和边框 */}
        <div className="w-full h-auto bg-transparent flex flex-col overflow-hidden"> 
          
          {/* 聊天内容区域 - 只在showContent为true时显示 */}
          <div 
            ref={chatContainerRef} 
            className={`overflow-y-auto p-4 bg-transparent space-y-3 h-[500px] relative transition-opacity duration-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}
          >
            {/* 正在加载更多历史指示器 */}
            {isFetchingHistory && (
                <div className="flex justify-center items-center py-2">
                    <div className="animate-pulse flex space-x-1">
                        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full"></div>
                        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animation-delay-200"></div>
                        <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animation-delay-400"></div>
                    </div>
                </div>
            )}
            
            {/* 没有更多历史提示 */}
            {!hasMoreHistory && chatMessages.length > 0 && (
                 <div className="text-center text-gray-500 text-xs py-2 animate-fade-in">
                     没有更早的消息了
                 </div>
             )}
            
            {/* --- 加载中提示：当历史记录还未接收时 --- */}
            {!historyReceived && showContent && (
              <div className="flex justify-center items-center h-full">
                <div className="text-gray-400 text-sm animate-pulse">
                  正在连接...
                </div>
              </div>
            )}
            
            {/* --- 全部内容统一显示区域 --- */}
            {historyReceived && (
              <div className="space-y-3">
                {/* 如果没有消息 */}
                {chatMessages.length === 0 ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="text-gray-500 text-sm animate-fade-in">
                      欢迎来到 {communityName} 讨论区！
                    </div>
                  </div>
                ) : (
                  /* 消息列表 - 使用统一动画效果 */
                  chatMessages.map((msg, index) => {
                    // 只有第一次加载完成前的消息需要序列动画
                    const shouldAnimate = !isInitialHistoryLoaded;
                    return renderChatMessage(msg, index, shouldAnimate ? index : -1);
                  })
                )}
              </div>
            )}
          </div>

          {/* 输入区域 - 添加上边框作为分割线，移除背景和圆角 */}
          <div className={`p-3 flex-shrink-0 border-t border-gray-700/50 transition-opacity duration-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
            {/* 将 form 移到外面，处理提示信息 */}
            {!user ? (
              <p className="text-xs text-yellow-600 text-center">请 <Link to="/login" className="underline hover:text-yellow-700">登录</Link> 后参与讨论。</p>
            ) : !isChatConnected ? (
              <p className="text-xs text-amber-400 text-center">讨论服务连接中...</p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleSendCommunityChatMessage(); }} className="flex items-center space-x-2 w-full">
                <input
                  type="text"
                  value={currentChatMessage}
                  onChange={(e) => setCurrentChatMessage(e.target.value)}
                  placeholder=""
                  disabled={!isChatConnected || !user || isSending}
                  className="flex-grow px-3 py-1.5 bg-gray-900/40 border border-transparent rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500/60 text-gray-100 placeholder-gray-400 text-sm disabled:bg-gray-700/30 disabled:cursor-not-allowed"
                  onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSendCommunityChatMessage(); } }}
                />
                <button
                  type="submit"
                  className={`p-1.5 rounded-md focus:outline-none transition-colors duration-200
                            ${!isChatConnected || !currentChatMessage.trim() || !user || isSending
                              ? 'text-gray-500 cursor-not-allowed'
                              : 'text-indigo-400 hover:text-indigo-300'}`}
                  disabled={!isChatConnected || !currentChatMessage.trim() || !user || isSending}
                >
                  {/* 回车图标 */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
                  </svg>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
  );
  
  // 辅助函数：渲染单条消息
  function renderChatMessage(msg: RealtimeChatMessage, index: number, animationIndex: number = -1) {
    const isCurrentUser = msg.userId === user?.id; 
    const isLynnAI = msg.is_system_message;

    // 只有新增的消息或已加载完成的消息才有弹入动画
    const isNewMessage = msg.id === chatMessages[chatMessages.length - 1]?.id && 
                        chatMessages.length > 1 && 
                        isInitialHistoryLoaded && 
                        !msg.id.startsWith('local_');
                        
    const animationClass = isNewMessage ? 'animate-fade-in-up' : 
                           animationIndex >= 0 ? 'animate-fade-in' : '';
    
    // 计算序列动画延迟
    const delayStyle = animationIndex >= 0 
                      ? { animationDelay: `${Math.min(animationIndex * 30, 300)}ms` } 
                      : {};
    
    return ( 
      <div 
        key={msg.id || index} 
        className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'} ${animationClass}`}
        style={delayStyle}
      > 
        {/* Avatar and username (if not current user and not AI) */} 
        {!isCurrentUser && !isLynnAI && ( 
          <div className="flex items-center mb-1"> 
            <img 
              src={msg.avatar || '/default-avatar.png'} 
              alt={msg.nickname || msg.username || '用户'} 
              className="w-5 h-5 rounded-full mr-3" 
              onError={(e) => (e.currentTarget.src = '/default-avatar.png')} 
            /> 
            <span className="text-xs text-gray-400 font-medium">{msg.nickname || msg.username || '匿名用户'}</span> 
          </div> 
        )} 
        {/* Message bubble */} 
        <div className={`max-w-[85%] px-3 py-1.5 rounded-lg text-sm shadow-sm break-words ${ 
          isLynnAI 
            ? 'bg-gradient-to-r from-purple-600/80 to-indigo-600/80 text-white rounded-bl-none self-start backdrop-blur-sm' 
            : isCurrentUser 
              ? 'bg-indigo-600/70 text-white rounded-br-none self-end backdrop-blur-sm' 
              : 'bg-teal-700/70 text-gray-100 rounded-bl-none self-start backdrop-blur-sm'
        }`}> 
          <span>{msg.message}</span> 
        </div> 
        {/* Timestamp - MODIFIED */} 
        {msg.timestamp && ( 
          <span className={`text-xs text-gray-500 mt-1 px-1 ${isCurrentUser ? 'self-end' : 'self-start'}`}> 
            {/* 调用新的格式化函数 */} 
            {formatChatMessageTimestamp(msg.timestamp)} 
          </span> 
        )} 
      </div> 
    );
  }
};

export default CommunityChatPanel; 