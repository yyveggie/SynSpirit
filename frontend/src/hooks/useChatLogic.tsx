import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import type { SearchResults, Article, Post } from '../services/contentSearchService';

// Message interface with displayContent
export interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  updated_at?: string;
  displayContent?: string;
  isTyping?: boolean;
  rawSearchResults?: SearchResults;
}

// Conversation interface (moved here for centralization)
export interface Conversation {
  id: number;
  title: string;
  user_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
}

// +++ Helper function to get initial conversation ID from localStorage +++
const getInitialStoredConversationId = (): number | null => {
  const storedId = localStorage.getItem('MAIN_CHAT_CONVERSATION_ID');
  if (storedId && storedId !== 'null' && storedId !== 'undefined') {
    const numId = parseInt(storedId, 10);
    return !isNaN(numId) ? numId : null;
  }
  return null;
};

// Custom Hook for Chat Logic
export const useChatLogic = (initialConversationIdFromProp: number | null = null, externalToken: string | null = null) => {
  // +++ Initialize currentConversationId from prop or localStorage +++
  const [currentConversationId, setCurrentConversationIdInternal] = useState<number | null>(() => {
    return initialConversationIdFromProp ?? getInitialStoredConversationId();
  });

  // Wrapper for setCurrentConversationId to also update localStorage
  const setCurrentConversationId = useCallback((id: number | null) => {
    setCurrentConversationIdInternal(id);
    if (id === null) {
      localStorage.removeItem('MAIN_CHAT_CONVERSATION_ID');
    } else {
      localStorage.setItem('MAIN_CHAT_CONVERSATION_ID', id.toString());
    }
  }, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingSpeed] = useState(10); // Typing speed (ms)
  const [userToken, setUserToken] = useState<string | null>(externalToken);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const stopStreamingRef = useRef(false);

  // +++ 编辑消息相关状态和函数定义提前 +++
  const [editingMessage, setEditingMessage] = useState<{ id: number; content: string } | null>(null);

  const startEditMessage = useCallback((messageId: number, content: string) => {
    const messageToEdit = messages.find(msg => msg.id === messageId && msg.role === 'user');
    if (messageToEdit) {
      setEditingMessage({ id: messageId, content: content });
    }
  }, [messages]);

  const cancelEditMessage = useCallback(() => {
    setEditingMessage(null);
  }, []);
  // +++ 结束提前定义 +++

  // --- Effects ---

  // Fetch conversations function (now inside hook)
  const fetchConversations = useCallback(async (token?: string | null) => {
    const effectiveToken = token || userToken;
    if (!effectiveToken) {
      // console.log("[useChatLogic] No token, cannot fetch conversations.");
      setConversations([]); // Clear conversations if no token
      return;
    }
    // console.log("[useChatLogic] Token found, fetching conversations...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
        headers: { 'Authorization': `Bearer ${effectiveToken}` }
      });
      if (!response.ok) throw new Error('获取对话列表失败');
      const data = await response.json();
      setConversations(data.conversations || []);
      // console.log("[useChatLogic] Fetched conversations:", data.conversations?.length);
    } catch (error) {
      // console.error('[useChatLogic] 获取对话列表错误:', error);
      setConversations([]); // Clear on error
      setApiError('获取对话列表时出错'); // Optionally set an error
    }
  }, [userToken]); // Depend on userToken from state

  // Update userToken when externalToken changes
  useEffect(() => {
    // console.log("[useChatLogic] External token changed:", externalToken ? "present" : "not present");
    setUserToken(externalToken);
    setIsAuthLoading(false); // Authentication is handled externally now
    
    // If we have a token, fetch conversations
    if (externalToken) {
      fetchConversations(externalToken);
    } else {
      // Clear conversations if no token
      setConversations([]);
    }
  }, [externalToken, fetchConversations]);

  // Effect for typewriter animation
  useEffect(() => {
    if (isTyping && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content) {
        if (typingIndex < lastMessage.content.length) {
          const typingTimer = setTimeout(() => {
            setMessages(prev => {
              const updated = [...prev];
              const lastMsg = updated[updated.length - 1];
              lastMsg.displayContent = lastMsg.content.substring(0, typingIndex + 1);
              return updated;
            });
            setTypingIndex(prev => prev + 1);
          }, typingSpeed);
          return () => clearTimeout(typingTimer);
        } else {
          setIsTyping(false);
        }
      }
    }
  }, [isTyping, typingIndex, messages, typingSpeed]);

  // Effect to scroll to bottom when messages change
  /* --- 修改：注释掉此处的 scrollIntoView 逻辑，将滚动控制移至 AICollapseChat.tsx ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);
  --- 结束修改 --- */

  // --- API & Logic Functions ---

  // Function to load a specific conversation
  const loadConversation = useCallback(async (conversationId: number, authToken?: string | null) => {
    if (!conversationId) return;
    // console.log(`[useChatLogic] Loading conversation: ${conversationId}`);
    setIsLoading(true);
    setApiError(null);
    try {
      const headers: Record<string, string> = {};
      const token = authToken || localStorage.getItem('token') || localStorage.getItem('userToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
        headers
      });
      if (!response.ok) {
        throw new Error(`加载对话失败: ${response.status}`);
      }
      const data = await response.json();
      if (data.messages) {
        const messagesWithDisplay = data.messages.map((msg: Message) => ({
          ...msg,
          displayContent: msg.content
        }));
        setMessages(messagesWithDisplay);
        setCurrentConversationId(conversationId); // +++ This will now also update localStorage +++
        // console.log(`[useChatLogic] Conversation ${conversationId} loaded successfully.`);
      } else {
        throw new Error('加载的对话数据格式不正确');
      }
    } catch (error) {
      console.error('加载对话错误:', error);
      setApiError(error instanceof Error ? error.message : '加载对话时发生未知错误。');
      setMessages([{
        role: 'assistant',
        content: `抱歉，加载对话 #${conversationId} 时出错。请稍后重试。`,
        displayContent: `抱歉，加载对话 #${conversationId} 时出错。请稍后重试。`
      }]);
      setCurrentConversationId(null); // +++ Ensure localStorage is cleared on error too +++
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setCurrentConversationId]); // Added setCurrentConversationId dependency

  // Function to send a message
  const handleSend = useCallback(async (
    inputText: string, 
    isSystemQuery?: boolean,
    authToken?: string | null,
    rawResults?: SearchResults,
    mode?: 'chat' | 'explore',
    editedMessageInfo?: { originalMessageId: number } | null 
  ) => {
    if (inputText.trim() === '' || isLoading) return null;

    stopStreamingRef.current = false; 
    setApiError(null);
    setIsLoading(true);
    
    let conversationHistory = [...messages];
    let newConversationIdForResponse = currentConversationId;

    // 如果正在编辑消息
    if (editingMessage && editingMessage.id) {
      const messageIndex = conversationHistory.findIndex(msg => msg.id === editingMessage.id);
      if (messageIndex !== -1) {
        // 截断历史记录到被编辑消息之前
        conversationHistory = conversationHistory.slice(0, messageIndex);
      }
      // 清除编辑状态，因为我们要发送新的内容了
      // 注意：setEditingMessage(null) 应该在 AICollapseChat 中处理，当编辑后的消息被发送时。
      // 或者在这里清除，但要确保 AICollapseChat 中的输入框逻辑能正确响应。
      // 为简单起见，暂时依赖 AICollapseChat 清除。
    }
    
    // 将当前用户输入（无论是新消息还是编辑后的消息）添加到截断后的历史记录中
    // 注意：userMessage 的添加已移至 AICollapseChat.tsx 的 handleSend 中，
    // 这里不需要重复添加。handleSend 应该只负责发送请求和处理响应。
    // 但是，对于编辑场景，我们需要确保发送给后端的历史是正确的。

    // 构建请求体
    const requestBody: any = {
      message: inputText,
      conversation_id: currentConversationId, // Relies on currentConversationId being correctly set
      mode: mode || 'chat', // Default to chat mode
    };

    // +++ Add edit flags to requestBody if applicable +++
    if (editedMessageInfo && editedMessageInfo.originalMessageId) {
      requestBody.is_edit = true;
      requestBody.edited_message_id = editedMessageInfo.originalMessageId;
      console.log("[useChatLogic] Sending edited message:", requestBody);
    } else {
      console.log("[useChatLogic] Sending new message:", requestBody);
    }
    // +++ End add edit flags +++

    let createdNewConvId: number | null = null; 

    try {
      const token = authToken || localStorage.getItem('token') || localStorage.getItem('userToken');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 如果是编辑，我们需要发送截断后的历史作为上下文
      // 但当前后端 /api/chat 接口似乎只接受 message 和 conversation_id，
      // 它会从数据库加载历史。我们需要调整这一点。
      // 一个更简单的做法是：前端在编辑后，更新 messages 状态（截断并添加编辑后的消息），
      // 然后调用 handleSend。handleSend 内部再准备发送给后端的数据时，
      // 如果后端支持，可以传递一个 'previous_messages' 字段，或者后端依赖 conversation_id 并且
      // 前端确保在调用 handleSend 之前，messages 状态已经是"正确"的（即截断后的）。

      // 假设：AICollapseChat 在调用 handleSend (或其变体 for editing) 之前，
      // 已经处理好了 messages 状态 (截断 + 添加编辑后的消息)。
      // 所以这里的 conversationHistory 应该是最新的。

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API错误! 状态: ${response.status}`);
      }

      const conversationIdHeader = response.headers.get('X-Conversation-ID');
      if (conversationIdHeader) { // Check if header exists
        const newId = parseInt(conversationIdHeader, 10);
        if (!isNaN(newId)) {
            if (currentConversationId === null || currentConversationId !== newId) {
                setCurrentConversationId(newId); // +++ This updates state and localStorage +++
            }
            createdNewConvId = newId; 
        }
      }

      // Reset typing state before processing stream
      setTypingIndex(0);
      setIsTyping(false);

      // Add empty assistant message placeholder, include rawSearchResults if provided
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '', 
        displayContent: '', 
        rawSearchResults: isSystemQuery ? rawResults : undefined
      }]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("无法获取响应流");
      }

      let accumulatedContent = '';
      let done = false;

      while (!done) {
        if (stopStreamingRef.current) { // +++ 新增：检查是否需要停止
          console.log("[useChatLogic] Streaming stopped by user request.");
          if (reader && typeof reader.cancel === 'function') {
            await reader.cancel(); // 尝试取消流
          }
          // 在最后一条消息中标注已停止
          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages];
            const lastMessageIndex = updatedMessages.length - 1;
            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].role === 'assistant') {
              if (!updatedMessages[lastMessageIndex].content.endsWith("[已停止]")) {
                updatedMessages[lastMessageIndex].content += " [已停止]";
                updatedMessages[lastMessageIndex].displayContent = updatedMessages[lastMessageIndex].content;
              }
            }
            return updatedMessages;
          });
          break; // 跳出循环
        }

        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            accumulatedContent += chunk;
            setMessages(prevMessages => {
              const updatedMessages = [...prevMessages];
              const lastMessageIndex = updatedMessages.length - 1;
              if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].role === 'assistant') {
                updatedMessages[lastMessageIndex].content = accumulatedContent;
              }
              return updatedMessages;
            });
            if (!isTyping) {
              setIsTyping(true); // Start typing effect
            }
          }
        }
      }
      // Typing will naturally stop when index reaches content length
      // console.log("[useChatLogic] Streaming finished.");
      
      // If a new conversation was created, refresh the list
      if (createdNewConvId) {
          // console.log("[useChatLogic] New conversation detected after send, refreshing list...");
          // Use setTimeout to allow DB commit before fetching
          setTimeout(() => fetchConversations(token), 500); 
      }
      
      return currentConversationId ?? createdNewConvId;

    } catch (error) {
      // console.error('发送消息错误:', error);
      const errorMsg = error instanceof Error ? error.message : '发送消息时发生未知错误。';
      setApiError(errorMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: `抱歉，出错啦：${errorMsg}`, displayContent: `抱歉，出错啦：${errorMsg}` }]);
      return null;
    } finally {
      setIsLoading(false);
      // isTyping 会由 effect 根据 typingIndex 和 content 长度自然停止，或在停止时手动设置
      if (stopStreamingRef.current) {
        setIsTyping(false); // +++ 新增：如果已停止，确保 typing 状态也停止
      }
    }
  }, [isLoading, currentConversationId, isTyping, fetchConversations, setCurrentConversationId]); // Added setCurrentConversationId dependency

  // Function to start a new chat
  const createNewChat = useCallback(() => {
    setCurrentConversationId(null); 
    setMessages([]);  
    setApiError(null);
    setIsLoading(false);
    setIsTyping(false);
    setTypingIndex(0);
    stopStreamingRef.current = false; 
    cancelEditMessage(); // 现在 cancelEditMessage 已经定义了
  }, [setCurrentConversationId, cancelEditMessage]);

  // Function to handle API retry (simplified)
  const handleRetry = useCallback(() => {
    // console.log("[useChatLogic] Retrying...");
    setApiError(null);
    // Maybe send the last user message again or just provide a generic prompt?
    // For simplicity, let's just clear the error.
    // You could potentially trigger handleSend with the last user message here.
  }, []);

  // +++ 新增：停止生成的函数 +++
  const stopGenerating = useCallback(() => {
    console.log("[useChatLogic] Stop generating signal received.");
    stopStreamingRef.current = true;
  }, []);

  return {
    messages,
    setMessages, // Expose setter if needed by parent for direct manipulation (use with caution)
    currentConversationId,
    setCurrentConversationId, // Expose the new wrapper
    conversations, // <--- Return conversations state
    fetchConversations, // <--- Return fetch function
    isLoading,
    apiError,
    isTyping,
    messagesEndRef,
    handleSend,
    loadConversation,
    createNewChat,
    handleRetry,
    userToken,
    isAuthLoading, // <--- Return the new loading state
    stopGenerating, // +++ 新增：导出停止函数

    // +++ 新增：导出编辑相关状态和函数 +++
    editingMessage,
    startEditMessage,
    cancelEditMessage,
  };
}; 