/**
 * AICollapseChat.tsx
 * 
 * 此组件在首页顶部提供一个可折叠的AI对话框。
 * 
 * 功能:
 * - 在未展开时显示为一个空白的方块，没有文字和图标
 * - 点击时顺滑展开成对话界面
 * - 再次点击时顺滑收起
 * - 简洁的对话界面
 * - 透明化、毛玻璃效果设计
 * - 适配移动端和桌面端布局
 * - 支持通过"探索"按钮触发的站内内容搜索功能
 * - 使用localStorage保存统一的对话历史记录
 * - 支持创建新对话同时保留历史记录
 * - 用户可完全控制对话窗口的滚动位置（移除自动滚动）
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatLogic, Message } from '../hooks/useChatLogic';
import { useSimilarContentSearch } from '../hooks/useSimilarContentSearch';
import type { SearchResults } from '../services/contentSearchService';
// import { API_BASE_URL } from '../config'; // API_BASE_URL seems unused in this component
import { useAuth } from '../context/AuthContext';
import { useRecommendations } from '../context/RecommendationsContext';
import ReactMarkdown from 'react-markdown';
import { Edit3, XCircle } from 'lucide-react';

interface AICollapseChatProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

// 本地存储键名 - 单一频道
const MAIN_CHAT_STORAGE_KEY = 'lynn_main_chat_history';

const AICollapseChat: React.FC<AICollapseChatProps> = ({ isExpanded, onToggleExpand }) => {
  const { token, user } = useAuth();
  const { addRecommendationSet, clearAllRecommendations } = useRecommendations();
  
  const [isHovering, setIsHovering] = useState(false);
  const [isNewChatInProgress, setIsNewChatInProgress] = useState(false); // 用于精确控制新对话的存储逻辑
  const [isExploreNextMessage, setIsExploreNextMessage] = useState(false);

  const expandContainerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    setMessages,
    isLoading,
    isTyping,
    handleSend: sendChatMessage, // isKnowledgeBaseSearch 参数由 sendChatMessage 内部处理或忽略
    createNewChat,
    stopGenerating,
    editingMessage,
    startEditMessage,
    cancelEditMessage,
    currentConversationId,
  } = useChatLogic();

  const {
    isSearching,
    searchSimilarContent,
  } = useSimilarContentSearch(token ?? undefined);

  // 主初始化 Effect
  useEffect(() => {
    try {
        let finalMessages: Message[] = [];
        const historyJSON = localStorage.getItem(MAIN_CHAT_STORAGE_KEY);
        if (historyJSON) {
            const parsedMessages = JSON.parse(historyJSON);
            finalMessages = parsedMessages.filter(
              (msg: Message) => !(msg.role === 'assistant' && msg.content.includes('你好！我是Lynn'))
            );
            // 不需要立即写回localStorage，除非确实过滤了消息
            if (finalMessages.length !== parsedMessages.length) {
                 localStorage.setItem(MAIN_CHAT_STORAGE_KEY, JSON.stringify(finalMessages));
            }
        }
        setMessages(finalMessages);
    } catch (error) {
      console.error('加载主聊天历史失败:', error);
      setMessages([]);
    }
    // When initializing, also ensure editingMessage is null if app reloads
    if (editingMessage) {
      cancelEditMessage(); // Clear edit state on component mount/reload
      setInput(''); // Clear input field if there was pending edit text
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect to populate input when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setInput(editingMessage.content);
      // Consider focusing the input field here:
      // inputRef.current?.focus(); (need to create inputRef)
    } else {
      // If editing is cancelled or finished, but input wasn't cleared by send, clear it.
      // This might conflict if user types something then cancels edit.
      // setInput(''); // Let's rely on specific actions (send/cancel) to clear input.
    }
  }, [editingMessage]);

  // 当展开/收起状态变化时处理消息
  useEffect(() => {
    if (!isExpanded) {
      // 收起时，不需要特殊处理
    } else {
      if (messages.length === 0) {
        // 不再自动从历史记录中恢复，保持当前状态
      }
    }
  }, [isExpanded]);

  // 消息变化时保存到本地存储
  useEffect(() => {
    // 仅当不是新对话创建过程中（例如，createNewChat刚清空了messages）才保存
    // 并且 messages 确实有内容，或者显式清空历史（通过 newChat 后 messages 为空）
    if (!isNewChatInProgress && (messages.length > 0 || localStorage.getItem(MAIN_CHAT_STORAGE_KEY) !== JSON.stringify(messages))) {
        localStorage.setItem(MAIN_CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages, isNewChatInProgress]);

  // 检测设备类型 - 保持不变
  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  const toggleExpand = () => onToggleExpand();

  // 核心：处理发送消息
  const handleSend = async () => {
    if (input.trim() === '' || isLoading || isSearching) return;
    
    const currentInput = input;
    // setInput(''); // Clear input after send, or after edit completion

    if (editingMessage) { // +++ Handle sending an EDITED message +++
      const originalMessageId = editingMessage.id;
      
      // 1. Update local messages state: truncate and update/add edited message
      setMessages(prevMessages => {
        const messageIndex = prevMessages.findIndex(m => m.id === originalMessageId);
        if (messageIndex === -1) {
          console.error("Original message to edit not found in local state. Cannot proceed with edit.");
          return prevMessages; // Return original messages if something is wrong
        }
        const historyUpToEditPoint = prevMessages.slice(0, messageIndex);
        const userEditedMessage: Message = { 
          ...prevMessages[messageIndex], 
          content: currentInput,
          displayContent: currentInput,
          id: originalMessageId, 
          updated_at: new Date().toISOString() 
        };
        return [...historyUpToEditPoint, userEditedMessage];
      });

      // +++ Add check for currentConversationId +++
      if (!currentConversationId) {
          console.error("[AICollapseChat] Cannot send edited message: currentConversationId is null.");
          // Update messages state to show error to user immediately
          setMessages(prev => [...prev, { 
              id: Date.now(), // Ensure a unique ID for this temporary error message
              role: 'assistant', 
              content: '编辑错误：当前对话ID丢失，无法发送编辑请求。请尝试刷新或开始新对话。', 
              displayContent: '编辑错误：当前对话ID丢失，无法发送编辑请求。请尝试刷新或开始新对话。'
          }]);
          cancelEditMessage(); // Clear editing state
          setInput(''); // Clear input
          // Ensure isLoading (if set by useChatLogic or elsewhere) is reset
          // This might need direct control or a callback if isLoading is managed solely within useChatLogic
          // For now, assuming setIsLoading(false) might be needed if sendChatMessage wasn't called.
          // However, sendChatMessage in useChatLogic handles its own isLoading.
          // The main concern is if AICollapseChat sets its own loading state.
          return; 
      }
      // +++ End check +++

      // 2. Send to backend with edit flags
      await sendChatMessage(currentInput, false, token ?? undefined, undefined, 'chat', { originalMessageId });
      
      // 3. Clean up edit state
      cancelEditMessage(); // This will set editingMessage to null
      setInput(''); // Clear input after successful edit send

    } else { // +++ Handle sending a NEW message (original logic) +++
      setIsNewChatInProgress(false); 

      const userMessage: Message = {
        id: Date.now(), 
        role: 'user',
        content: currentInput,
        displayContent: currentInput
      };
      setMessages(prev => [...prev, userMessage]);
      setInput(''); // Clear input after adding user message to list

      if (isExploreNextMessage) {
        setIsExploreNextMessage(false);
        try {
          const rawResults = await searchSimilarContent(currentInput);
          
          if (rawResults && (rawResults.articles.length > 0 || rawResults.posts.length > 0)) {
            const MAX_ITEMS_FOR_AI_AND_CARDS = 5; // 定义AI上下文和卡片显示的最大项目数
            
            // 挑选要发送给AI并显示在卡片上的项目
            const selectedArticles = rawResults.articles.slice(0, MAX_ITEMS_FOR_AI_AND_CARDS);
            const remainingSlots = MAX_ITEMS_FOR_AI_AND_CARDS - selectedArticles.length;
            const selectedPosts = remainingSlots > 0 ? rawResults.posts.slice(0, remainingSlots) : [];

            // 构建只包含选中项目的 SearchResults 对象，用于推荐卡片
            const resultsForDisplay: SearchResults = {
              articles: selectedArticles,
              posts: selectedPosts,
            };

            let titles = "";
            if (selectedArticles.length > 0) {
              titles += "相关文章标题： " + selectedArticles.map(a => `"${a.title}"`).join(", ") + ". ";
            }
            if (selectedPosts.length > 0) {
              titles += "相关帖子标题： " + selectedPosts.map(p => `"${p.title}"`).join(", ") + ".";
            }

            let enhancedPrompt = `关于您提到的 "${currentInput}"，我为您找到了一些相关内容。详细信息请直接查看下方为您推荐的卡片。`; // 默认提示
            if (titles) {
              const titleSummary = titles.length > 200 ? titles.substring(0, 197) + "..." : titles; // 调整截断长度
              enhancedPrompt = `关于 "${currentInput}"，我找到了一些似乎相关的内容（具体包括 ${titleSummary}）。更详细的信息和直接访问，请查看下方为您展示的推荐卡片。`;
            }
            
            // 使用筛选后的结果集更新推荐上下文
            addRecommendationSet(resultsForDisplay);
            await sendChatMessage(enhancedPrompt, true, token ?? undefined, resultsForDisplay, 'explore'); 
          } else {
            const noResultsMessage: Message = {
              id: Date.now() + 1, role: 'assistant',
              content: '抱歉，在我们的知识库中暂时没有找到与您问题直接相关的内容。不过，我会尝试用我的通用知识来回答您的问题。🧐',
              displayContent: '抱歉，在我们的知识库中暂时没有找到与您问题直接相关的内容。不过，我会尝试用我的通用知识来回答您的问题。🧐'
            };
            setMessages(prev => [...prev, noResultsMessage]);
            await sendChatMessage(currentInput, false, token ?? undefined, undefined, 'chat'); 
          }
        } catch (error) {
          console.error('探索模式处理失败:', error);
          const errorMessage: Message = {
            id: Date.now() + 1, role: 'assistant',
            content: '哎呀，探索功能出了一点小问题。我会尝试用通用知识回答您的问题。😅',
            displayContent: '哎呀，探索功能出了一点小问题。我会尝试用通用知识回答您的问题。😅'
          };
          setMessages(prev => [...prev, errorMessage]);
          await sendChatMessage(currentInput, false, token ?? undefined, undefined, 'chat'); 
        }
      } else {
        // 普通聊天，传递 mode: 'chat'
        await sendChatMessage(currentInput, false, token ?? undefined, undefined, 'chat');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleNewChat = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsNewChatInProgress(true); // 标记新对话开始
    localStorage.setItem(MAIN_CHAT_STORAGE_KEY, JSON.stringify([]));
    createNewChat(); // This should call setMessages([])
    setIsExploreNextMessage(false);
    // 确保 isNewChatInProgress 在 messages 实际更新 (通常是异步的) 后重置
    // 使用 setTimeout 确保它在当前事件循环之后执行
    setTimeout(() => setIsNewChatInProgress(false), 0); 
  };
  
  const handleToggleExplore = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsExploreNextMessage(prev => {
      const nextState = !prev;
      // 如果从 true 变为 false (即取消探索)，则清除推荐内容
      if (prev === true && nextState === false) {
        clearAllRecommendations();
      }
      return nextState;
    });
  };

  const handleLinkClick = (url: string) => {
    if (url.startsWith('/')) {
      const fullUrl = `${window.location.origin}${url}`;
      window.open(fullUrl, '_blank');
    } else {
      window.open(url, '_blank');
    }
  };

  const containerVariants = {
    collapsed: { 
      height: '56px', 
      transition: { 
        type: 'spring', 
        stiffness: 250, 
        damping: 25, 
        duration: 0.4
      }
    },
    expanded: { 
      height: isMobile ? '80vh' : '500px', 
      transition: { 
        type: 'spring', 
        stiffness: 250, 
        damping: 25, 
        duration: 0.4
      }
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      const element = chatContainerRef.current;
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  // 获取北京时间的问候语
  const getGreeting = () => {
    // 以东八区为准
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijing = new Date(utc + 8 * 60 * 60 * 1000);
    const hour = beijing.getHours();
    if (hour >= 5 && hour < 11) return '早上好';
    if (hour >= 11 && hour < 13) return '中午好';
    if (hour >= 13 && hour < 18) return '下午好';
    return '晚上好';
  };
  const nickname = user?.nickname || '朋友';

  // JSX 部分
  return (
    <motion.div
      ref={expandContainerRef}
      className={`${isExpanded ? 'bg-transparent' : 'bg-black/15'} ${isExpanded ? '' : 'backdrop-blur-md'} ${isExpanded ? '' : 'rounded-lg'} overflow-hidden relative mb-4 ${
        !isExpanded && isHovering ? 'chat-glow-active' : '' // 调整悬停效果类名，如果需要
      }`}
      style={{ 
        cursor: isExpanded ? 'default' : 'pointer',
        boxShadow: isExpanded ? 'none' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
      }}
      initial="collapsed"
      animate={isExpanded ? 'expanded' : 'collapsed'}
      variants={containerVariants}
      onClick={!isExpanded ? toggleExpand : undefined}
      onMouseEnter={() => { if (!isExpanded) setIsHovering(true); }}
      onMouseLeave={() => { if (!isExpanded) setIsHovering(false); }}
      layout // Framer Motion layout prop
    >
      {/* 边框向外散发效果 - 当收起和悬停时显示 */}
      {!isExpanded && (
        <AnimatePresence>
          {isHovering && (
            <>
              {/* 创建轻微的边框发光效果 */}
              <motion.div
                key="border-glow"
                className="absolute -inset-0.5 rounded-lg -z-10"
                style={{
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  filter: 'blur(1px)',
                }}
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0, 0.8, 0.5, 0.8, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              
              {/* 从边框向外散发的彩色粒子 */}
              {[...Array(24)].map((_, i) => {
                // 为每个粒子选择一个随机颜色
                const colors = [
                  'from-pink-400/30 to-purple-500/30',     // 粉紫色
                  'from-indigo-400/30 to-blue-500/30',     // 靛蓝色
                  'from-purple-400/30 to-indigo-500/30',   // 紫靛色
                  'from-violet-400/30 to-fuchsia-500/30',  // 紫红色
                  'from-blue-400/30 to-cyan-500/30',       // 蓝青色
                ];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                
                // 计算粒子在边框上的起始位置
                // 我们需要粒子从边框发散，所以先随机选一条边
                const edge = Math.floor(Math.random() * 4); // 0=上, 1=右, 2=下, 3=左
                
                // 起始位置（在边框上）
                let startTop, startLeft;
                
                // 根据边确定起始位置
                switch(edge) {
                  case 0: // 上边
                    startTop = 0;
                    startLeft = Math.random() * 100 + '%';
                    break;
                  case 1: // 右边
                    startTop = Math.random() * 100 + '%';
                    startLeft = '100%';
                    break;
                  case 2: // 下边
                    startTop = '100%';
                    startLeft = Math.random() * 100 + '%';
                    break;
                  case 3: // 左边
                  default:
                    startTop = Math.random() * 100 + '%';
                    startLeft = 0;
                    break;
                }
                
                // 散发方向（与起始边相对应，向外散发）
                let xMove, yMove;
                
                switch(edge) {
                  case 0: // 从上边向上散发
                    xMove = (Math.random() * 10) - 5; // 小幅左右偏移
                    yMove = -10 - Math.random() * 15; // 向上散发
                    break;
                  case 1: // 从右边向右散发
                    xMove = 10 + Math.random() * 15; // 向右散发
                    yMove = (Math.random() * 10) - 5; // 小幅上下偏移
                    break;
                  case 2: // 从下边向下散发
                    xMove = (Math.random() * 10) - 5; // 小幅左右偏移
                    yMove = 10 + Math.random() * 15; // 向下散发
                    break;
                  case 3: // 从左边向左散发
                  default:
                    xMove = -10 - Math.random() * 15; // 向左散发
                    yMove = (Math.random() * 10) - 5; // 小幅上下偏移
                    break;
                }
                
                return (
                  <motion.div
                    key={`border-particle-${i}`}
                    className={`absolute rounded-full bg-gradient-to-r ${randomColor} -z-10`}
                    style={{
                      width: `${3 + Math.random() * 5}px`,
                      height: `${3 + Math.random() * 5}px`,
                      top: startTop,
                      left: startLeft,
                      filter: 'blur(1.5px)',
                    }}
                    initial={{ 
                      opacity: 0,
                      scale: 0.6,
                      x: 0,
                      y: 0
                    }}
                    animate={{ 
                      opacity: [0, 0.8, 0],
                      scale: [0.6, 1, 0.4],
                      x: xMove,
                      y: yMove,
                    }}
                    transition={{
                      duration: 1.5 + Math.random(),
                      delay: i * 0.08,
                      repeat: Infinity,
                      repeatType: 'loop',
                      ease: "easeOut"
                    }}
                  />
                );
              })}
            </>
          )}
        </AnimatePresence>
      )}

      {/* 顶部标题栏/横幅 - 只在展开时显示 */}
      {isExpanded && (
        <div className="flex items-center justify-between p-3">
          {/* The following div containing the icon and "Lynn" text will be removed */}
          {/* <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <h3 className="text-white/90 font-medium text-base">Lynn</h3>
          </div> */}
          
          {/* 展开/收起按钮 */}
          <button 
            className="text-white/70 hover:text-white transition-colors p-1 rounded-full hover:text-white/90"
            onClick={(e) => {
              e.stopPropagation(); 
              toggleExpand();
            }}
            aria-label="收起对话"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 transition-transform duration-300 rotate-180" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
      
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div 
            className={`relative ${isExpanded ? 'h-[calc(100%-56px)]' : 'h-full'} flex flex-col`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }} key="expanded-content"
          >
            <motion.div 
              key="message-area-unified" // 单一消息区域
              initial={{ opacity: 0.8, y: 5 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2, ease: "easeInOut" }}
              ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-white/70 text-center">
                    <p className="text-xs text-white/50 mt-1">
                      Hi，你可以在任意输入的地方@Lynn来召唤我。
                    </p>
                  </div>
                </div>
              )}
              {messages.map((msg, index) => (
                <div key={msg.id ?? `msg-${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={
                      `max-w-[85%] px-4 py-2 text-sm relative group
                      ${msg.role === 'user' 
                        ? 'text-white' 
                        : 'text-white'
                      }`}>
                    {/* +++ Add Edit Button for user messages +++ */}
                    {msg.role === 'user' && !editingMessage && ( // Show only if not currently editing *another* message
                      <button 
                        onClick={() => {
                          if (msg.id) { // Ensure msg.id exists
                            startEditMessage(msg.id, msg.content);
                          }
                        }}
                        className="absolute -top-2 -left-2 p-0.5 bg-slate-700 hover:bg-slate-600 text-white/70 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        title="编辑此消息"
                        style={{ transform: 'scale(0.75)'}} // Make icon smaller
                      >
                        <Edit3 size={14} />
                      </button>
                    )}
                    {/* --- End Edit Button --- */}
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        children={msg.displayContent || ''}
                        components={{
                          a: ({node, href, ...props}) => {
                            if (href) {
                              return (
                                <a 
                                  href={href} 
                                  onClick={(e) => { 
                                    e.preventDefault(); 
                                    e.stopPropagation(); 
                                    handleLinkClick(href); 
                                  }}
                                  {...props}
                                  rel="noopener noreferrer"
                                />
                              );
                            }
                            return <a {...props} />;
                          }
                        }}
                      />
                    ) : (
                      (msg.displayContent || '').split('\n').map((line, i) => (
                        <span key={i} className="block" style={{ whiteSpace: 'pre-wrap' }}>{line}</span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </motion.div>

            <div className="p-3 flex-shrink-0">
              <motion.div key="input-area-unified"
                initial={{ opacity: 0.8, y: 3 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "circOut" }} className="relative flex items-center"
              >
                {/* 新的"探索"切换按钮 - 放在输入框左侧 */} 
                <button
                  onClick={handleToggleExplore}
                  className={`absolute left-3 z-10 px-3 py-1 rounded-full text-xs transition-all duration-200 ease-in-out transform active:scale-95
                    ${isExploreNextMessage 
                      ? 'bg-indigo-700 text-indigo-100 opacity-90 shadow-lg' // 激活：深靛蓝背景，浅靛蓝文字，轻微不透明，更强阴影
                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white' // 未激活：保持原样或微调
                    }`}
                  title={isExploreNextMessage ? "下次提问将搜索站内内容" : "点击以在下次提问时搜索站内内容"}
                >
                  探索
                </button>
                
                <input
                  type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={editingMessage ? "编辑消息内容..." : isExploreNextMessage ? "输入问题搜索站内..." : "输入问题与Lynn交流..."}
                  className="w-full pl-[70px] pr-24 py-2 bg-white/15 text-white placeholder-white/50 rounded-full focus:outline-none focus:ring-1 focus:ring-white/30 focus:bg-white/20 text-sm"
                  disabled={isLoading || isSearching}
                />
                
                {/* +++ Cancel Edit Button +++ */}
                {editingMessage && (
                  <button
                    onClick={() => {
                      cancelEditMessage();
                      setInput(''); // Clear input field on cancel
                    }}
                    className="absolute right-20 top-1/2 -translate-y-1/2 p-1.5 text-red-400 hover:text-red-300 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                    title="取消编辑"
                  >
                    <XCircle size={18} />
                  </button>
                )}

                {/* +++ 新增：停止生成按钮 +++ */}
                {(isLoading || isTyping) && (
                  <button
                    onClick={() => {
                      stopGenerating();
                    }}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1.5 text-white/70 hover:text-white/90 bg-white/10 rounded-full hover:bg-white/15 transition-colors"
                    title="停止生成"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {/* Pause Icon: Two vertical lines */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18.75V5.25M18 18.75V5.25" />
                    </svg>
                  </button>
                )}

                <button
                  onClick={handleNewChat}
                  className="absolute right-2 p-1.5 text-white/70 hover:text-white/90 bg-white/10 rounded-full hover:bg-white/15 transition-colors"
                  title="开始新对话"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            className="h-full flex items-center justify-center"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            transition={{ duration: 0.2 }} 
            key="collapsed-content" 
          />
        )}
      </AnimatePresence>

      {/* 在收起状态下显示问候语 */}
      {!isExpanded && (
        <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none">
          <span className="text-purple-300 text-base font-medium drop-shadow-md text-opacity-90">
            {`Hi，${nickname}，${getGreeting()}。尝试点击这里吧。`}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default AICollapseChat; 