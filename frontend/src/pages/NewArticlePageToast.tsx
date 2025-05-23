/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 此文件定义了创建或编辑文章页面的 React 组件，使用Toast UI Editor替代CKEditor。
 *
 * 主要功能:
 * - 提供富文本编辑器或其他表单供用户输入新文章的标题、内容、摘要、分类、标签等。
 * - 支持封面图片上传。
 * - 处理文章所属系列的管理。
 * - 提交新文章或更新后的文章数据到后端 API。
 * - 根据路由参数判断是创建新文章还是编辑现有文章。
 *
 * 注意: 这是ToastUI Editor版本的文章编辑页面，用于替代基于CKEditor的版本。
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
// 已移除: import Navbar from "../components/Navbar";
import SideNavbar from '../components/SideNavbar';
import ToastEditorWrapper from '../components/ToastEditorWrapper';
import { useSidebar } from '../contexts/SidebarContext';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 
 * 注意: 导航栏组件(Navbar和SideNavbar)已移至全局布局，不需要在页面组件中引入
 * 文章数据接口定义
 * 用于接收和发送文章相关的API数据
 */
interface ArticleData {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  cover_image?: string;
  is_published?: boolean;
  series_name?: string;
  series_order?: number;
}

// 分类选项
const categoryOptions = ["AI发展", "投资", "未来", "心理", "理性", "时间"];

const NewArticlePageToast: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const isEditing = Boolean(slug);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [coverImage, setCoverImage] = useState<File | string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [initialDataLoading, setInitialDataLoading] = useState(isEditing);
  
  const [userSeries, setUserSeries] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [newSeriesName, setNewSeriesName] = useState<string>('');
  const [seriesLoading, setSeriesLoading] = useState<boolean>(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const navigate = useNavigate();
  const { token, user, isLoading: authLoading } = useAuth();
  const { isSidebarOpen } = useSidebar();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 定义useCallback函数处理编辑器内容变化
  const handleEditorChange = useCallback((data: string) => {
    setContent(data);
  }, []);

  // 认证检查
  useEffect(() => {
    // 只有当认证状态加载完成后才进行检查
    if (!authLoading) {
      if (!token) {
        console.log("没有检测到登录令牌，跳转到登录页面");
        const from = isEditing ? `/edit-article/${slug}` : '/new-article-toast';
        navigate('/login', { state: { from } });
      } else if (!user) {
        console.log("令牌存在但未获取到用户信息");
        const from = isEditing ? `/edit-article/${slug}` : '/new-article-toast';
        navigate('/login', { state: { from } });
      } else {
        console.log("用户已登录:", user.email);
        // 用户已登录，可以继续
      }
      setAuthChecking(false); // 认证检查完成
    }
  }, [token, user, navigate, authLoading, isEditing, slug]);

  // 如果是编辑模式，获取文章数据
  useEffect(() => {
    if (isEditing && slug && token) {
      const fetchArticleData = async () => {
        setInitialDataLoading(true);
        setError(null);
        try {
          const response = await axios.get<ArticleData>(`${API_BASE_URL}/api/articles/slug/${slug}`, {
             headers: { 'Authorization': `Bearer ${token}` }
          });
          console.log("获取到的文章数据:", response.data);
          const articleData = response.data;
          setTitle(articleData.title || '');
          setContent(articleData.content || '');
          setCategory(articleData.category || '');
          
          // 标签处理：确保标签数据干净且格式正确
          if (articleData.tags && Array.isArray(articleData.tags)) {
            // 清理标签：移除每个标签中的特殊字符（#, [], "", 等）
            const cleanedTags = articleData.tags
              .map(tag => String(tag).trim())                   // 确保是字符串并去除前后空格
              .map(tag => tag.replace(/^#+/, ''))               // 移除开头的#号
              .map(tag => tag.replace(/[\[\]"']/g, ''))        // 移除[]和引号
              .filter(tag => tag.length > 0);                   // 过滤空标签
              
            console.log('清理后的标签:', cleanedTags);
            // 使用中文逗号连接，符合用户习惯
            setTags(cleanedTags.join('，')); 
          } else {
            console.log('文章没有标签或标签格式不正确:', articleData.tags);
            setTags('');
          }
          
          if (articleData.cover_image) {
            setCoverImage(articleData.cover_image);
            setCoverPreview(articleData.cover_image);
          }
          setSelectedSeries(articleData.series_name || '');
        } catch (err: any) {
          console.error('Error fetching article data for editing:', err);
          setError(err.response?.data?.error || err.message || '无法加载文章数据进行编辑');
        } finally {
          setInitialDataLoading(false);
        }
      };
      fetchArticleData();
    }
  }, [isEditing, slug, token]);

  // 获取用户系列
  useEffect(() => {
    const fetchSeries = async () => {
      if (!token || token === 'undefined' || authChecking) return;
      
      setSeriesLoading(true);
      setSeriesError(null);
      try {
        console.log("开始获取用户系列，令牌:", token.substring(0, 10) + "...");
        const response = await axios.get(`${API_BASE_URL}/api/articles/user/series`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log("获取到的系列数据:", response.data);
        
        if (response.data && Array.isArray(response.data.series_names)) { 
          setUserSeries(response.data.series_names || []);
        } else {
          console.warn("系列数据格式异常:", response.data);
          setUserSeries([]);
        }
      } catch (err: any) {
        console.error("获取系列失败:", err);
        if (err.response && err.response.status === 401) {
          setSeriesError("登录已过期，请重新登录");
        } else {
          setSeriesError("无法加载您的系列列表");
        }
      } finally {
        setSeriesLoading(false);
      }
    };

    if (token && token !== 'undefined' && !authChecking) {
      fetchSeries();
    }
  }, [token, authChecking]);

  // 处理表单提交
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    // 表单验证
    if (!title.trim()) {
      setError('请输入文章标题');
      setIsLoading(false);
      return;
    }

    if (!content.trim()) {
      setError('请输入文章内容');
      setIsLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      
      if (category) {
        formData.append('category', category);
      }
      
      // 始终处理标签，即使标签字段为空也发送一个空标签数组
      // 这确保编辑时可以清除标签
      const tagArray = tags 
        ? tags
            .replace(/，/g, ',')                          // 将中文逗号替换为英文逗号以统一处理
            .split(',')                                   // 根据英文逗号分割
            .map(tag => tag.trim())                       // 去除前后空格
            .map(tag => tag.replace(/^#+/, ''))           // 移除开头的#号
            .map(tag => tag.replace(/[\[\]"']/g, ''))     // 移除[]和引号
            .filter(tag => tag.length > 0)                // 过滤空标签
        : [];
        
      // 修复：处理标签数组，确保清空现有标签时也正确处理
      // 如果标签数组为空，添加一个空字符串标签，告诉后端清除所有标签
      if (tagArray.length === 0 && isEditing) {
        console.log('清空所有标签');
        formData.append('tags', ''); // 明确告诉后端清空标签
      } else {
        // 每个标签单独添加一个'tags'字段
        tagArray.forEach(tag => {
          formData.append('tags', tag);
        });
      }
      
      // 添加调试日志
      console.log('解析并清理后的标签数组:', tagArray);
      
      // 处理系列
      if (selectedSeries === '新建系列' && newSeriesName.trim()) {
        formData.append('series_name', newSeriesName.trim());
      } else if (selectedSeries && selectedSeries !== '无' && selectedSeries !== '新建系列') {
        formData.append('series_name', selectedSeries);
      }
      
      // 处理封面图片
      if (coverImage instanceof File) {
        console.log('正在上传封面图片文件:', (coverImage as File).name);
        // 修复：使用正确的字段名 'cover_image' 而不是 'cover_image_file'
        formData.append('cover_image', coverImage);
      } else if (typeof coverImage === 'string' && isEditing) {
        // 保留现有封面图片URL
        console.log('保留现有封面图片:', coverImage);
        formData.append('keep_cover_image', 'true');
        // 显式传递现有的封面图片URL，确保后端能正确处理
        formData.append('existing_cover_image', coverImage);
      }

      // 记录发送的FormData内容，用于调试
      console.log('提交的FormData内容:');
      // 使用Array.from处理FormData迭代
      const formDataEntries = Array.from(formData.entries());
      formDataEntries.forEach(([key, value]) => {
        if (key !== 'cover_image') { // 不输出大型二进制数据
          console.log(`${key}: ${value}`);
        } else {
          console.log(`${key}: [文件数据]`);
        }
      });

      const url = isEditing 
        ? `${API_BASE_URL}/api/articles/${slug}` 
        : `${API_BASE_URL}/api/articles/`;
      
      const method = isEditing ? 'put' : 'post';
      
      const response = await axios({
        method,
        url,
        data: formData,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        }
      });

      setSuccess(isEditing ? '文章更新成功!' : '文章创建成功!');
      
      // 更新后使相关缓存失效，确保下次访问获取最新数据
      if (isEditing && slug) {
        console.log(`[NewArticlePageToast] 使文章缓存失效: ${slug}`);
        // 使特定文章的缓存失效
        queryClient.invalidateQueries({ queryKey: ['articleDetails', slug] });
      }
      
      // 延迟跳转，让用户看到成功消息
      setTimeout(() => {
        navigate(`/article/${response.data.slug}`);
      }, 1500);
      
    } catch (err: any) {
      console.error('Error submitting article:', err);
      setError(err.response?.data?.error || '提交文章失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理封面图片变更
  const handleCoverImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setCoverImage(file);
      
      console.log('选择了新封面图片:', file.name, '大小:', (file.size / 1024).toFixed(2), 'KB');
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const preview = reader.result as string;
        setCoverPreview(preview);
        console.log('封面预览已生成');
      };
      reader.readAsDataURL(file);
    }
  };

  // 清除封面图片
  const clearCoverImage = () => {
    setCoverImage(null);
    setCoverPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 加载中状态
  if (authChecking || (isEditing && initialDataLoading)) {
    return (
      <div style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-base-color)',
        backgroundImage: 'var(--bg-gradient)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div className="animate-spin text-white">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        </div>
      </div>
    );
  }

  if (error && !isEditing && !initialDataLoading) { // Show fatal error if loading failed during edit
      return (
          <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
              {/* 移除Navbar组件 */}
              <div className="flex flex-1 overflow-hidden">
                  {/* 移除SideNavbar组件 */}
                  <main className={`flex-1 px-4 pt-2 pb-4 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
                      <div className="bg-red-700 text-white p-4 rounded shadow-lg text-center">
                          <p className="text-lg font-semibold">出错了</p>
                          <p>{error}</p>
                          <button 
                              onClick={() => navigate(isEditing ? `/article/${slug}` : '/articles')} 
                              className="mt-3 bg-white text-red-700 px-4 py-2 rounded"
                          >
                              {isEditing ? '返回文章' : '返回列表'}
                          </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-gray-100">
      {/* 移除Navbar组件 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 移除SideNavbar组件 */}
        <main className={`flex-1 px-4 pt-2 pb-4 transition-all duration-300 ease-in-out overflow-y-auto ${isSidebarOpen ? 'lg:ml-56' : 'ml-0'}`}>
          <h1 className="text-2xl font-bold mb-4">{isEditing ? '编辑文章' : '创建新文章'}</h1>
          {error && <div className="bg-red-700 text-white p-3 rounded mb-4">{error}</div>}
          {success && <div className="bg-green-700 text-white p-3 rounded mb-4">{success}</div>}

          <form
            onSubmit={handleSubmit}
            className="bg-gray-850/70 p-6 rounded-lg shadow-xl"
            onKeyDown={(e) => {
              // 只允许提交按钮的回车提交表单
              if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName !== 'BUTTON') {
                // 只有在textarea中且同时按下Shift键时才允许换行
                if (!(e.target.tagName === 'TEXTAREA' && e.shiftKey)) {
                  e.stopPropagation();
                }
              }
            }}
          >
            <div className="mb-4">
              <label htmlFor="title" className="block text-gray-200 mb-2 font-medium">
                文章标题
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                required
                className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                placeholder="输入文章标题..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5 mb-6">
              <div>
                <label htmlFor="category" className="block text-gray-200 mb-2 text-sm font-medium">
                  文章分类
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- 选择分类 --</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tags" className="block text-gray-200 mb-2 text-sm font-medium">
                  标签 (用逗号分隔多个标签)
                </label>
                <input
                  type="text"
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 text-sm focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                  placeholder="支持中英文逗号，如：AI，机器学习,数据分析"
                />
                <p className="mt-1 text-xs text-gray-400">输入单个标签或用逗号分隔多个标签，无需添加#或其他字符</p>
              </div>

              <div>
                <label htmlFor="series" className="block text-gray-200 mb-2 text-sm font-medium">
                  所属系列
                </label>
                <select
                  id="series"
                  value={selectedSeries}
                  onChange={(e) => setSelectedSeries(e.target.value)}
                  className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- 无 --</option>
                  {userSeries.map((series) => (
                    <option key={series} value={series}>
                      {series}
                    </option>
                  ))}
                  <option value="新建系列">+ 新建系列</option>
                </select>
                {seriesError && <p className="mt-1 text-red-500 text-xs">{seriesError}</p>}

                {selectedSeries === '新建系列' && (
                  <div className="mt-2">
                    <label htmlFor="newSeries" className="sr-only">
                      新系列名称
                    </label>
                    <input
                      type="text"
                      id="newSeries"
                      value={newSeriesName}
                      onChange={(e) => setNewSeriesName(e.target.value)}
                      className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-gray-100 text-sm focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                      placeholder="输入新系列名称"
                    />
                  </div>
                )}
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                 <label className="block text-gray-200 mb-2 text-sm font-medium">
                   封面图片
                 </label>
                 <div className="flex items-center space-x-3">
                   <input
                     type="file"
                     ref={fileInputRef}
                     onChange={handleCoverImageChange}
                     accept="image/*"
                     className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                   />
                   {coverPreview && (
                     <button
                       type="button"
                       onClick={clearCoverImage}
                       className="py-1 px-3 bg-red-600 text-white rounded text-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                     >
                       清除
                     </button>
                   )}
                 </div>
                 {coverPreview && (
                   <div className="mt-3">
                     <img src={coverPreview} alt="Cover preview" className="max-h-32 rounded" />
                   </div>
                 )}
               </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-200 mb-2 font-medium">
                文章内容
              </label>
              <ToastEditorWrapper
                initialData={content}
                onChange={handleEditorChange}
                token={token}
                placeholder="开始写作..."
              />
            </div>

            <div className="flex justify-end mt-6">
              <button
                type="submit"
                disabled={isLoading || authChecking || initialDataLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              >
                {isLoading ? '正在提交...' : (isEditing ? '更新文章' : '发布文章')}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default NewArticlePageToast; 