import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import SideNavbar from '../components/SideNavbar';
import api from '../utils/api'; // 导入api工具
import { API_BASE_URL } from '../config'; // 导入API基础URL
import { useAuth } from '../context/AuthContext'; // Import useAuth to check login status
import axios from 'axios'; // Use axios for simplicity with interceptor
import { toast } from 'react-toastify'; // 导入 toast
import { useSidebar } from '../contexts/SidebarContext'; // <-- 导入 useSidebar
// --- 新增：重新导入 DynamicDetails --- 
import { DynamicDetails } from '../components/QuotedDynamicView'; 
// --- 结束新增 ---
import FollowStats from '../components/FollowStats'; // <-- 导入新组件

interface ProfilePageProps {
  isMe: boolean; // 由路由传递，指示是否是 /profile/me
}

interface UserData {
  id: number;
  email: string; // Keep for login reference if needed, but might hide from display
  is_active: boolean;
  is_admin: boolean;
  last_login: string | null;
  created_at: string;
  bio?: string | null;
  nickname?: string | null; // Add nickname
  avatar?: string | null; // 确认 avatar 字段存在
  tags?: string[]; // 用户标签数组
}

interface ArticleSummary {
    id: number;
    title: string;
    slug: string;
    summary?: string | null;
    content?: string; // For excerpt generation
    created_at: string;
    tags?: string[] | null;
    series_name?: string | null;
    series_articles?: any[] | null; // Keep type consistent with ArticleCard
}

interface PostSummary {
    id: number;
    title: string;
    slug: string; // 帖子详情页用 ID，但列表可能仍用 slug 预览？或者也改成 id
    content?: string; // For excerpt generation
    created_at: string;
    topic?: { // 帖子关联的主题信息
        id: number;
        name: string;
        slug: string;
    } | null;
    author: { id: number; }; // 只需要作者 ID 用于权限判断
}

type DynamicSummary = DynamicDetails;

// --- 新增：系列名称接口 --- 
interface SeriesSummary {
  series_name: string;
  // 可以添加文章数量等信息 (如果后端支持)
}
// --- 结束新增 ---

// --- 新增：通用分页组件 ---
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

// 调整Pagination组件的透明度
const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange, isLoading }) => {
  // 修改判断条件：只在 totalPages < 1 时不渲染
  if (totalPages < 1) { 
    console.warn("[Pagination] totalPages is less than 1, not rendering.", {totalPages});
    return null;
  }
  
  // 计算显示哪些页码按钮
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5; // 最多显示的页码数
    
    // --- 确保 totalPages === 1 时返回 [1] --- 
    if (totalPages === 1) {
      return [1];
    }
    // --- 结束修改 ---
    
    if (totalPages <= maxPagesToShow) {
      // 如果总页数少于最大显示数（且大于1），则显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // ... (处理多页的逻辑保持不变) ...
      pages.push(1);
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);
      if (endPage - startPage + 1 < 3) {
        if (startPage === 2) {
          endPage = Math.min(totalPages - 1, startPage + 2);
        } else if (endPage === totalPages - 1) {
          startPage = Math.max(2, endPage - 2);
        }
      }
      if (startPage > 2) {
        pages.push('...');
      }
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      if (endPage < totalPages - 1) {
        pages.push('...');
      }
      if (totalPages > 1) { // 这个判断其实可以移除，因为上面 totalPages === 1 的情况已处理
        pages.push(totalPages);
      }
    }
    
    return pages;
  };
  
  // --- 修改：当只有1页时，不显示箭头按钮 --- 
  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="flex items-center justify-center space-x-6 py-2 px-4 rounded-full pointer-events-auto min-w-[100px]"> 
        {/* 上一页按钮 - 仅在多页时显示 */} 
        {totalPages > 1 && (
          <button
            onClick={() => !isLoading && currentPage > 1 && onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            className={`text-2xl transition-colors duration-200 flex-shrink-0 ${
              currentPage === 1 || isLoading
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:text-indigo-300'
            }`}
            aria-label="上一页"
          >
            <span>&#8249;</span>
          </button>
        )}
        
        {/* 页码按钮容器 */}
        <div className="flex-grow flex items-center justify-center space-x-4">
          {getPageNumbers().map((page, index) => (
            <button
              key={index}
              onClick={() => !isLoading && typeof page === 'number' ? onPageChange(page) : null}
              disabled={typeof page !== 'number' || isLoading || page === currentPage} // 禁用当前页
              className={`text-lg transition-colors duration-200 min-w-[24px] text-center ${
                page === currentPage
                  ? 'text-indigo-300 font-bold cursor-default' // 当前页样式
                  : typeof page === 'number'
                  ? 'text-gray-200 hover:text-indigo-300'
                  : 'text-gray-500 cursor-default'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
        
        {/* 下一页按钮 - 仅在多页时显示 */}
        {totalPages > 1 && (
          <button
            onClick={() => !isLoading && currentPage < totalPages && onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            className={`text-2xl transition-colors duration-200 flex-shrink-0 ${
              currentPage === totalPages || isLoading
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:text-indigo-300'
            }`}
            aria-label="下一页"
          >
            <span>&#8250;</span>
          </button>
        )}
      </div>
      
      {/* 加载指示器 */}
      {isLoading && (
        <div className="absolute -top-7 left-1/2 transform -translate-x-1/2 flex items-center pointer-events-none">
          <div className="px-3 py-1 bg-gray-800/50 rounded-full flex items-center">
            <div className="w-3 h-3 rounded-full bg-indigo-400 animate-ping mr-2 opacity-75"></div>
            <span className="text-xs text-gray-300">加载中</span>
          </div>
        </div>
      )}
    </div>
  );
};
// --- 结束新增 ---

const ProfilePage: React.FC<ProfilePageProps> = ({ isMe }) => {
  const { user: currentUser, token, logout, updateUser } = useAuth(); // 重命名为 currentUser 避免混淆
  const { userId: userIdFromUrl } = useParams<{ userId?: string }>(); // 获取 URL 中的 userId 参数
  const { isSidebarOpen } = useSidebar(); // <-- 使用全局 Hook
  
  // --- 新增：判断是否为用户自己的主页 --- 
  const [isOwnProfile, setIsOwnProfile] = useState<boolean | null>(null); // null 表示尚未确定
  const [targetUserId, setTargetUserId] = useState<number | null>(null); // 要加载数据的用户 ID
  // --- 结束新增 ---
  
  const [userData, setUserData] = useState<UserData | null>(null);
  // --- 修改：确保初始状态为空数组 --- 
  const [myArticles, setMyArticles] = useState<ArticleSummary[]>([]); // 保持不变，文章加载逻辑似乎正常
  const [myPosts, setMyPosts] = useState<PostSummary[]>([]); // 确保初始为空
  const [myDynamics, setMyDynamics] = useState<DynamicSummary[]>([]); // 确保初始为空
  // --- 新增：系列状态 --- 
  const [mySeries, setMySeries] = useState<string[]>([]); 
  // --- 结束新增 ---
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false); // 改为 false，由 useEffect 控制
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);     // 改为 false，由 useEffect 控制
  const [isLoadingDynamics, setIsLoadingDynamics] = useState(false); // 改为 false，由 useEffect 控制
  // --- 新增：系列加载状态 --- 
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  // --- 结束新增 ---
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // --- State for Bio Editing ---
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  // --- End Bio Editing State ---

  // --- State for Nickname Editing ---
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  // --- End Nickname Editing State ---

  // --- 恢复：标签编辑状态 --- 
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagsArray, setTagsArray] = useState<string[]>([]); 
  const [newTagInput, setNewTagInput] = useState(''); 
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const tagsEditorRef = useRef<HTMLDivElement>(null);
  // --- 结束恢复 ---

  // --- 修改：当前激活的标签页状态，添加 'introduction' 并设为默认 ---
  const [activeTab, setActiveTab] = useState<'introduction' | 'articles' | 'posts' | 'dynamics' | 'series'>('introduction');
  // --- 结束修改 --

  // --- 新增：头像上传状态 --- 
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 用于触发文件选择
  // --- 结束新增 ---

  // --- 新增：useEffect 来判断 isOwnProfile 和 targetUserId --- 
  useEffect(() => {
    console.log("Determining targetUserId and isOwnProfile...");
    let idToLoad: number | null = null;
    let ownProfile = false;

    if (isMe) {
      console.log("isMe is true, using currentUser.id");
      if (currentUser) {
        idToLoad = currentUser.id;
        ownProfile = true;
      } else {
        console.warn("isMe is true but currentUser is null, redirecting to login");
        navigate('/login'); // Redirect to login if /me but not logged in
        return;
      }
    } else if (userIdFromUrl) {
      console.log(`Raw userIdFromUrl is: ${userIdFromUrl}`);
      // --- 修改：清理 userIdFromUrl，只取数字部分 --- 
      const cleanedUserIdString = userIdFromUrl.split(':')[0].trim(); // 取冒号前的部分并去除空格
      console.log(`Cleaned userId string: ${cleanedUserIdString}`);
      const parsedId = parseInt(cleanedUserIdString, 10); 
      // --- 结束修改 ---
      
      if (!isNaN(parsedId)) {
        console.log(`Parsed target user ID: ${parsedId}`);
        idToLoad = parsedId;
        ownProfile = !!currentUser && currentUser.id === parsedId;
      } else {
        console.error(`Invalid userId after cleaning: ${userIdFromUrl} -> ${cleanedUserIdString}`);
        setError('无效的用户ID格式。');
        setIsLoadingProfile(false);
        return;
      }
    } else {
      console.error("No user ID found (isMe=false, no userId in URL)");
      setError('未指定用户。');
      setIsLoadingProfile(false);
      return;
    }

    console.log(`Setting targetUserId=${idToLoad}, isOwnProfile=${ownProfile}`);
    setTargetUserId(idToLoad);
    setIsOwnProfile(ownProfile);
    // 仅当 isOwnProfile 首次被确定时（从 null 变为 true/false）才重置 isLoadingProfile?
    // 或者让 fetchUserData 自己处理
    // setIsLoadingProfile(false); // 可能不应该在这里设置

  }, [isMe, userIdFromUrl, currentUser, navigate]);

  // --- Function to fetch user data --- 
  const fetchUserData = useCallback(async () => {
    // 仅当 targetUserId 确定后才执行加载
    if (targetUserId === null) {
      console.log("fetchUserData: targetUserId is null, skipping fetch.");
      return; 
    }

    console.log(`fetchUserData called for targetUserId: ${targetUserId}, isOwnProfile: ${isOwnProfile}`);
    setIsLoadingProfile(true);
    setError('');
    setUserData(null); // Clear previous data

    let apiUrl = '';
    let headers: { [key: string]: string } = {};

    // 根据是否是自己的主页选择不同的 API 端点
    if (isOwnProfile) {
      console.log("Fetching own profile data...");
      apiUrl = `${API_BASE_URL}/api/users/profile`;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else {
      console.log("Fetching public profile data for user:", targetUserId);
      // --- 修改：确保 URL 正确，移除可能导致 `:1` 的错误拼接 --- 
      apiUrl = `${API_BASE_URL}/api/users/public/${targetUserId}`; 
      // 移除任何可能导致错误拼接的代码，比如附加分页参数
      console.log("Constructed public API URL:", apiUrl); 
      // 获取公共信息通常不需要 token
    }

    try {
      console.log(`Making API request to: ${apiUrl}`);
      const response = await axios.get(apiUrl, { headers });
      console.log("API Response received:", response);

      // --- 关键修改：根据 isOwnProfile 处理不同的响应结构 --- 
      let userObject: UserData | null = null;
      let isValidResponse = false;

        if (isOwnProfile) {
        // 自己的主页，期望数据在 response.data.user
        if (response.status === 200 && response.data && response.data.user && response.data.user.id) {
          userObject = response.data.user;
          isValidResponse = true;
        } else {
          console.warn('[Self Profile] Invalid response structure or missing user data:', response.data);
          setError('无法加载您的个人资料。');
        }
      } else {
        // 查看他人主页，期望数据直接在 response.data
        console.log('[Public Profile] Checking response data:', response.data); // 打印原始数据
        console.log('[Public Profile] Type of response.data:', typeof response.data); // 打印数据类型
        const publicData = response.data; // 赋值给变量以便检查

        // 更严格和明确的检查
        if (
          response.status === 200 && 
          publicData && 
          typeof publicData === 'object' && 
          typeof publicData.id === 'number' && 
          publicData.id > 0
        ) {
          console.log('[Public Profile] Condition PASSED.');
          userObject = publicData as UserData; // 明确断言类型
          isValidResponse = true;
        } else {
          // 如果条件失败，打印详细原因
          console.warn('[Public Profile] Condition FAILED. Checking details:', {
            isStatusOK: response.status === 200,
            isDataPresent: !!publicData,
            isDataAnObject: typeof publicData === 'object',
            isIdANumber: typeof publicData?.id === 'number',
            isIdPositive: publicData?.id > 0,
            responseData: publicData // 再次打印数据供检查
          });
          setError('无法加载该用户的公开资料。');
      }
      }

      // --- 最详细的检查 --- 
      console.log(`[Final Check] Before final if: isValidResponse = ${isValidResponse}, userObject ID = ${userObject?.id}`);
      
      // 如果响应有效，则更新状态
      if (isValidResponse && userObject) { 
        console.log("[Final Check] Entering final if block. User data processed successfully:", userObject);
        setUserData(userObject);
        setError(''); // 清除之前的错误
        
        // 只有在自己的主页才初始化编辑字段
        if (isOwnProfile) {
          setBioInput(userObject.bio || '');
          setNicknameInput(userObject.nickname || '');
          setTagsArray(userObject.tags || []);
        }
      } else {
         // 如果最终判断失败，也记录日志
         console.warn("[Final Check] Final if condition FAILED.", { isValidResponse, userObject });
      }
      // 如果响应无效，上面已经设置了错误状态，这里不再处理
      
    } catch (err: any) {
      console.error('获取用户资料失败:', err);
      if (axios.isAxiosError(err)) {
          console.error('Axios error details:', err.response?.status, err.response?.data);
          if (err.response?.status === 404) {
              setError('无法找到该用户。');
          } else if (err.response?.status === 401 && !isOwnProfile) {
              // If trying to access public profile but get 401, maybe endpoint needs auth?
              setError('无法访问该用户信息，可能需要权限。'); 
          } else if (err.response?.status === 401 && isOwnProfile) {
              // If fetching own profile fails with 401, likely token issue
              setError('认证失败，请重新登录。');
              logout(); // Log out if token is invalid
              navigate('/login');
          } else {
              setError(err.response?.data?.error || '加载用户信息时出错。');
          }
      } else {
          setError('加载用户信息时发生未知错误。');
      }
      setUserData(null); // Clear data on error
    } finally {
      console.log("Finished fetching user data, setting isLoadingProfile to false");
      setIsLoadingProfile(false);
    }
  // --- 修改：添加 isOwnProfile 和 token 作为依赖 --- 
  }, [targetUserId, isOwnProfile, token, navigate, logout]); // 依赖 targetUserId 和 isOwnProfile
  // --- 结束修改 ---

  // --- useEffect to trigger data fetching when targetUserId is set --- 
  useEffect(() => {
    if (targetUserId !== null) {
      console.log("targetUserId changed or component mounted with targetUserId. Resetting content and fetching profile.");
      // Fetch profile data when target user changes
      fetchUserData();
      
      // Reset content states ONLY when the target user ID actually changes
      console.log("Resetting content lists because targetUserId changed.");
      setActiveTab('introduction'); // Changed from 'articles' to 'introduction'
      setMyArticles([]);
      setMyPosts([]);
      setMyDynamics([]);
      setMySeries([]);
      setArticlesPage(1);
      setPostsPage(1);
      setDynamicsPage(1);
      setArticlesTotalPages(0);
      setPostsTotalPages(0);
      setDynamicsTotalPages(0);
    } else {
      console.log("targetUserId is null, waiting...");
    }
    // --- 关键修改：移除 fetchUserData 依赖 --- 
  }, [targetUserId]); // 只依赖 targetUserId

  // Fetch User Articles Data (已修改)
  useEffect(() => {
    // 只有在 isOwnProfile 和 targetUserId 都已确定后才执行获取
    if (isOwnProfile === null || targetUserId === null) {
        // console.log(`跳过 fetchUserData: isOwnProfile=${isOwnProfile}, targetUserId=${targetUserId}`);
        return; // 等待状态确定
    }

    const fetchUserData = async () => {
      // console.log(`执行 fetchUserData: isOwnProfile=${isOwnProfile}, targetUserId=${targetUserId}`);
      setIsLoadingProfile(true);
      try {
        let response;
        if (isOwnProfile) {
          if (!token) {
             setError('请先登录以查看您的个人资料');
             setIsLoadingProfile(false);
             return;
           }
           console.log("获取自己的资料 /api/users/profile");
           response = await axios.get(`${API_BASE_URL}/api/users/profile`, {
             headers: { 'Authorization': `Bearer ${token}` }
        });
        } else if (targetUserId) { // 确保 targetUserId 有效
           console.log(`获取用户 ${targetUserId} 的公开资料 /api/users/public/${targetUserId}`);
           // !!! 后端需要实现 GET /api/users/public/:userId 接口 !!!
           response = await axios.get(`${API_BASE_URL}/api/users/public/${targetUserId}`); 
        } else {
          throw new Error("无法确定要获取的用户 ID");
        }
        // ... (处理响应和错误的代码保持不变) ...
        if (response.data && response.data.user) {
          setUserData(response.data.user);
          setError(''); 
          if (isOwnProfile) { 
          setBioInput(response.data.user?.bio || '');
          setNicknameInput(response.data.user?.nickname || '');
          }
        } else {
          // throw new Error("服务器未返回有效的用户数据");
        }
      } catch (err: any) { // ... (错误处理保持不变) ... 
        console.error('获取用户资料失败:', err);
        if (err.response && err.response.status === 401 && isOwnProfile) {
          localStorage.removeItem('token');
          localStorage.removeItem('authUser');
          setError('登录已过期，请重新登录');
        } else if (err.response && err.response.status === 404) {
           setError("用户不存在或未公开"); 
        } else {
          const errorMessage = err.response?.data?.error || err.message || '获取用户资料失败';
          setError(errorMessage);
        }
        setUserData(null); 
      } finally {
        setIsLoadingProfile(false);
      }
    };
    
      fetchUserData();

  }, [isOwnProfile, targetUserId, token]); // 依赖 isOwnProfile, targetUserId 和 token

  // --- 新增：文章分页状态 ---
  const [articlesPage, setArticlesPage] = useState(1);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const [articlesTotalPages, setArticlesTotalPages] = useState(1);

  // --- 新增：帖子分页状态 ---
  const [postsPage, setPostsPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [postsTotalPages, setPostsTotalPages] = useState(1);

  // --- 新增：动态分页状态 ---
  const [dynamicsPage, setDynamicsPage] = useState(1);
  const [hasMoreDynamics, setHasMoreDynamics] = useState(true);
  const [isLoadingMoreDynamics, setIsLoadingMoreDynamics] = useState(false);
  const [dynamicsTotalPages, setDynamicsTotalPages] = useState(1);

  // --- 修改：获取用户文章数据 (支持分页) ---
  const fetchMyArticles = useCallback(async (pageToLoad: number = 1, forceRefresh = false) => {
    let loadingTimeout: NodeJS.Timeout | null = null;
    if (targetUserId === null) return;

    if (pageToLoad === 1) {
      loadingTimeout = setTimeout(() => setIsLoadingArticles(true), 300);
    } else {
      if (!forceRefresh && isLoadingMoreArticles) return;
      loadingTimeout = setTimeout(() => setIsLoadingMoreArticles(true), 300);
    }

    try {
      const limit = 10;
      const response = await axios.get<{ articles: ArticleSummary[]; pages?: number; total?: number }>(
        `${API_BASE_URL}/api/users/${targetUserId}/articles`,
        { params: { page: pageToLoad, limit: limit } }
      );
      if (loadingTimeout) clearTimeout(loadingTimeout);

      const newArticles = response.data.articles || [];
      const apiPages = response.data.pages;
      const apiTotal = response.data.total;
      let calculatedTotalPages = 1;
      if (apiPages !== undefined && apiPages > 0) {
          calculatedTotalPages = apiPages;
      } else if (apiTotal !== undefined && apiTotal >= 0) {
          calculatedTotalPages = Math.max(1, Math.ceil(apiTotal / limit));
      } else {
          // console.warn(`[Fetch articles] API did not return 'pages' or 'total'. Assuming 1 page.`);
      }
      // console.log(`[Fetch articles] API Response Data:`, response.data);
      // console.log(`[Fetch articles] Calculated Total Pages: ${calculatedTotalPages}`);
      
      setMyArticles(newArticles);
      setArticlesPage(pageToLoad);
      setHasMoreArticles(pageToLoad < calculatedTotalPages);
      setArticlesTotalPages(calculatedTotalPages);

    } catch (err: any) {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      console.error('获取文章失败:', err);
      setError(prev => prev || '获取文章列表失败');
      setHasMoreArticles(false);
      if (pageToLoad === 1) setMyArticles([]);
    } finally {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      setIsLoadingArticles(false);
      setIsLoadingMoreArticles(false);
    }
  }, [targetUserId, isLoadingMoreArticles]); 

  // --- 修改：初始加载文章 (依赖 activeTab) ---
  useEffect(() => {
    // 只有当 targetUserId 确定，且文章标签页激活时才考虑加载
    if (targetUserId !== null && activeTab === 'articles') {
       // 修改：移除 myArticles.length === 0 判断，切换到此tab就尝试加载第一页
       console.log('[ProfilePage] Articles tab active, initiating fetch page 1.');
       fetchMyArticles(1, false); // fetchMyArticles内部会处理是否正在加载
    }
    // 当 targetUserId 或 activeTab 变化时，此 effect 会重新评估
  }, [targetUserId, activeTab, fetchMyArticles]); // 移除 myArticles.length 依赖
  // --- 结束修改 ---

  // Fetch User Posts Data
  useEffect(() => {
    if (targetUserId === null) return; // 确保有目标用户 ID
    const fetchMyPosts = async () => {
      setIsLoadingPosts(true);
      try {
        // 使用 targetUserId 获取数据
        const response = await axios.get<{ posts: PostSummary[] }>(`${API_BASE_URL}/api/users/${targetUserId}/posts`);
        setMyPosts(response.data.posts || []);
      } catch (err: any) {
        console.error('获取帖子失败:', err);
        setError('获取帖子列表失败');
      } finally {
        setIsLoadingPosts(false);
      }
    };
        fetchMyPosts();
  }, [targetUserId]); // 依赖 targetUserId

  // Fetch User Dynamics Data
  useEffect(() => {
    if (targetUserId === null) return; // 确保有目标用户 ID
    const fetchMyDynamics = async () => {
      setIsLoadingDynamics(true);
      try {
        // 使用 targetUserId 获取数据
        const response = await axios.get<{ dynamics: DynamicSummary[] }>(`${API_BASE_URL}/api/users/${targetUserId}/dynamics`);
        setMyDynamics(response.data.dynamics || []);
      } catch (err: any) {
        console.error('获取动态失败:', err);
        setError('获取动态列表失败');
      } finally {
        setIsLoadingDynamics(false);
      }
    };
        fetchMyDynamics();
  }, [targetUserId]); // 依赖 targetUserId

  // Fetch User Series Data
  useEffect(() => {
    if (targetUserId === null || !isOwnProfile) return; // 只获取自己的系列列表
    const fetchMySeries = async () => {
      if (!token) return; // 获取自己的系列需要 token
      setIsLoadingSeries(true);
      try {
        // 假设获取系列名称的 API 总是获取当前登录用户的
        const response = await axios.get<{ series: string[] }>(`${API_BASE_URL}/api/users/series`, { 
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setMySeries(response.data.series || []);
      } catch (err: any) {
        console.error('获取系列列表失败:', err);
      } finally {
        setIsLoadingSeries(false);
      }
    };
        fetchMySeries();
  }, [targetUserId, isOwnProfile, token]); // 依赖 targetUserId, isOwnProfile, token

  const handleLogout = () => {
    logout(); // 使用AuthContext提供的logout方法
    navigate('/login');
  };
  
  // Helper to format date
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) {
      return '日期未知';
    }
    try {
      const date = new Date(dateString);
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        console.warn(`[formatDate] Invalid date string received: ${dateString}`);
        return '无效日期';
      }
      return date.toLocaleDateString('zh-CN');
    } catch (error) {
      console.error(`[formatDate] Error parsing date string: ${dateString}`, error);
      return '日期错误';
    }
  };

  // Combine loading states
  const isLoading = isLoadingProfile || isLoadingArticles || isLoadingPosts || isLoadingDynamics;

  // --- Handle Bio Save --- 
  const handleSaveBio = useCallback(async () => {
    if (!userData || !token) return; 
    console.log('[handleSaveBio] Starting save. Current userData:', userData);
    setIsSavingBio(true);
    setBioError(null);
    try {
        const response = await axios.put(`${API_BASE_URL}/api/users/profile`, 
          { bio: bioInput },
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        console.log('[handleSaveBio] Received response:', response);
        if (response.status === 200 && response.data.user) {
            console.log('[handleSaveBio] PUT Success. User data from response:', response.data.user);
            // 只更新bio字段，保留其他用户数据不变
            setUserData(prevData => {
              console.log('[handleSaveBio] Updating local userData. PrevData:', prevData);
              if (!prevData) return response.data.user;
              const newData = { ...prevData, bio: response.data.user.bio };
              console.log('[handleSaveBio] New local userData will be:', newData);
              return newData;
            });
            
            if (updateUser && currentUser) {
              console.log('[handleSaveBio] Updating global currentUser. Prev currentUser:', currentUser);
              // 对于全局用户状态也仅更新bio
              const newGlobalUser = { ...currentUser, bio: response.data.user.bio };
              console.log('[handleSaveBio] New global currentUser will be:', newGlobalUser);
              updateUser(newGlobalUser);
            }
            setIsEditingBio(false); // Exit editing mode on success
            toast.success("个性签名已保存！");
        } else {
            throw new Error(response.data?.error || "保存简介失败");
        }
    } catch (err: any) {
        console.error("Error saving bio:", err);
        const errorMsg = err.response?.data?.error || err.message || "保存简介时出错";
        setBioError(errorMsg);
        toast.error(`保存失败: ${errorMsg}`);
        // Don't exit editing mode on error
    } finally {
        setIsSavingBio(false);
    }
  }, [userData, token, bioInput, updateUser, currentUser]);

  // --- Handle Nickname Save --- 
  const handleSaveNickname = async () => {
      if (!userData || !token) return; 
      // If nicknameInput is the same as current nickname, don't make API call unless there was an error previously
      if (nicknameInput === (userData?.nickname || '') && !nicknameError) {
          setIsEditingNickname(false); // Just exit editing mode
          return;
      }
      
      console.log('[handleSaveNickname] Starting save. Current userData:', userData);
      setIsSavingNickname(true);
      setNicknameError(null); // Clear previous error before saving
      try {
          if (nicknameInput.length > 50) {
              throw new Error("昵称不能超过 50 个字符");
          }
          const response = await axios.put(`${API_BASE_URL}/api/users/profile`, 
            { nickname: nicknameInput || null }, // Send null if empty to potentially clear it
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          console.log('[handleSaveNickname] Received response:', response);
          if (response.status === 200) {
              console.log('[handleSaveNickname] PUT Success. User data from response:', response.data.user);
              const newNickname = response.data.user.nickname;
              setUserData(prevData => {
                console.log('[handleSaveNickname] Updating local userData. PrevData:', prevData);
                if (!prevData) return response.data.user; // Should ideally not happen if userData exists
                const newData = { ...prevData, nickname: newNickname };
                console.log('[handleSaveNickname] New local userData will be:', newData);
                return newData;
              });
              
              if (updateUser && currentUser) {
                console.log('[handleSaveNickname] Updating global currentUser. Prev currentUser:', currentUser);
                const newGlobalUser = { ...currentUser, nickname: newNickname };
                console.log('[handleSaveNickname] New global currentUser will be:', newGlobalUser);
                updateUser(newGlobalUser);
              }
              
              setIsEditingNickname(false); // Exit editing mode on success
              toast.success("昵称已更新！");
          } else {
              throw new Error(response.data?.error || "保存昵称失败");
          }
      } catch (err: any) {
          console.error("Error saving nickname:", err);
          const errorMsg = err.response?.data?.error || err.message || "保存昵称时出错";
          setNicknameError(errorMsg);
          // Do not exit editing mode on error, so user can correct
          toast.error(`保存失败: ${errorMsg}`);
      } finally {
          setIsSavingNickname(false);
      }
  };
  // --- End Handle Nickname Save ---

  // --- Add handlers for inline nickname editing ---
  const handleCancelNicknameEdit = () => {
    setIsEditingNickname(false);
    setNicknameInput(userData?.nickname || '');
    setNicknameError(null); // Clear any previous error
  };

  const handleNicknameEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveNickname();
    } else if (event.key === 'Escape') {
      handleCancelNicknameEdit();
    }
  };
  // --- End handlers for inline nickname editing ---

  // --- 恢复：标签处理函数 --- 
  // 初始化标签状态
  useEffect(() => {
    // 只有在查看自己的主页时才初始化编辑状态
    if (isOwnProfile && userData?.tags) {
      setTagsArray(userData.tags);
    } else if (!isOwnProfile) { // 如果查看他人主页，确保编辑状态是空的
      setTagsArray(userData?.tags || []); // 只显示，不用于编辑
    } else { // 自己主页但 userData 还未加载或无 tags
       setTagsArray([]);
    }
    // 重置编辑相关状态，防止残留
    setIsEditingTags(false);
    setNewTagInput('');
    setTagsError(null);
  }, [userData, isOwnProfile]);

  // 处理添加新标签
  const handleAddTag = useCallback(() => {
    const newTag = newTagInput.trim();
    setTagsError(null); 
    if (!newTag) return; 
    if (newTag.length > 15) { setTagsError('单个标签不能超过15个字符'); return; }
    if (newTag.includes(',')) { setTagsError('单个标签不能包含逗号'); return; }
    if (tagsArray.length >= 20) { setTagsError('最多只能添加20个标签'); return; }
    if (tagsArray.some(t => t.toLowerCase() === newTag.toLowerCase())) { setTagsError('该标签已存在'); return; }
    setTagsArray([...tagsArray, newTag]);
    setNewTagInput(''); 
  }, [newTagInput, tagsArray]);

  // 处理移除标签
  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTagsArray(prevTags => prevTags.filter(tag => tag !== tagToRemove));
    setTagsError(null); 
  }, []);

  // 处理保存用户标签
  const handleSaveTags = useCallback(async () => {
    if (!isEditingTags || !isOwnProfile || !token || isSavingTags) return; 
    if (tagsArray.length > 20) { setTagsError('最多只能添加20个标签'); return; }
    
    console.log('[handleSaveTags] Starting save. Current userData:', userData);
    console.log('[handleSaveTags] Tags to save:', tagsArray);
    setIsSavingTags(true);
    setTagsError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/update-tags`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
        body: JSON.stringify({ tags: tagsArray })
      });
       console.log('[handleSaveTags] Received fetch response object:', response);
       if (!response.ok) { 
          const errorBody = await response.text(); // Read body as text first
          console.error('[handleSaveTags] Save failed. Status:', response.status, 'Body:', errorBody);
          let errorMessage = '保存标签失败';
          try {
              const errorJson = JSON.parse(errorBody);
              errorMessage = errorJson.message || errorJson.error || errorMessage;
          } catch (e) { /* Ignore if body is not JSON */ }
          throw new Error(errorMessage);
       }
      
      const updatedUserDataResponse = await response.json();
      console.log('[handleSaveTags] PUT Success. Parsed JSON response:', updatedUserDataResponse);
      const updatedUserFromServer = updatedUserDataResponse.user;
      console.log('[handleSaveTags] User data from response:', updatedUserFromServer);

      // 只更新tags字段，保留其他用户数据不变
      setUserData(prevData => {
        console.log('[handleSaveTags] Updating local userData. PrevData:', prevData);
        if (!prevData) return updatedUserFromServer;
        const newData = { ...prevData, tags: updatedUserFromServer?.tags || [] };
        console.log('[handleSaveTags] New local userData will be:', newData);
        return newData;
      });
      
      // 更新 AuthContext 中的用户数据，仅更新tags
      if (updateUser && currentUser) {
         console.log('[handleSaveTags] Updating global currentUser. Prev currentUser:', currentUser);
        const newGlobalUser = { ...currentUser, tags: updatedUserFromServer?.tags || [] };
        console.log('[handleSaveTags] New global currentUser will be:', newGlobalUser);
        updateUser(newGlobalUser);
      }
      
      // 更新 tagsArray 状态 (虽然 userData 更新了，但为了同步性也更新)
      setTagsArray(updatedUserFromServer?.tags || []);
      console.log('[ProfilePage] Set tagsArray to:', updatedUserFromServer?.tags || []);
      
      setIsEditingTags(false); 
      setNewTagInput(''); 
      toast.success("标签已成功保存！"); 

    } catch (error) {
      console.error('保存标签出错:', error);
      const errorMsg = error instanceof Error ? error.message : '保存标签失败';
      setTagsError(errorMsg);
      toast.error(`保存标签失败: ${errorMsg}`); 
    } finally {
      setIsSavingTags(false);
    }
  }, [isEditingTags, isOwnProfile, token, tagsArray, isSavingTags, updateUser, currentUser, userData]); // Added userData dependency because it's logged

  // 处理点击外部保存标签
  useEffect(() => {
    if (!isEditingTags || isSavingTags || !isOwnProfile) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (tagsEditorRef.current && !tagsEditorRef.current.contains(event.target as Node)) {
        console.log('[ProfilePage - Click Outside] Saving tags...');
        handleSaveTags(); 
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [isEditingTags, isSavingTags, handleSaveTags, isOwnProfile]); 
  // --- 结束恢复 ---

  // --- 新增：头像上传状态 --- 
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      // 可选：添加文件大小或类型的前端校验
      if (file.size > 5 * 1024 * 1024) { // 限制 5MB
          setAvatarError('文件大小不能超过 5MB');
          return;
      }
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
           setAvatarError('请选择 JPG, PNG, 或 GIF 格式的图片');
           return;
      }
      setSelectedAvatar(file);
      setAvatarError(null);
      // 选中文件后立即触发上传
      handleAvatarUpload(file);
    } else {
      setSelectedAvatar(null);
    }
  };
  // --- 结束新增 ---

  // --- 新增：处理头像上传 --- 
  const handleAvatarUpload = async (fileToUpload: File | null) => {
    if (!fileToUpload || !token) {
      setAvatarError('没有选择文件或用户未登录');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);

    const formData = new FormData();
    formData.append('avatar', fileToUpload);

    try {
      const response = await axios.post<{ message: string; avatar_url: string }>(
        `${API_BASE_URL}/api/users/avatar`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data', // 重要：用于文件上传
          },
        }
      );

      if (response.status === 200 && response.data.avatar_url) {
        const newAvatarUrl = response.data.avatar_url;
        // 更新本地用户数据状态
        setUserData(prevData => prevData ? { ...prevData, avatar: newAvatarUrl } : null);
        // 更新 AuthContext 中的用户数据
        if (updateUser && currentUser) {
          updateUser({ ...currentUser, avatar: newAvatarUrl });
        }
        toast.success('头像上传成功！');
        setSelectedAvatar(null); // 清除选中的文件状态
      } else {
        throw new Error(response.data.message || '头像上传失败');
      }
    } catch (err: any) {
      console.error('头像上传失败:', err);
      const errorMsg = err.response?.data?.error || err.message || '头像上传失败';
      setAvatarError(errorMsg);
      toast.error(`头像上传失败: ${errorMsg}`);
    } finally {
      setIsUploadingAvatar(false);
    }
  };
  // --- 结束新增 ---

  // --- 触发文件选择的函数 ---
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  // --- 结束新增 ---

  // --- 添加：处理文章删除 ---
  const handleDeleteArticle = async (articleId: number, articleSlug: string, articleTitle: string) => {
    if (!token || !isOwnProfile) return; // 确保是自己的主页

    // 使用文章标题进行确认，更友好
    if (window.confirm(`您确定要删除文章 \"${articleTitle}\" 吗？此操作无法撤销。`)) {
      try {
        const response = await axios.delete(`${API_BASE_URL}/api/articles/${articleSlug}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          // 添加validateStatus配置
          validateStatus: function(status) {
            return true; // 不抛出任何HTTP错误，我们手动处理所有状态码
          }
        });

        if (response.status === 200 || response.status === 204) {
          // 删除成功，更新前端状态
          setMyArticles(prevArticles => prevArticles.filter(article => article.id !== articleId));
          toast.success('文章已成功删除！');
        } else if (response.status === 401) {
          // 特殊处理身份验证失败情况
          console.warn('删除文章时身份验证失败，但不自动登出');
          toast.error("身份验证失败，请刷新页面后重试。");
        } else {
          throw new Error(response.data?.error || "删除文章失败：服务器返回非成功状态码");
        }
      } catch (err: any) {
        console.error(`删除文章 ${articleSlug} 失败:`, err);
        const errorMsg = err.response?.data?.error || err.message || "删除文章时出错";
        toast.error(`删除失败: ${errorMsg}`);
      }
    }
  };
  // --- 结束：处理文章删除 ---

  // --- 新增：处理帖子删除
  const handleDeletePost = async (postId: number, postTitle: string) => {
    if (!token || !isOwnProfile) return; // 确保是自己的主页
    
    // 确认删除
    if (window.confirm(`您确定要删除帖子 \"${postTitle}\" 吗？此操作无法撤销。`)) {
      try {
        // 调用删除帖子的 API
        const response = await axios.delete(`${API_BASE_URL}/api/posts/${postId}`, { 
          headers: { 'Authorization': `Bearer ${token}` },
          // 添加validateStatus配置
          validateStatus: function(status) {
            return true; // 不抛出任何HTTP错误，我们手动处理所有状态码
          }
        });

        // 检查状态码
        if (response.status === 200 || response.status === 204) {
          // 更新帖子列表状态
          setMyPosts(prev => prev.filter(post => post.id !== postId));
          toast.success(`帖子 "${postTitle}" 已删除。`);
        } else if (response.status === 401) {
          // 特殊处理身份验证失败情况
          console.warn('删除帖子时身份验证失败，但不自动登出');
          toast.error("身份验证失败，请刷新页面后重试。");
        } else {
          throw new Error(response.data?.error || "删除帖子失败：服务器返回非成功状态码");
        }
      } catch (err: any) {
        console.error('删除帖子失败:', err);
        const errorMsg = err.response?.data?.error || err.message || '删除帖子失败';
        toast.error(`删除失败: ${errorMsg}`);
      }
    }
  };
  // --- 结束新增 ---

  // --- 新增：处理删除动态的函数
  const handleDeleteDynamic = async (actionId: number, contentPreview: string) => {
    if (window.confirm(`确定要删除这条动态吗？\n"${contentPreview.substring(0, 50)}${contentPreview.length > 50 ? '...' : ''}"`)) {
      try {
        // 调用删除 Action 的 API
        const response = await axios.delete(`${API_BASE_URL}/api/actions/${actionId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          // 添加一个validateStatus配置，允许所有状态码通过，我们在下面手动处理
          validateStatus: function(status) {
            return true; // 不抛出任何HTTP错误，我们手动处理所有状态码
          }
        });

        // 检查状态码
        if (response.status === 200 || response.status === 204) {
          // 更新动态列表状态
          setMyDynamics(prev => prev.filter(dyn => dyn.action_id !== actionId));
          toast.success("动态已删除。"); // 使用 toast 提示
        } else if (response.status === 401) {
          // 特殊处理身份验证失败情况
          console.warn('删除动态时身份验证失败，但不自动登出');
          toast.error("身份验证失败，请刷新页面后重试。");
        } else {
          throw new Error(response.data?.error || "删除动态失败：服务器返回非成功状态码");
        }
      } catch (err: any) {
        console.error('删除动态失败:', err);
        const errorMsg = err.response?.data?.error || err.message || '删除动态失败';
        toast.error(`删除失败: ${errorMsg}`);
      }
    }
  };
  // --- 结束新增 ---

  // --- 重新添加：getImageUrl 辅助函数 --- 
  const getImageUrl = (imagePath: string | null): string | undefined => {
    if (!imagePath) return undefined;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      if (imagePath.includes('cos.ap-shanghai.myqcloud.com')) {
        return `/api/proxy-image?url=${encodeURIComponent(imagePath)}`;
      }
      return imagePath;
    }
    if (imagePath.startsWith('/static')) {
      const urlParts = API_BASE_URL.split('/');
      const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
      return `${baseUrlWithoutPath}${imagePath}`;
    }
    if (imagePath.startsWith('uploads/')) {
         const urlParts = API_BASE_URL.split('/');
         const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
         return `${baseUrlWithoutPath}/static/${imagePath}`;
    }
    return imagePath; 
  };
  // --- 结束重新添加 ---

  // --- 新增：获取用户帖子数据 (支持分页) ---
  const fetchMyPosts = useCallback(async (pageToLoad: number = 1, forceRefresh = false) => {
      // ... (检查和日志保持不变) ...
      if (!forceRefresh && pageToLoad > 1 && isLoadingMorePosts) return;
      if (targetUserId === null) return;

      console.log(`[ProfilePage] Fetching posts page ${pageToLoad}, forceRefresh: ${forceRefresh}`);

      // 不直接设置加载中状态，而是延迟一下
      let loadingTimeout: NodeJS.Timeout | null = null;
      
      if (pageToLoad === 1) {
        loadingTimeout = setTimeout(() => {
          setIsLoadingPosts(true);
        }, 300);
        
        if (!forceRefresh) {
          console.log("[ProfilePage] Preparing to load page 1.");
          // 不立即清空列表
        }
      } else {
        loadingTimeout = setTimeout(() => {
          setIsLoadingMorePosts(true);
        }, 300);
      }

      try {
        const limit = 10; // 每页显示10项，方便管理分页
        const response = await axios.get<{ posts: PostSummary[]; pages?: number; total?: number }>(
            `${API_BASE_URL}/api/users/${targetUserId}/posts`,
            { params: { page: pageToLoad, limit: limit } }
        );

        // A取消加载超时
        if (loadingTimeout) clearTimeout(loadingTimeout);

        const newPosts = response.data.posts || [];
        
        // --- 关键：计算总页数并添加日志 ---
        const apiPages = response.data.pages;
        const apiTotal = response.data.total;
        let calculatedTotalPages = 1;
        if (apiPages !== undefined && apiPages > 0) {
            calculatedTotalPages = apiPages;
        } else if (apiTotal !== undefined && apiTotal >= 0) {
            calculatedTotalPages = Math.max(1, Math.ceil(apiTotal / limit));
        } else {
            console.warn(`[Fetch posts] API did not return 'pages' or 'total'. Assuming 1 page.`);
        }
        console.log(`[Fetch posts] API Response Data:`, response.data);
        console.log(`[Fetch posts] Calculated Total Pages: ${calculatedTotalPages}`);
        // --- 结束计算和日志 ---
        
        setMyPosts(newPosts);
        setPostsPage(pageToLoad);
        setHasMorePosts(pageToLoad < calculatedTotalPages);
        setPostsTotalPages(calculatedTotalPages); // 使用计算出的总页数

      } catch (err: any) {
        if (loadingTimeout) clearTimeout(loadingTimeout);
        
        console.error('获取帖子失败:', err);
        setError(prev => prev || '获取帖子列表失败');
        setHasMorePosts(false);
        if (pageToLoad === 1) setMyPosts([]);
      } finally {
        if (loadingTimeout) clearTimeout(loadingTimeout);
        
        setIsLoadingPosts(false);
        setIsLoadingMorePosts(false);
      }
  }, [targetUserId, isLoadingMorePosts]); 

  // --- 修改：初始加载帖子 (依赖 activeTab) ---
  useEffect(() => {
      if (targetUserId !== null && activeTab === 'posts') {
          // 修改：移除 myPosts.length === 0 判断
          console.log('[ProfilePage] Posts tab active, initiating fetch page 1.');
          fetchMyPosts(1, false);
      }
  }, [targetUserId, activeTab, fetchMyPosts]); // 移除 myPosts.length 依赖
  // --- 结束修改 ---

  // --- 新增：获取用户动态数据 (支持分页) ---
  const fetchMyDynamics = useCallback(async (pageToLoad: number = 1, forceRefresh = false) => {
      // ... (检查和日志保持不变) ...
      if (!forceRefresh && pageToLoad > 1 && isLoadingMoreDynamics) return;
      if (targetUserId === null) return;

      console.log(`[ProfilePage] Fetching dynamics page ${pageToLoad}, forceRefresh: ${forceRefresh}`);

      // 不直接设置加载中状态，而是延迟一下
      let loadingTimeout: NodeJS.Timeout | null = null;
      
      if (pageToLoad === 1) {
        loadingTimeout = setTimeout(() => {
          setIsLoadingDynamics(true);
        }, 300);
        
        if (!forceRefresh) {
          console.log("[ProfilePage] Preparing to load page 1.");
          // 不立即清空列表
        }
      } else {
        loadingTimeout = setTimeout(() => {
          setIsLoadingMoreDynamics(true);
        }, 300);
      }

      try {
        const limit = 10; // 每页显示10项，方便管理分页
        const response = await axios.get<{ dynamics: DynamicSummary[]; pages?: number; total?: number }>(
            `${API_BASE_URL}/api/users/${targetUserId}/dynamics`,
            { params: { page: pageToLoad, limit: limit } }
        );

        if (loadingTimeout) clearTimeout(loadingTimeout);

        const newDynamics = response.data.dynamics || [];
        
        // 过滤掉已删除的动态
        const filteredDynamics = newDynamics.filter(dynamic => !dynamic.is_deleted);
        console.log(`[Fetch dynamics] 过滤前: ${newDynamics.length}个动态, 过滤后: ${filteredDynamics.length}个动态`);
        
        // --- 关键：计算总页数并添加日志 ---
        const apiPages = response.data.pages;
        const apiTotal = response.data.total;
        let calculatedTotalPages = 1;
        if (apiPages !== undefined && apiPages > 0) {
            calculatedTotalPages = apiPages;
        } else if (apiTotal !== undefined && apiTotal >= 0) {
            calculatedTotalPages = Math.max(1, Math.ceil(apiTotal / limit));
        } else {
            console.warn(`[Fetch dynamics] API did not return 'pages' or 'total'. Assuming 1 page.`);
        }
        console.log(`[Fetch dynamics] API Response Data:`, response.data);
        console.log(`[Fetch dynamics] Calculated Total Pages: ${calculatedTotalPages}`);
        // --- 结束计算和日志 ---

        setMyDynamics(filteredDynamics);
        setDynamicsPage(pageToLoad);
        setHasMoreDynamics(pageToLoad < calculatedTotalPages);
        setDynamicsTotalPages(calculatedTotalPages); // 使用计算出的总页数

      } catch (err: any) {
        if (loadingTimeout) clearTimeout(loadingTimeout);
        
        console.error('获取动态失败:', err);
        setError(prev => prev || '获取动态列表失败');
        setHasMoreDynamics(false);
        if (pageToLoad === 1) setMyDynamics([]);
      } finally {
        if (loadingTimeout) clearTimeout(loadingTimeout);
        
        setIsLoadingDynamics(false);
        setIsLoadingMoreDynamics(false);
      }
  }, [targetUserId, isLoadingMoreDynamics]); 

  // --- 修改：初始加载动态 (依赖 activeTab) ---
  useEffect(() => {
      if (targetUserId !== null && activeTab === 'dynamics') {
          // 修改：移除 myDynamics.length === 0 判断
          console.log('[ProfilePage] Dynamics tab active, initiating fetch page 1.');
          fetchMyDynamics(1, false);
      }
  }, [targetUserId, activeTab, fetchMyDynamics]); // 移除 myDynamics.length 依赖
  // --- 结束修改 ---

  // 新增：Effect to reset page numbers when tab changes
  useEffect(() => {
    console.log(`[ProfilePage] Active tab changed to: ${activeTab}. Resetting pages.`);
    setArticlesPage(1);
    setPostsPage(1);
    setDynamicsPage(1);
    // 注意：这里不需要重新获取数据，因为各自的 useEffect 会在 activeTab 变化时
    // 判断是否需要获取第一页的数据。
  }, [activeTab]);

  // Restore the mainScrollRef definition
  const mainScrollRef = useRef<HTMLElement>(null); // Ref for the main scrolling element

  // Add ref for Bio editor
  const bioEditorRef = useRef<HTMLDivElement>(null);

  // Modify useEffect for click outside to save Bio
  useEffect(() => {
    if (!isEditingBio || isSavingBio || !isOwnProfile) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click is outside the bio editor area
      if (bioEditorRef.current && !bioEditorRef.current.contains(event.target as Node)) {
        console.log('[ProfilePage - Click Outside Bio] Attempting to save and exit...');
        // Attempt to save
        handleSaveBio(); 
        // Immediately exit editing mode regardless of save outcome
        setIsEditingBio(false); 
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // Ensure handleSaveBio is included in dependencies, as it's called here
  }, [isEditingBio, isSavingBio, handleSaveBio, isOwnProfile, bioEditorRef]);

  // --- 新增：处理 Bio 文本域的键盘事件（例如 Enter 保存，Esc 取消） ---
  const handleBioKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { // Cmd/Ctrl + Enter to save
      event.preventDefault(); // 防止换行
      handleSaveBio();
    } else if (event.key === 'Escape') { // Escape to cancel
      event.preventDefault();
      setIsEditingBio(false);
      setBioInput(userData?.bio || ''); // Reset to original bio
      setBioError(null);
    }
  };
  // --- 结束新增 ---

  // Ref for Bio editor container (for click outside)
  // ... existing code ...

  // Render profile page content
  return (
    <div className="flex flex-col min-h-screen text-black">
      <div className="flex flex-1 overflow-hidden">
        <SideNavbar /* 移除 isOpen prop */ />
        <main 
           ref={mainScrollRef} 
           className={`flex-1 transition-all duration-500 ease-out overflow-y-auto ${isSidebarOpen ? 'ml-48' : 'ml-0'} p-6 pb-16`} // 使用全局 isSidebarOpen
        >
          {isLoadingProfile && <p className="text-center py-10">正在加载个人资料...</p>}
          
          {userData ? (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6"> {/* 从mb-12减小到mb-6 */}
                <div className="flex flex-col md:flex-row md:items-start md:space-x-6"> {/* 从space-x-8减小到space-x-6 */}
                  {/* 头像部分 */}
                  <div className="flex flex-col items-center mb-4 md:mb-0"> {/* 从mb-6减小到mb-4 */}
                    {/* 移除原来的退出按钮，将放置在昵称旁边 */}
                    <div className={`relative ${isOwnProfile ? 'group cursor-pointer' : ''}`} 
                     onClick={isOwnProfile ? triggerFileInput : undefined}
                     title={isOwnProfile ? "点击更换头像" : undefined}
                     >
                   {isOwnProfile && (
                     <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                       {isUploadingAvatar ? (
                          <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                             <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                             <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                       )}
                     </div>
                   )}
                      
                      {/* 显示用户头像 */}
                      {userData.avatar ? (
                        <img 
                          src={userData.avatar} 
                          alt={`${userData.nickname || 'User'}'s avatar`} 
                          className="w-32 h-32 rounded-full object-cover border-2 border-indigo-600/50"
                        />
                      ) : (
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center text-black text-3xl font-bold border-2 border-indigo-600/50">
                          {(userData.nickname || userData.email || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                 </div>

                  {/* --- 在头像下方添加 FollowStats 组件 --- */}
                  {targetUserId !== null && isOwnProfile !== null && ( // 确保 targetUserId 和 isOwnProfile 已确定
                     <FollowStats
                       targetUserId={targetUserId}
                       isOwnProfile={isOwnProfile} // 直接使用 boolean
                     />
                  )}
                  
                {isOwnProfile && <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" />} 
                {avatarError && <p className="text-xs text-red-400 mt-1 text-center">{avatarError}</p>}
                  </div>

                  {/* 用户信息部分 */}
                  <div className="flex-1 flex flex-col">
                    {/* --- REPLACEMENT FOR NICKNAME DISPLAY AND EDIT TRIGGER --- */}
                    {isOwnProfile && !isEditingNickname && (
                      <div
                        className="group relative mb-0 cursor-pointer"
                        onClick={() => {
                          setNicknameInput(userData?.nickname || '');
                          setIsEditingNickname(true);
                          setNicknameError(null);
                        }}
                        title="点击编辑昵称"
                      >
                      <div className="flex items-center">
                          <h1 className="text-4xl md:text-5xl font-bold text-black inline break-all py-1">
                            {userData.nickname || <span className="italic text-gray-400">未设置昵称</span>}
                          </h1>
                          <span className="absolute -right-8 top-1/2 -translate-y-1/2 ml-2 text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </span>
                      </div>
                      </div>
                    )}
                    {!isOwnProfile && !isEditingNickname && (
                      // Display mode for other users' profiles (not clickable)
                      <div className="group relative mb-0 pointer-events-none"> {/* Changed mb-1 to mb-0 */}
                        <div className="flex items-center">
                          <h1 className="text-4xl md:text-5xl font-bold text-black inline break-all py-1">
                            {userData.nickname || <span className="italic text-gray-400">未设置昵称</span>}
                          </h1>
                    </div>
                      </div>
                    )}
                    {/* --- END REPLACEMENT --- */}
                    
                    {/* --- NICKNAME EDITING STATE --- */}
                    {isOwnProfile && isEditingNickname && (
                      <div className="mb-0 relative"> {/* Changed mb-1 to mb-0 */}
                                <input 
                                    type="text"
                                    value={nicknameInput}
                                    onChange={(e) => setNicknameInput(e.target.value)}
                          onBlur={() => {
                            if (!isSavingNickname) {
                              handleSaveNickname();
                            }
                          }}
                          onKeyDown={handleNicknameEditKeyDown}
                          className="text-4xl md:text-5xl font-bold text-black bg-transparent focus:outline-none border-b-2 border-indigo-500 w-full py-1"
                                    placeholder="设置您的昵称"
                                    maxLength={50}
                          autoFocus
                                    disabled={isSavingNickname}
                        />
                        {isSavingNickname && <span className="text-xs text-gray-400 absolute right-0 -bottom-5">保存中...</span>}
                            </div>
                )}
                    {/* Display nickname error if any, and not currently saving */}
                    {nicknameError && !isSavingNickname && <p className="text-xs text-red-400 mt-1 mb-0">{nicknameError}</p>} {/* Changed mb-1 to mb-0 */}
                    {/* --- END NICKNAME EDITING STATE --- */}

                    <p className="text-sm text-gray-400 mb-0">{userData.id ? `用户 ID: ${userData.id} · 用户自 ${new Date(userData.created_at).toLocaleDateString('zh-CN')} 加入` : ""}</p>

                    {/* --- 修改：Bio 编辑区域 (这部分将被移动到 'introduction' 标签页) --- */}
                    {/* THE ENTIRE BIO DISPLAY AND EDITING BLOCK THAT WAS HERE (approx lines 1450-1534) IS REMOVED */}
                    {/* --- 结束修改：Bio 编辑区域 --- */}
                    
                 {/* Remove the old separate Bio editor block */}

                    {/* 标签部分 */}
                <div className="mt-4"> {/* Changed from mt-0 to mt-4 */}
                  <div className="flex items-center mb-0">
                    {isOwnProfile && !isEditingTags && (!tagsArray || tagsArray.length === 0) && (
                        <h3 className="text-sm text-gray-600 mr-2">标签</h3>
                    )}
                  </div>
                  
                  {!isEditingTags ? (
                    <div 
                        className={`flex flex-wrap gap-1 ${isOwnProfile ? 'cursor-pointer min-h-[20px]' : 'min-h-[20px]'}`} 
                        onClick={() => isOwnProfile && setIsEditingTags(true)}
                        title={isOwnProfile ? "点击编辑标签" : undefined}
                    >
                        {(isOwnProfile ? tagsArray : (userData.tags || [])).map((tag, index) => (
                        <span 
                            key={index} 
                            className="px-2 py-0.5 text-xs font-medium text-indigo-100 rounded-full bg-indigo-600/70"
                        >
                            {tag}
                        </span>
                        ))}
                        {isOwnProfile && (!tagsArray || tagsArray.length === 0) && (
                           <span className="text-gray-500 text-xs italic">点击添加标签</span>
                        )}
                        {!isOwnProfile && (!userData.tags || userData.tags.length === 0) && (
                           <span className="text-gray-500 text-xs italic">暂无标签</span>
                        )}
                    </div>
                  ) : (
                    <div ref={tagsEditorRef} className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1 p-1.5 border border-gray-600/50 rounded-md bg-gray-700/30">
                           {tagsArray.map((tag, index) => (
                             <span key={index} className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-indigo-100 rounded-full bg-indigo-500/80">
                                {tag}
                                <button onClick={() => handleRemoveTag(tag)} className="ml-1 -mr-0.5 p-0.5 rounded-full inline-flex items-center justify-center text-indigo-200 hover:bg-indigo-400/50 hover:text-white focus:outline-none" aria-label={`移除标签 ${tag}`}>
                                   <svg className="h-2.5 w-2.5" stroke="currentColor" fill="none" viewBox="0 0 8 8"><path strokeLinecap="round" strokeWidth="1.5" d="M1 1l6 6m0-6L1 7" /></svg>
                                </button>
                             </span>
                           ))}
                           {tagsArray.length < 20 && (
                             <input type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => {if (e.key === 'Enter') {e.preventDefault(); handleAddTag();}}} placeholder="添加..." maxLength={15} className="inline-block flex-grow min-w-[60px] h-5 px-1 py-0.5 bg-transparent focus:outline-none sm:text-xs text-white placeholder-gray-400" />
                           )}
                           {tagsArray.length >= 20 && <span className="text-xs text-gray-400 italic">已达上限</span>}
                        </div>
                        {tagsError && <p className="text-xs text-red-400 mt-0.5">{tagsError}</p>}
                    </div>
                  )}
                </div>
                  </div>
                </div>
                </div>
                    
              <div className="mt-6 mb-6 border-b border-gray-300"> {/* 将mt-10和mb-8减小到mt-6和mb-6 */}
                <nav className="-mb-px flex space-x-6 justify-center md:justify-start" aria-label="Tabs">
                  {/* --- 新增：介绍标签按钮 --- */}
                  <button
                       key="introduction"
                       onClick={() => setActiveTab('introduction')}
                       className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors duration-200 
                         ${activeTab === 'introduction'
                      ? 'border-indigo-600 text-black'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-400'}`}
                  >
                       介 绍
                  </button>
                  {/* --- 结束新增 --- */}
                  {(isOwnProfile ? ['articles', 'posts', 'dynamics', 'series'] : ['articles', 'posts', 'dynamics']).map((tab) => (
                    <button
                       key={tab}
                       onClick={() => setActiveTab(tab as any)} // Cast 'tab' to any to satisfy the more specific type of setActiveTab temporarily
                       className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors duration-200 
                         ${activeTab === tab 
                      ? 'border-indigo-600 text-black'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-400'}`}
                >
                       {/* --- 修改：调整标签文本获取逻辑 --- */}
                       {tab === 'articles' ? '文 章' : tab === 'posts' ? '帖 子' : tab === 'dynamics' ? '动 态' : tab === 'series' ? '系 列' : '未知标签'}
                       {/* --- 结束修改 --- */}
                </button>
                  ))}
              </nav>
            </div>

              <div className="mt-4">
              {/* --- 新增：介绍标签页内容 --- */}
              {activeTab === 'introduction' && (
                <div className="min-h-[300px] relative pb-16"> {/* 与其他标签页保持类似结构 */}
                  {/* Bio Display and Edit Section - MOVED HERE */}
                  <div 
                    className={`relative group ${isOwnProfile && !isEditingBio ? 'cursor-pointer hover:bg-gray-500/10 p-3 rounded-md transition-colors duration-150' : 'p-3'}`}
                    onClick={() => {
                      if (isOwnProfile && !isEditingBio && !isSavingBio) {
                        setBioInput(userData?.bio || '');
                        setIsEditingBio(true);
                        setBioError(null);
                      }
                    }}
                    ref={bioEditorRef} // Ref for click outside
                  >
                    {/* Display Bio */}
                    {!isEditingBio && (
                      <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap break-words">
                        {userData?.bio ? (
                          <p>{userData.bio}</p>
                        ) : (
                          <p className="italic text-gray-400">
                            {isOwnProfile ? "点击添加你的个人介绍..." : "用户暂未填写个人介绍"}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Edit Bio Textarea (only if isOwnProfile and isEditingBio) */}
                    {isOwnProfile && isEditingBio && (
                      <div className="mt-1">
                        <textarea
                          value={bioInput}
                          onChange={(e) => setBioInput(e.target.value)}
                          onKeyDown={handleBioKeyDown} // Use new handler for Enter/Escape
                          onBlur={(e) => {
                            // Prevent saving if the click is on a save/cancel button or inside editor
                            // This check might need refinement if there are explicit save/cancel buttons
                            if (bioEditorRef.current && !bioEditorRef.current.contains(e.relatedTarget as Node)) {
                              // Only save on blur if not currently in saving process
                              // and if the content has actually changed.
                              if (!isSavingBio && bioInput !== (userData?.bio || '')) {
                                handleSaveBio();
                              } else if (bioInput === (userData?.bio || '')) {
                                // If content hasn't changed, just exit editing mode
                                setIsEditingBio(false);
                                setBioError(null);
                              }
                            }
                          }}
                          placeholder="输入你的个人介绍..."
                          rows={6}
                          maxLength={1000} // Example maxLength
                          className="w-full p-2 text-sm text-black bg-gray-100/50 border border-gray-300/50 rounded-md focus:outline-none resize-y placeholder-gray-400"
                          autoFocus
                        />
                        {bioError && <p className="text-xs text-red-400 mt-0.5">{bioError}</p>}
                        {/* Optional: Add explicit Save/Cancel buttons if desired for better UX */}
                        {/* <div className="mt-2 flex justify-end space-x-2">
                          <button onClick={handleSaveBio} disabled={isSavingBio} className="px-3 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50">
                            {isSavingBio ? '保存中...' : '保存'}
                          </button>
                          <button onClick={() => { setIsEditingBio(false); setBioInput(userData?.bio || ''); setBioError(null); }} className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                            取消
                          </button>
                        </div> */}
                      </div>
                    )}
                    {/* Edit Icon (only if isOwnProfile and not editing) */}
                    {isOwnProfile && !isEditingBio && (
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* --- 结束新增：介绍标签页内容 --- */}
              {activeTab === 'articles' && (
                  <div className="space-y-2 min-h-[300px] relative pb-16">
                    {/* 内容过渡动画 */}
                    <div className={`transition-opacity duration-300 ${isLoadingArticles ? 'opacity-70' : 'opacity-100'}`}>
                      {myArticles.length > 0 ? (
                          myArticles.map(article => (
                            <div key={article.id} className="py-2 px-2 border-b border-gray-700/30 flex justify-between items-center group relative hover:bg-gray-700/20 rounded-md transition-colors duration-150">
                              {/* 左侧：标题 */}
                              <Link 
                                to={`/article/${article.slug}`}
                                className="text-gray-700 hover:text-blue-600 truncate flex-grow mr-4"
                                title={article.title}
                              >
                                {article.series_name && <span className="text-xs text-purple-500 mr-1">[{article.series_name}]</span>}
                                {article.title}
                              </Link>
                              {/* 右侧：日期和按钮 */}
                              <div className="flex items-center space-x-3 flex-shrink-0">
                                {/* 日期始终显示 */}
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                  {formatDate(article.created_at)}
                                </span>
                                {/* 编辑和删除按钮 (仅自己可见，hover时显示) */}
                                {isOwnProfile && (
                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <button
                                    onClick={() => navigate(`/edit-article/${article.slug}`)}
                                    className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-gray-600/50"
                                    title="编辑文章"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteArticle(article.id, article.slug, article.title)}
                                    className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-gray-600/50"
                                    title="删除文章"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                  </button>
                                </div>
                                )}
                              </div>
                            </div>
                          ))
                      ) : !isLoadingArticles ? (
                          <p className="text-gray-400 text-center py-4">{isOwnProfile ? '您还没有发布任何文章。' : '该用户还没有发布任何文章。'}</p>
                      ) : null}
                    </div>
                    
                    {/* 加载状态指示器 */}
                    {isLoadingArticles && myArticles.length === 0 && (
                      <div className="absolute inset-0 flex justify-center items-center">
                        <div className="flex flex-col items-center">
                          <svg className="animate-spin h-8 w-8 text-indigo-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-gray-400">加载文章中...</p>
                        </div>
                      </div>
                    )}
                  </div>
              )}
              {activeTab === 'posts' && (
                  <div className="space-y-2 min-h-[300px] relative pb-16">
                    {/* 内容过渡动画 */}
                    <div className={`transition-opacity duration-300 ${isLoadingPosts ? 'opacity-70' : 'opacity-100'}`}>
                      {myPosts.length > 0 ? (
                          myPosts.map(post => (
                            <div key={post.id} className="py-2 px-2 border-b border-gray-700/30 flex justify-between items-center group relative hover:bg-gray-700/20 rounded-md transition-colors duration-150">
                              {/* 左侧：标题 */}
                              <Link 
                                to={`/posts/${post.slug}`}
                                className="text-gray-700 hover:text-blue-600 truncate flex-grow mr-4"
                                title={post.title}
                              >
                                {post.title}
                              </Link>
                              {/* 右侧：日期和按钮 */}
                              <div className="flex items-center space-x-3 flex-shrink-0">
                                {/* 日期始终显示 */}
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                  {formatDate(post.created_at)}
                                </span>
                                {/* 编辑和删除按钮 (仅自己可见，hover时显示) */}
                                {isOwnProfile && (
                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <button
                                    onClick={() => navigate(`/edit-post/${post.id}`)} 
                                    className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-gray-600/50"
                                    title="编辑帖子"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeletePost(post.id, post.title)}
                                    className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-gray-600/50"
                                    title="删除帖子"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                  </button>
                                </div>
                                )}
                              </div>
                            </div>
                          ))
                      ) : !isLoadingPosts ? (
                          <p className="text-gray-400 text-center py-4">{isOwnProfile ? '您还没有发布任何帖子。' : '该用户还没有发布任何帖子。'}</p>
                      ) : null}
                    </div>
                    
                    {/* 加载状态指示器 */}
                    {isLoadingPosts && myPosts.length === 0 && (
                      <div className="absolute inset-0 flex justify-center items-center">
                        <div className="flex flex-col items-center">
                          <svg className="animate-spin h-8 w-8 text-indigo-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-gray-400">加载帖子中...</p>
                        </div>
                      </div>
                    )}
                  </div>
              )}
              {activeTab === 'dynamics' && (
                  <div className="space-y-2 min-h-[300px] relative pb-16">
                    {/* 内容过渡动画 */}
                    <div className={`transition-opacity duration-300 ${isLoadingDynamics ? 'opacity-70' : 'opacity-100'}`}>
                      {myDynamics.length > 0 ? (
                          myDynamics.map(dynamic => {
                            // 移除调试代码
                            return (
                            // 修改：添加 group hover 背景，调整内部布局
                            <div key={dynamic.action_id} className="py-3 px-2 border-b border-gray-700/30 flex justify-between items-start group relative hover:bg-gray-700/20 rounded-md transition-colors duration-150">
                              {/* 左侧内容 */}
                              <div className="flex-grow mr-4">
                                  {/* 根据动态类型显示不同内容 */}
                                  {dynamic.target_type === 'user' ? (
                                    /* 原创动态 */
                                    (() => {
                                      console.log("ProfilePage: Rendering original dynamic:", JSON.stringify(dynamic));
                                      return (
                                        <div>
                                          <span className="text-sm text-green-600">
                                            发布了原创动态
                                          </span>
                                          {dynamic.share_comment && (
                                            <p className="text-gray-700 text-sm mt-1 whitespace-pre-wrap break-words">
                                              {dynamic.share_comment}
                                            </p>
                                          )}
                                          {/* 如果有图片，显示第一张图片预览 */}
                                          {dynamic.images && dynamic.images.length > 0 && (
                                            <div className="mt-2">
                                              <img 
                                                src={getImageUrl(dynamic.images[0])} 
                                                alt="动态图片"
                                                className="max-h-32 rounded-md object-cover"
                                              />
                                              {dynamic.images.length > 1 && (
                                                <span className="text-xs text-gray-400 ml-2">
                                                  还有 {dynamic.images.length - 1} 张图片
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    /* 分享/转发动态 */
                                    <div>
                                <span className="text-sm text-gray-600">
                                  分享了 {dynamic.target_type === 'article' ? '文章:' : dynamic.target_type === 'post' ? '帖子:' : '内容:'}
                                </span>
                                {dynamic.target_slug && dynamic.target_title && dynamic.target_type && (
                                  <Link 
                                    to={dynamic.target_type === 'article' ? `/article/${dynamic.target_slug}` : `/posts/${dynamic.target_slug}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline ml-1 font-medium"
                                  >
                                    "{dynamic.target_title}"
                                  </Link>
                                )}
                                {dynamic.share_comment && (
                                  <p className="text-gray-700 text-sm mt-1 pl-2 border-l-2 border-gray-600/50 whitespace-pre-wrap break-words">
                                    {dynamic.share_comment}
                                  </p>
                                      )}
                                    </div>
                                )}
                              </div>
                              {/* 右侧日期和删除按钮 */}
                              <div className="flex flex-col items-end flex-shrink-0 space-y-1">
                                {/* 日期始终显示 */}
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                  {formatDate(dynamic.shared_at)} 
                                </span>
                                {/* 删除按钮仅在自己主页hover时显示 */}
                                {isOwnProfile && (
                                  <button
                                    onClick={() => handleDeleteDynamic(dynamic.action_id, dynamic.share_comment || '')} 
                                    className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-gray-600/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200" // 保持 hover 显示
                                    title="删除动态"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            );
                          })
                      ) : !isLoadingDynamics ? (
                          <p className="text-gray-400 text-center py-4">{isOwnProfile ? '您还没有发布任何动态。' : '该用户还没有发布任何动态。'}</p>
                      ) : null}
                    </div>
                    
                    {/* 加载状态指示器 (保持不变) */}
                    {isLoadingDynamics && myDynamics.length === 0 && (
                      <div className="absolute inset-0 flex justify-center items-center">
                        <div className="flex flex-col items-center">
                          <svg className="animate-spin h-8 w-8 text-indigo-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-gray-400">加载动态中...</p>
                        </div>
                      </div>
                    )}
                  </div>
              )}
                 {activeTab === 'series' && isOwnProfile && (
                     <div className="space-y-3">
                         {isLoadingSeries ? (
                             <p className="text-gray-600 text-center py-4">加载系列中...</p>
                         ) : mySeries.length > 0 ? (
                             mySeries.map((seriesName, index) => (
                                 <div key={index} className="py-2 border-b border-gray-700/30">
                                     <span className="text-gray-700">{seriesName}</span>
                                     {/* TODO: 可能添加编辑/删除系列的按钮 */} 
            </div>
                             ))
                         ) : (
                             <p className="text-gray-600 text-center py-4">您还没有创建任何系列。</p>
                         )}
          </div>
                 )}
              </div>
              
              {/* 将分页组件的渲染移回 main 容器内，移除外部条件 */}
              {/* 将分页组件移回 main 容器内，放在所有 tab 内容之后 */}
              { (activeTab === 'articles' && articlesTotalPages > 1) ||
                (activeTab === 'posts' && postsTotalPages > 1) ||
                (activeTab === 'dynamics' && dynamicsTotalPages > 1) ? (
                  <Pagination 
                    currentPage={
                      activeTab === 'articles' ? articlesPage :
                      activeTab === 'posts' ? postsPage :
                      dynamicsPage // 'dynamics' is the last possibility here
                    }
                    totalPages={
                      activeTab === 'articles' ? articlesTotalPages :
                      activeTab === 'posts' ? postsTotalPages :
                      dynamicsTotalPages // 'dynamics' is the last possibility here
                    }
                    onPageChange={(page) => {
                      if (activeTab === 'articles') fetchMyArticles(page, false);
                      else if (activeTab === 'posts') fetchMyPosts(page, false);
                      else if (activeTab === 'dynamics') fetchMyDynamics(page, false);
                    }}
                    isLoading={
                      activeTab === 'articles' ? (isLoadingArticles || isLoadingMoreArticles) :
                      activeTab === 'posts' ? (isLoadingPosts || isLoadingMorePosts) :
                      (isLoadingDynamics || isLoadingMoreDynamics)
                    }
                  />
              ) : null }
            </div> 
          ) : (
            !isLoadingProfile && <p className="text-center text-red-400 py-10">{error || "无法加载用户信息"}</p>
        )}
      </main>
      
      {/* Click Outside Save for Bio */}
      {/* This useEffect should now work correctly due to useCallback on handleSaveBio */}
      {/* useEffect(() => { ... }, [isEditingBio, isSavingBio, handleSaveBio, isOwnProfile]); */}
    </div>
  </div>
  );
};

export default ProfilePage;