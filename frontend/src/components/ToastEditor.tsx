/**
 * ToastEditor.tsx - 富文本编辑器组件
 * 
 * 功能描述:
 * - 基于Toast UI Editor实现的富文本编辑器
 * - 提供Markdown和WYSIWYG(所见即所得)两种编辑模式
 * - 支持文本格式化(粗体、斜体、下划线、标题等)
 * - 支持图片上传至服务器
 * - 支持LaTeX公式渲染(优化渲染体验，减少刷新感)
 * - 支持视频嵌入(YouTube、Bilibili)(优化嵌入体验，减少刷新感)
 * - 支持自定义文本颜色
 * 
 * 技术实现:
 * - 使用@toast-ui/react-editor作为基础
 * - 使用KaTeX渲染数学公式
 * - 自定义工具栏和编辑器行为
 * - 防止表单误提交和编辑器内容错误渲染
 * - 优化了LaTeX公式和视频嵌入的渲染过程，减少明显的刷新感
 */
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
// 引入中文语言包
import '@toast-ui/editor/dist/i18n/zh-cn';
import axios from 'axios';
import { API_BASE_URL } from '../config';
// 引入KaTeX相关样式
import 'katex/dist/katex.min.css';
import katex from 'katex';
// 引入颜色选择器相关样式和插件
import 'tui-color-picker/dist/tui-color-picker.css';
import '@toast-ui/editor-plugin-color-syntax/dist/toastui-editor-plugin-color-syntax.css';
import colorSyntax from '@toast-ui/editor-plugin-color-syntax';

//=============================================================================
// 类型定义
//=============================================================================

/**
 * 视频平台类型枚举
 */
enum VideoPlatform {
  YouTube = 'youtube',
  Bilibili = 'bilibili',
  Unknown = 'unknown'
}

/**
 * 视频信息接口
 */
interface VideoInfo {
  platform: VideoPlatform;
  videoId: string;
  embedUrl: string; 
}

/**
 * 编辑器属性接口
 */
interface ToastEditorProps {
  initialData?: string;         // 初始内容
  onChange: (data: string) => void; // 内容变化回调
  token: string | null;         // 用户认证令牌
  onReady?: (editor: any) => void; // 编辑器就绪回调
  placeholder?: string;         // 占位符文本 - 已弃用
  height?: string;              // 编辑器高度
  initialEditType?: 'markdown' | 'wysiwyg'; // 初始编辑模式
}

//=============================================================================
// 图片上传适配器
//=============================================================================

/**
 * 图片上传处理类
 * 负责将图片文件上传到服务器并返回URL
 */
class ImageUploader {
  token: string | null;
  maxFileSize: number;
  
  /**
   * 构造函数
   * @param token 认证令牌
   */
  constructor(token: string | null) {
    this.token = token;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB 最大文件大小限制
  }

  /**
   * 上传图片到服务器
   * @param file 图片文件对象
   * @returns 上传成功后的图片URL
   */
  async upload(file: File): Promise<string> {
    if (!file) {
      throw new Error('无效的文件对象');
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`图片太大，请上传小于10MB的图片（当前大小: ${(file.size / (1024 * 1024)).toFixed(2)}MB）`);
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      // 创建请求头，仅当有token时才添加Authorization头
      const headers: Record<string, string> = {
          'Content-Type': 'multipart/form-data'
      };
      
      // 仅当token存在且非空时才添加Authorization头
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      
      console.log('准备上传图片, 请求URL:', `${API_BASE_URL}/api/upload/image`);
      console.log('是否有token:', this.token ? '是' : '否');
      
      const response = await axios.post(`${API_BASE_URL}/api/upload/image`, formData, {
        headers,
        timeout: 30000,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          console.log(`上传进度: ${percentCompleted}%`);
        }
      });

      if (response.data && response.data.imageUrl) {
        console.log('图片上传成功:', response.data.imageUrl);
        return response.data.imageUrl;
      } else {
        console.error('Upload failed: Invalid response format', response.data);
        throw new Error('上传成功，但服务器返回的数据格式无效');
      }
    } catch (error: any) {
      console.error('Upload failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || '图片上传失败');
    }
  }
}

//=============================================================================
// 视频处理工具
//=============================================================================

/**
 * 视频处理工具对象
 * 用于解析视频URL并生成嵌入代码
 */
const videoUtils = {
  /**
   * 解析视频URL，提取平台和视频ID信息
   * @param url 视频URL
   * @returns 视频平台和ID信息
   */
  parseVideoUrl(url: string): VideoInfo {
    if (!url || typeof url !== 'string') {
      return {
        platform: VideoPlatform.Unknown,
        videoId: '',
        embedUrl: ''
      };
    }

    // YouTube正则表达式
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    // Bilibili正则表达式 - 支持多种格式
    const bilibiliRegex = /(?:bilibili\.com\/video\/(?:av|BV)([a-zA-Z0-9]+)|b23\.tv\/([a-zA-Z0-9]+))/i;
    
    // 尝试匹配YouTube
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
      const videoId = youtubeMatch[1];
      return {
        platform: VideoPlatform.YouTube,
        videoId,
        // 使用更多参数确保不自动播放
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=0&controls=1`
      };
    }
    
    // 尝试匹配Bilibili
    const bilibiliMatch = url.match(bilibiliRegex);
    if (bilibiliMatch) {
      const videoId = bilibiliMatch[1] || bilibiliMatch[2] || '';
      let bvid = videoId;
      
      if (!videoId.startsWith('BV') && !videoId.startsWith('av')) {
        bvid = `BV${videoId}`;
      }
      
      // 使用更多参数确保不自动播放
      return {
        platform: VideoPlatform.Bilibili,
        videoId: bvid,
        embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&autoplay=0&danmaku=0&high_quality=0&as_wide=0`
      };
    }
    
    return {
      platform: VideoPlatform.Unknown,
      videoId: '',
      embedUrl: ''
    };
  },
  
  /**
   * 生成嵌入代码
   * @param videoInfo 视频信息对象
   * @returns HTML嵌入代码
   */
  generateEmbedCode(videoInfo: VideoInfo): string {
    // 如果无法识别视频平台，返回空字符串
    if (!videoInfo || videoInfo.platform === VideoPlatform.Unknown || !videoInfo.videoId) {
      return '';
    }
    
    // 为了避免空文本节点错误，使用div包装iframe
    const iframeContainer = '<div class="iframe-container">';
    const containerEnd = '</div>';
    
    // 确保embedUrl中已经包含autoplay=0参数，不再重复添加
    // 此处依赖parseVideoUrl方法已正确设置autoplay=0
    const embedUrl = videoInfo.embedUrl;
    
    // 根据不同平台生成不同的嵌入代码
    if (videoInfo.platform === VideoPlatform.YouTube) {
      return `${iframeContainer}<iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>${containerEnd}`;
    } else if (videoInfo.platform === VideoPlatform.Bilibili) {
      return `${iframeContainer}<iframe src="${embedUrl}" title="Bilibili video player" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen scrolling="no"></iframe>${containerEnd}`;
    }
    
    return '';
  }
};

//=============================================================================
// 自定义按钮图标
//=============================================================================

/**
 * 自定义工具栏按钮文本图标
 */
const icons = {
  // 纯文本LaTeX公式图标
  latex: `TeX`,
  
  // 纯文本视频图标
  video: `视频`
};

//=============================================================================
// 主组件实现
//=============================================================================

/**
 * ToastEditor组件
 * 富文本编辑器实现，支持多种格式和特性
 */
const ToastEditor: React.FC<ToastEditorProps> = ({
  initialData = '',
  onChange,
  token,
  onReady,
  // placeholder 已弃用
  height = '1000px',
  initialEditType = 'wysiwyg'
}) => {
  // 编辑器引用与状态
  const editorRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentMode, setCurrentMode] = useState<'markdown' | 'wysiwyg'>(initialEditType);
  const imageUploader = useMemo(() => new ImageUploader(token), [token]);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // 添加全局事件监听，防止编辑器内空格键引起表单提交
  useEffect(() => {
    const preventSpaceSubmit = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target && 
          ((e.target as Element).closest('.toastui-editor-defaultUI') || 
           hasClass(e.target as Element, 'toastui-editor-contents'))) {
        // 阻止空格键引起的表单提交
        e.stopPropagation();
      }
    };
    
    // 在捕获阶段添加事件监听，确保先于其他事件处理
    document.addEventListener('keydown', preventSpaceSubmit, true);
    
    return () => {
      document.removeEventListener('keydown', preventSpaceSubmit, true);
    };
  }, []);
  
  // 颜色选择器配置选项
  const colorSyntaxOptions = useMemo(() => ({
    preset: [
      '#000000', '#2c2c2c', '#515151', '#7b7b7b', '#a8a8a8', '#d9d9d9', '#ffffff',
      '#ff4747', '#ff7575', '#ff9d9d', '#ffcece', '#ff4500', '#ff8142', '#ffb47a', '#ffd2a8',
      '#ffdc3c', '#ffe978', '#fff2a8', '#4a86e8', '#7aa3ed', '#a8c3f1', '#cedef9',
      '#6aa84f', '#8dbd77', '#b6d7a8', '#d8e9cf', '#9b30ff', '#ac67f2', '#cc99ff', '#e6d4f9'
    ]
  }), []);

  //=============================================================================
  // 编辑器初始化和生命周期钩子
  //=============================================================================
  
  /**
   * 添加模式切换监听
   * 处理Markdown和WYSIWYG模式之间的切换
   */
  useEffect(() => {
    if (!editorRef.current || !isReady) return;

    const instance = editorRef.current.getInstance();
    if (!instance) return;
    
    /**
     * 模式切换处理函数
     * 确保内容在不同模式间正确转换，优化LaTeX公式和视频的渲染体验
     * @param mode 目标模式
     */
    const handleModeChange = (mode: string) => {
      setCurrentMode(mode as 'markdown' | 'wysiwyg');
      
        try {
        // 保存滚动位置
        const editorElement = editorRef.current?.getRootElement();
        const currentScrollContainer = editorElement?.querySelector(
          mode === 'markdown' ? '.toastui-editor-ww-container' : '.toastui-editor-md-container'
        );
        const scrollPosition = currentScrollContainer?.scrollTop || 0;
        
        // 应用过渡动画到所有公式和视频元素
        const toastElements = editorElement?.querySelectorAll('.katex-wrapper, .iframe-container');
        toastElements?.forEach((el: Element) => {
          if (el instanceof HTMLElement) {
            el.style.opacity = '0.5';
            el.style.transition = 'opacity 0.3s ease';
          }
        });
        
        // 延迟足够短的时间让过渡效果开始，但不会被用户感知到延迟
              setTimeout(() => {
                try {
            // 获取当前内容
            const currentContent = mode === 'markdown' 
              ? instance.getHTML() 
              : instance.getMarkdown();
            
            // 设置内容，避免重复转换
            if (mode === 'markdown') {
              instance.setMarkdown(instance.getMarkdown());
            } else {
              instance.setHTML(instance.getHTML());
            }
            
            // 恢复滚动位置并完成过渡动画
              setTimeout(() => {
                try {
                const newScrollContainer = editorElement?.querySelector(
                  mode === 'markdown' ? '.toastui-editor-md-container' : '.toastui-editor-ww-container'
                );
                if (newScrollContainer) {
                  newScrollContainer.scrollTop = scrollPosition;
                }
                
                // 恢复元素不透明度
                const updatedElements = editorElement?.querySelectorAll('.katex-wrapper, .iframe-container');
                updatedElements?.forEach((el: Element) => {
                  if (el instanceof HTMLElement) {
                    el.style.opacity = '1';
                  }
                });
              } catch (scrollError) {
                console.warn('恢复滚动位置时出错:', scrollError);
                }
            }, 50);
          } catch (contentError) {
            console.error('设置内容时出错:', contentError);
            }
        }, 20);
        } catch (error) {
          console.error('模式切换处理时出错:', error);
      }
    };
    
    // 添加模式切换事件监听
    if (instance.on) {
      instance.on('changeMode', handleModeChange);
    }
    
    // 清理函数
    return () => {
      if (instance.off) {
        instance.off('changeMode', handleModeChange);
      }
    };
  }, [isReady]);

  /**
   * 修复编辑器菜单项和样式问题
   */
  useEffect(() => {
    if (!editorRef.current || !isReady) return;

    /**
     * 防抖函数包装的样式修复
     * 解决下拉菜单颜色和重复菜单项问题
     */
    const fixStyles = debounce(() => {
      // 修复标题下拉菜单颜色
      document.querySelectorAll('.toastui-editor-dropdown-toolbar .toastui-editor-dropdown-toolbar-item').forEach((item) => {
        if (item instanceof HTMLElement) {
          item.style.color = '#333';
          item.style.fontWeight = 'normal';
        }
      });
      
      // 修复重复菜单项
      document.querySelectorAll('.toastui-editor-context-menu').forEach((menu) => {
        const items = menu.querySelectorAll('li');
        const seenText = new Set<string>();
        
        items.forEach((item) => {
          const text = item.textContent?.trim() || '';
          if (seenText.has(text)) {
            item.remove();
          } else {
            seenText.add(text);
            if (item instanceof HTMLElement) {
              item.style.color = '#333';
            }
          }
        });
      });
    }, 50);
    
    // 初始修复
    fixStyles();
    
    // 获取编辑器实例
    const instance = editorRef.current.getInstance();
    
    // 添加事件监听器
    if (instance && instance.on) {
      instance.on('changeMode', fixStyles);
    }
    
    // 创建事件监听器引用以便于清理
    const handleClick = () => fixStyles();
    document.addEventListener('click', handleClick);
    
    // 清理函数
    return () => {
      if (instance && instance.off) {
        instance.off('changeMode', fixStyles);
      }
      document.removeEventListener('click', handleClick);
    };
  }, [isReady]);

  /**
   * 全局样式注入
   * 添加编辑器所需的各种样式
   */
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 修复标题下拉菜单颜色问题 */
      .toastui-editor-dropdown-toolbar .toastui-editor-dropdown-toolbar-item {
        color: #333 !important;
        font-weight: normal !important;
      }
      
      /* 标题选项悬停效果 */
      .toastui-editor-dropdown-toolbar .toastui-editor-dropdown-toolbar-item:hover {
        background-color: #f1f3f5 !important;
      }
      
      /* 修复下拉菜单箭头颜色 */
      .toastui-editor-toolbar .toastui-editor-toolbar-icons.heading::after {
        border-top-color: #333 !important;
      }

      /* KaTeX相关样式 */
      .katex-wrapper {
        margin: 1.5em 0;
        overflow-x: auto;
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 4px;
        border-left: 4px solid #4b7bec;
        transition: opacity 0.3s ease, transform 0.2s ease;
        opacity: 1;
        transform: translateY(0);
      }
      
      .katex-wrapper.rendering {
        opacity: 0.7;
        transform: translateY(5px);
      }
      
      .katex-error {
        margin: 1.5em 0;
        padding: 15px;
        color: #e74c3c;
        background-color: #fdecea;
        border-radius: 4px;
        border-left: 4px solid #e74c3c;
        font-family: monospace;
        white-space: pre-wrap;
        transition: opacity 0.3s ease;
      }
      
      /* 视频和iframe相关样式 */
      .toastui-editor-contents iframe, 
      .article-content iframe {
        max-width: 100%;
        width: 560px;
        height: 315px;
        border: none;
        margin: 1.5em 0;
        display: block;
        /* 禁止自动播放的关键样式 */
        visibility: visible !important;
        pointer-events: auto !important;
        transition: opacity 0.5s ease, transform 0.3s ease;
        will-change: opacity;
        transform: translateZ(0);
      }
      
      /* 全站iframe防自动播放保护 */
      iframe[src*="bilibili.com"],
      iframe[src*="youtube.com"] {
        autoplay: false !important;
        allow: clipboard-write; encrypted-media; gyroscope; picture-in-picture !important;
      }
      
      /* iframe容器样式增强 */
      .iframe-container {
        position: relative;
        margin: 1.5em 0;
        padding-top: 56.25%;
        height: 0;
        overflow: hidden;
        /* 增加防自动播放保护层 */
        isolation: isolate;
        transition: opacity 0.5s ease, transform 0.3s ease;
      }
      
      .iframe-container iframe {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: 0;
        /* 确保iframe不被隐藏元素覆盖触发自动播放 */
        z-index: 1;
        transition: opacity 0.3s ease;
      }
      
      /* 视频和LaTeX占位符样式 */
      .video-placeholder,
      .latex-placeholder {
        padding: 15px;
        background: #f8f9fa;
        border-radius: 4px;
        margin: 1.5em 0;
        text-align: center;
        border-left: 4px solid #4b7bec;
        transition: opacity 0.3s ease, transform 0.2s ease;
      }
      
      .video-placeholder-content,
      .latex-placeholder-content {
        color: #4b7bec;
        font-style: italic;
      }
      
      /* 平滑渲染过渡效果 */
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .toastui-editor-contents .katex-wrapper,
      .toastui-editor-contents .iframe-container {
        animation: fadeIn 0.3s ease-out forwards;
        will-change: opacity, transform;
        backface-visibility: hidden;
        transform: translateZ(0);
      }
      
      /* 避免在编辑器中的渲染闪烁 */
      .ProseMirror-hideselection .katex-wrapper,
      .ProseMirror-hideselection .iframe-container {
        transition: none !important;
        animation: none !important;
      }
      
      /* 自定义按钮样式 */
      .custom-toolbar-button {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 32px;
        height: 32px;
        margin: 0 3px;
        border-radius: 4px;
        background-color: transparent;
        border: 1px solid transparent;
        color: #333 !important;
        font-family: 'Times New Roman', serif;
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        padding: 0;
        box-shadow: none;
        text-shadow: none;
        outline: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        /* 防止按钮触发表单提交 */
        pointer-events: auto;
        user-select: none;
        touch-action: manipulation;
      }
      
      .custom-toolbar-button:hover {
        background-color: #f1f3f5;
        border-color: #dee2e6;
      }
      
      /* 编辑器占位符样式 */
      .toastui-editor .ProseMirror::before,
      .toastui-editor .ProseMirror .placeholder::before {
        color: #adb5bd !important;
        font-style: italic;
        opacity: 0.8;
      }
      
      /* 上传中动画 */
      .image-uploading {
        position: relative;
      }
      
      .image-uploading:after {
        content: '上传中...';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(255, 255, 255, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        color: #4b7bec;
      }
      
      /* 文件选择按钮优化 */
      .toastui-editor-file-select-button {
        position: relative;
        overflow: hidden;
      }
      
      .toastui-editor-file-select-button input[type=file] {
        position: absolute;
        top: 0;
        right: 0;
        min-width: 100%;
        min-height: 100%;
        font-size: 100px;
        text-align: right;
        filter: alpha(opacity=0);
        opacity: 0;
        outline: none;
        background: white;
        cursor: pointer;
        display: block;
      }
      
      /* 防止按钮误触发表单提交的防护层 */
      .toast-editor-container {
        position: relative;
        z-index: 1;
        /* 防止编辑器内的点击传递到外部 */
        isolation: isolate;
      }
      
      /* 确保按钮不会触发任何祖先元素的表单提交 */
      .toastui-editor-toolbar button {
        pointer-events: auto;
        user-select: none;
        touch-action: manipulation;
      }
      
      /* 其他编辑器修复 */
      .empty-node-placeholder {
        display: none !important;
      }
      
      .toastui-editor-context-menu .toastui-editor-dropdown-menu li {
        color: #333 !important;
        font-weight: normal !important;
      }
      
      .toastui-editor-context-menu .toastui-editor-dropdown-menu li a {
        color: #333 !important;
      }
      
      .toastui-editor-toolbar-item {
        position: relative;
      }
      
      .toastui-editor-context-menu .toastui-editor-dropdown-menu li:nth-child(n+7):nth-child(-n+8) {
        display: none !important;
      }

      /* --- Editor Background & Theme Harmonization --- */
      /* 统一编辑器背景为白色 */
      .toastui-editor-ww-container .ProseMirror,
      .toastui-editor-md-container .toastui-editor,
      .toastui-editor-md-preview {
        background-color: #ffffff !important; 
        color: #333333 !important; /* 确保文本在白色背景上可见 */
      }

      /* 调整编辑器边框颜色以适应浅色主题 */
      .toastui-editor-defaultUI {
        border: 1px solid #d1d5db !important; /* 更浅的边框 */
      }

      /* 调整工具栏背景和边框 */
      .toastui-editor-toolbar {
         background-color: #f9fafb !important; /* 浅灰色工具栏 */
         border-bottom: 1px solid #d1d5db !important;
      }

      /* 调整工具栏图标颜色 */
      .toastui-editor-toolbar-icons {
          color: #374151 !important; /* 深灰色图标 */
      }
      .toastui-editor-toolbar-icons:hover {
          background-color: #e5e7eb !important; /* 轻微悬停效果 */
      }
      .toastui-editor-toolbar-icons.active {
          background-color: #d1d5db !important; /* 激活状态 */
      }
      
      /* 调整自定义按钮样式以适应浅色主题 */
      .custom-toolbar-button {
         color: #374151 !important;
         border: 1px solid transparent;
      }
      .custom-toolbar-button:hover {
         background-color: #e5e7eb !important; 
         border-color: #d1d5db !important;
      }

      /* 调整模式切换按钮样式 */
      .toastui-editor-mode-switch {
         background-color: #f9fafb !important; 
         border-top: 1px solid #d1d5db !important;
      }
      .toastui-editor-mode-switch .toastui-editor-mode-switch-button {
         color: #374151 !important;
         border: 1px solid #d1d5db !important;
         background-color: #ffffff !important;
      }
      .toastui-editor-mode-switch .toastui-editor-mode-switch-button.active {
         background-color: #e5e7eb !important; 
         color: #1f2937 !important;
      }
      /* --- End Editor Background & Theme Harmonization --- */
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /**
   * 图片上传钩子函数
   * 处理编辑器的图片上传请求
   */
  const uploadImageHook = useCallback(async (blob: Blob, callback: Function) => {
    try {
      if (uploadingImage) {
        console.warn('已有图片正在上传中，请等待完成');
        callback('', 'image');
        return;
      }
      
      setUploadingImage(true);
      
      let imageFile: File;
      if (!(blob instanceof File)) {
        imageFile = new File([blob], `clipboard_image_${Date.now()}.png`, { 
          type: blob.type || 'image/png'
        });
      } else {
        imageFile = blob;
      }
      
      if (imageFile.size > imageUploader.maxFileSize) {
        alert(`图片太大，请上传小于10MB的图片（当前大小: ${(imageFile.size / (1024 * 1024)).toFixed(2)}MB）`);
        setUploadingImage(false);
        callback('', 'image');
        return;
      }

      try {
        const imageUrl = await imageUploader.upload(imageFile);
        callback(imageUrl, 'image');
      } catch (error: any) {
        console.error('图片上传失败:', error);
        alert(`图片上传失败: ${error.message || '未知错误'}`);
        callback('', 'image');
      } finally {
        setUploadingImage(false);
      }
    } catch (error: any) {
      console.error('处理图片上传错误:', error);
      setUploadingImage(false);
      callback('', 'image');
    }
  }, [uploadingImage, imageUploader]);

  /**
   * 优化图片上传对话框
   * 替换默认上传按钮行为，提供更好的用户体验
   */
  useEffect(() => {
    if (!isReady || !editorRef.current) return;
    
    const editorContainer = editorRef.current.getRootElement();
    if (!editorContainer) return;
    
    const imageButton = editorContainer.querySelector('.toastui-editor-toolbar-item.toastui-editor-toolbar-image');
    if (!imageButton) return;
    
    /**
     * 图片上传处理函数
     * 实现自定义的图片选择和上传逻辑
     */
    const handleImageUpload = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.position = 'absolute';
      fileInput.style.opacity = '0';
      fileInput.style.visibility = 'hidden';
      document.body.appendChild(fileInput);
      
      // 使用requestAnimationFrame避免UI卡顿
      requestAnimationFrame(() => {
        fileInput.click();
      });
      
      // 文件选择处理
      fileInput.onchange = async () => {
        if (!fileInput.files || !fileInput.files[0]) {
          document.body.removeChild(fileInput);
          return;
        }
        
        const file = fileInput.files[0];
        if (file.size > imageUploader.maxFileSize) {
          alert(`图片太大，请上传小于10MB的图片（当前大小: ${(file.size / (1024 * 1024)).toFixed(2)}MB）`);
          document.body.removeChild(fileInput);
          return;
        }
        
        setUploadingImage(true);
        try {
          const imageUrl = await imageUploader.upload(file);
          if (imageUrl && editorRef.current) {
            const instance = editorRef.current.getInstance();
            if (instance.isMarkdownMode()) {
              instance.insertText(`![${file.name}](${imageUrl})`);
            } else if (typeof instance.insertHTML === 'function') {
              instance.insertHTML(`<img src="${imageUrl}" alt="${file.name}">`);
            }
          }
        } catch (error: any) {
          console.error('图片上传失败:', error);
          alert(`图片上传失败: ${error.message || '未知错误'}`);
        } finally {
          setUploadingImage(false);
          document.body.removeChild(fileInput);
        }
      };
    };
    
    imageButton.addEventListener('click', handleImageUpload, true);
    
    return () => {
      imageButton.removeEventListener('click', handleImageUpload, true);
    };
  }, [isReady, imageUploader]);

  /**
   * 修复视频嵌入后的编辑器错误
   * 处理iframe相关的DOM问题
   */
  useEffect(() => {
    if (!isReady || !editorRef.current) return;
    
    const instance = editorRef.current.getInstance();
    if (!instance) return;
    
    /**
     * 内容变化处理函数
     * 修复iframe和空文本节点问题
     */
    const handleContentChange = debounce(() => {
      try {
        const editorEl = editorRef.current?.getRootElement();
        if (!editorEl) return;
        
        const iframes = editorEl.querySelectorAll('iframe');
        if (iframes.length === 0) return;
        
        // 修复可能的空文本节点
        iframes.forEach((iframe: HTMLIFrameElement) => {
          const parent = iframe.parentElement;
          if (!parent) return;
          
          Array.from(parent.childNodes).forEach((node: Node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === '') {
              const placeholder = document.createElement('span');
              placeholder.className = 'empty-node-placeholder';
              placeholder.style.display = 'none';
              parent.replaceChild(placeholder, node);
            }
          });
        });
      } catch (error) {
        console.warn('修复编辑器内容时出错:', error);
      }
    }, 100);
    
    // 为编辑器添加内容变化监听
    if (instance.on) {
      instance.on('change', handleContentChange);
    }
    
    return () => {
      if (instance.off) {
        instance.off('change', handleContentChange);
      }
    };
  }, [isReady]);

  // --- 定义按钮点击处理函数 (移到组件主体) ---
  const handleLatexClickInternal = useCallback(() => {
      const editor = editorRef.current?.getInstance();
      if (!editor) { alert('无法获取编辑器实例 (LaTeX)'); return; }
      // Restore $$latex marker
      const latexTemplate = [
        '$$latex', // Restore marker
        //'\\begin{document}', 
        //'$', 
        'f(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,e^{2 \\pi i \\xi x} \\, d\\xi',
        //'$', 
        //'\\end{document}',
        '$$' // Keep standard closing delimiter
      ].join('\n');
      try {
        if (editor.isMarkdownMode()) {
          editor.insertText(`\n${latexTemplate}\n`);
        } else {
          const currentContent = editor.getMarkdown();
          editor.setMarkdown(currentContent + `\n${latexTemplate}\n`);
        }
      } catch (error) {
        console.error('插入LaTeX时出错:', error);
        alert('插入LaTeX失败，请手动复制:\n' + latexTemplate);
      }
  }, [editorRef]); // 依赖 editorRef (虽然 ref 本身不变，但明确依赖关系)

  const handleVideoClickInternal = useCallback(() => {
      const editor = editorRef.current?.getInstance();
      if (!editor) { alert('无法获取编辑器实例 (Video)'); return; }
      const videoUrl = prompt('请输入视频链接 (支持YouTube和Bilibili):', '');
      if (!videoUrl) return;
      const videoInfo = videoUtils.parseVideoUrl(videoUrl);
      if (videoInfo.platform === VideoPlatform.Unknown) { alert('无法识别的视频链接'); return; }
      const iframeCode = videoUtils.generateEmbedCode(videoInfo);
      if (!iframeCode) { alert('生成嵌入代码失败'); return; }
      try {
        const wrappedIframe = `<div class="iframe-container" style="opacity: 0; transition: opacity 0.6s ease 0.1s;">${iframeCode}</div>`; // Keep for potential Markdown preview
        const markdownIframeCode = '\n' + iframeCode + '\n';
        const placeholderText = `\n[视频占位符: ${videoUrl}]\n`; // WYSIWYG placeholder

        if (editor.isMarkdownMode()) {
          // Markdown 模式插入完整的 iframe 代码
          editor.insertText(markdownIframeCode);
        } else {
          // --- WYSIWYG 模式: 插入占位符文本 --- 
          editor.insertText(placeholderText); // Use insertText for plain text
          console.log("WYSIWYG: Video placeholder inserted.");
        }
      } catch (error) {
        console.error('插入视频时出错:', error);
        alert('插入视频失败，请手动复制:\n' + iframeCode);
      }
  }, [editorRef]); // 依赖 editorRef
  // --- 结束定义按钮点击处理函数 ---

  /**
   * 编辑器就绪处理函数
   * 设置编辑器初始化后的状态和清理
   */
  const handleEditorReady = useCallback(() => {
    if (!editorRef.current) return;
    
    setIsReady(true);
    const instance = editorRef.current.getInstance();
    if (!instance) return;

    // --- 新增：强制在加载后将内容处理为 Markdown --- 
    if (initialData) {
      try {
        // 延迟执行以确保编辑器完全准备好处理内容
        setTimeout(() => {
          try {
            console.log("[ToastEditor] Forcing content re-process as Markdown on load.");
            const currentMd = instance.getMarkdown(); // 获取当前（可能基于HTML加载的）内容的Markdown
            instance.setMarkdown(currentMd); // 用获取到的Markdown重新设置内容，强制内部状态统一
            console.log("[ToastEditor] Content re-processed as Markdown.");
          } catch (reprocessError) {
            console.error('[ToastEditor] Error forcing content re-process as Markdown:', reprocessError);
          }
        }, 100); // 短暂延迟
      } catch (outerError) {
        console.error('[ToastEditor] Error accessing editor instance for re-processing:', outerError);
      }
    }
    // --- 结束新增 --- 

    // 清理可能存在的UI文本（保留之前的逻辑）
    try {
      // 移除可能被误添加到编辑区域的UI文本
      setTimeout(() => {
        try {
          // 确保编辑器已经完全初始化
          if (instance.isMarkdownMode()) {
            const content = instance.getMarkdown();
            // 移除编辑器UI相关的文本
            const cleanedContent = content
              .replace(/^(编辑|预览|Markdown|所见即所得)\s*/g, '')
              .trim();
            
            if (content !== cleanedContent) {
              instance.setMarkdown(cleanedContent);
            }
          } else {
            const content = instance.getHTML();
            // 替换HTML内容中可能存在的UI文本
            const cleanedContent = content
              .replace(/<p>(编辑|预览|Markdown|所见即所得)(<br>|\s)*<\/p>/g, '')
              .replace(/<p><br><\/p>/g, '')
              .trim();
            
            if (content !== cleanedContent && cleanedContent) {
              instance.setHTML(cleanedContent);
            }
          }
        } catch (cleanError) {
          console.warn('清理编辑器内容时出错:', cleanError);
        }
      }, 50);
      
      const editorElement = editorRef.current.getRootElement();
      if (editorElement) {
        const placeholders = editorElement.querySelectorAll('.placeholder');
        placeholders.forEach((placeholder: Element) => {
          if (placeholder instanceof HTMLElement) {
            placeholder.style.color = '#adb5bd';
            placeholder.style.fontStyle = 'italic';
            placeholder.style.opacity = '0.8';
          }
        });
      }
    } catch (error) {
      console.warn('设置placeholder样式时出错:', error);
    }
    
    if (onReady) {
      onReady(instance);
    }
  }, [onReady, initialData]);

  // 防抖处理编辑器内容变化回调
  const debouncedOnChange = useMemo(() => 
    debounce((content: string) => {
      onChange(content);
    }, 300), // 300ms 防抖延迟
    [onChange]
  );

  /**
   * 编辑器内容变化处理函数（现在调用防抖版本）
   * 将编辑器内容传递给父组件
   */
  const handleEditorChange = useCallback(() => {
    if (!editorRef.current) return;
    
    try {
      const instance = editorRef.current.getInstance();
      if (!instance) return;
      
      // --- 修改：始终获取并传递 Markdown 源码 --- 
      const content = instance.getMarkdown();
      debouncedOnChange(content);
    } catch (error) {
      console.error('处理编辑器内容变化时出错:', error);
    }
  }, [debouncedOnChange]);

  /**
   * 自定义HTML渲染器
   * 处理LaTeX公式和iframe渲染
   */
  const customHTMLRenderer = useMemo(() => ({
    /**
     * LaTeX渲染器
     * 使用KaTeX渲染数学公式
     */
    latex(node: any) {
      try {
        if (!node || !node.literal) {
          return [
            { type: 'openTag' as const, tagName: 'div', outerNewLine: true, attributes: { class: 'katex-error' } },
            { type: 'text' as const, content: '无效的LaTeX公式' },
            { type: 'closeTag' as const, tagName: 'div', outerNewLine: true }
          ];
        }
        
        let latexCode = node.literal.trim();
        
        // 移除可能导致解析问题的多余标记
        latexCode = latexCode.replace(/\\documentclass\{article\}|\\begin\{document\}|\\end\{document\}/g, '').trim();
        
        // 提取$...$或$$...$$中的公式部分
        const dollarMatch = latexCode.match(/\$([\s\S]*?)\$/) || latexCode.match(/\$\$([\s\S]*?)\$\$/);
        if (dollarMatch && dollarMatch[1]) {
          latexCode = dollarMatch[1].trim();
        }
        
        // 处理反斜杠转义问题
        latexCode = latexCode.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
        
        // 渲染选项，添加更多容错性
        const renderOptions = {
            throwOnError: false,
            errorColor: '#e74c3c',
            displayMode: true,
            strict: false,
            trust: true,
            maxSize: 200,
            maxExpand: 1000,
            output: 'html' as 'html' | 'mathml' | 'htmlAndMathml'
        };
        
        try {
          // 使用异步方式渲染LaTeX，避免阻塞UI线程
          const renderedHTML = katex.renderToString(latexCode, renderOptions);
          
          // 返回带有过渡动画的包装元素
          return [
            { 
              type: 'openTag' as const, 
              tagName: 'div', 
              outerNewLine: true, 
              attributes: { 
                class: 'katex-wrapper', 
                'data-katex-source': latexCode.replace(/"/g, '&quot;'),
                style: 'opacity: 0; animation: fadeIn 0.4s ease-out 0.1s forwards; transform: translateZ(0);'
              } 
            },
            { type: 'html' as const, content: renderedHTML },
            { type: 'closeTag' as const, tagName: 'div', outerNewLine: true }
          ];
        } catch (katexError) {
          console.error('KaTeX渲染错误:', katexError);
          
          // 返回更详细的错误信息
          return [
            { 
              type: 'openTag' as const, 
              tagName: 'div', 
              outerNewLine: true, 
              attributes: { 
                class: 'katex-error',
                style: 'animation: fadeIn 0.3s ease-out forwards;'
              } 
            },
            { type: 'text' as const, content: `LaTeX渲染错误: ${(katexError as Error).message || '未知错误'}\n\n请检查公式语法。原始公式:\n${latexCode.slice(0, 100)}${latexCode.length > 100 ? '...' : ''}` },
            { type: 'closeTag' as const, tagName: 'div', outerNewLine: true }
          ];
        }
      } catch (error) {
        console.error('LaTeX处理错误:', error);
        return [
          { type: 'openTag' as const, tagName: 'div', outerNewLine: true, attributes: { class: 'katex-error' } },
          { type: 'text' as const, content: `LaTeX处理错误: ${(error as Error).message || '未知错误'}\n请尝试刷新页面或减少公式复杂度。` },
          { type: 'closeTag' as const, tagName: 'div', outerNewLine: true }
        ];
      }
    },
    /**
     * iframe处理
     * 处理嵌入视频iframe的属性和安全性，添加平滑过渡效果
     */
    htmlBlock: {
      iframe(node: any) {
        try {
          if (!node || typeof node !== 'object') {
            throw new Error('无效的节点对象');
          }
          
          const attrs = node.attrs ? { ...node.attrs } : {};
          
          if (!attrs.src) {
            console.warn('iframe缺少src属性:', attrs);
          }
          
          attrs.allowfullscreen = 'true';
          // 只允许必要的功能，移除autoplay
          attrs.allow = 'clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
          
          if (!attrs.frameborder) {
            attrs.frameborder = '0';
          }
          
          // 添加额外属性阻止自动播放
          attrs.loading = 'lazy';
          attrs.scrolling = 'no';
          attrs.referrerpolicy = 'no-referrer-when-downgrade';
          
          // 添加平滑加载相关属性
          attrs.style = 'opacity: 0; transition: opacity 0.5s ease;';
          attrs.onload = 'this.style.opacity=1;';
          
          if (attrs.src) {
            // 处理YouTube链接
            if (attrs.src.includes('youtube.com')) {
              // 确保设置了autoplay=0和其他限制参数
              const baseUrl = attrs.src.split('?')[0];
              const searchParams = new URLSearchParams(attrs.src.includes('?') ? attrs.src.split('?')[1] : '');
              
              // 强制设置参数
              searchParams.set('autoplay', '0');
              searchParams.set('mute', '0');
              searchParams.set('controls', '1');
              
              attrs.src = `${baseUrl}?${searchParams.toString()}`;
            }
            
            // 处理Bilibili链接
            if (attrs.src.includes('bilibili.com')) {
              // 确保设置了autoplay=0和其他限制参数
              const baseUrl = attrs.src.split('?')[0];
              const searchParams = new URLSearchParams(attrs.src.includes('?') ? attrs.src.split('?')[1] : '');
              
              // 强制设置参数
              searchParams.set('autoplay', '0');
              searchParams.set('danmaku', '0');
              searchParams.set('high_quality', '0');
              searchParams.set('as_wide', '0');
              
              attrs.src = `${baseUrl}?${searchParams.toString()}`;
            }
          }
          
          return [
            { type: 'openTag' as const, tagName: 'iframe', outerNewLine: true, attributes: attrs },
            { type: 'closeTag' as const, tagName: 'iframe', outerNewLine: true }
          ];
        } catch (error) {
          console.error('iframe渲染错误:', error);
          return [
            { type: 'openTag' as const, tagName: 'div', outerNewLine: true, attributes: { class: 'video-error' } },
            { type: 'text' as const, content: `视频渲染错误: ${(error as Error).message || '未知错误'}` },
            { type: 'closeTag' as const, tagName: 'div', outerNewLine: true }
          ];
        }
      }
    }
  }), []);

  /**
   * 添加编辑器内容初始化修复
   * 防止UI元素文本泄漏到编辑内容
   */
  useEffect(() => {
    if (!isReady || !editorRef.current) return;
    
    /**
     * 修复编辑器内容
     * 清除可能混入的UI元素文本
     */
    const fixEditorContent = () => {
      try {
        const instance = editorRef.current.getInstance();
        if (!instance) return;
        
        // 检查当前内容是否包含UI元素文本
        let content = instance.isMarkdownMode() ? instance.getMarkdown() : instance.getHTML();
        
        // 定义需要清理的UI元素文本模式
        const uiTextPatterns = [
          /^(编辑|预览)\s*$/m,
          /^(Markdown|所见即所得)\s*$/m,
          /<p>(编辑|预览|Markdown|所见即所得)(<br>|\s)*<\/p>/g,
          // 添加更多模式以匹配不同场景下的UI文本
          /编辑\s*预览/g,
          /Markdown\s*所见即所得/g,
          /<div>(编辑|预览|Markdown|所见即所得)(<br>|\s)*<\/div>/g,
          /<[^>]*>(编辑|预览|Markdown|所见即所得)(<br>|\s)*<\/[^>]*>/g
        ];
        
        // 检查是否需要清理
        let needsCleaning = false;
        for (const pattern of uiTextPatterns) {
          if (pattern.test(content)) {
            needsCleaning = true;
            break;
          }
        }
        
        if (needsCleaning) {
          // 延长等待时间，确保编辑器完全渲染
          setTimeout(() => {
            try {
              // 重新获取内容
              content = instance.isMarkdownMode() ? instance.getMarkdown() : instance.getHTML();
              
              // 清理UI元素文本
              let cleanedContent = content;
              for (const pattern of uiTextPatterns) {
                cleanedContent = cleanedContent.replace(pattern, '');
              }
              
              // 移除额外的空行和多余空格
              cleanedContent = cleanedContent.replace(/^\s*[\r\n]/gm, '').trim();
              cleanedContent = cleanedContent.replace(/(<p>\s*<\/p>)+/g, '<p></p>');
              
              // 如果内容有变化，设置回编辑器
              if (cleanedContent !== content) {
                console.log('清理编辑器UI文本元素');
                if (instance.isMarkdownMode()) {
                  instance.setMarkdown(cleanedContent);
                } else {
                  instance.setHTML(cleanedContent || '<p></p>');
                }
                
                // 额外操作：聚焦编辑器
                setTimeout(() => {
                  try {
                    instance.focus();
                  } catch (e) {
                    console.warn('聚焦编辑器失败:', e);
                  }
                }, 50);
              }
            } catch (error) {
              console.warn('修复编辑器内容时出错:', error);
            }
          }, 200); // 增加延时以确保编辑器已完全初始化
        }
      } catch (error) {
        console.warn('检查编辑器内容时出错:', error);
      }
    };
    
    // 初始修复
    fixEditorContent();
    
    // 监听编辑器事件
    const instance = editorRef.current.getInstance();
    if (instance && instance.on) {
      // 模式切换时修复
      instance.on('changeMode', fixEditorContent);
      // 加载完成后也修复
      instance.on('load', () => {
        // 延迟执行，确保内容已加载
        setTimeout(fixEditorContent, 300);
      });
    }
    
    // 返回清理函数
    return () => {
      if (instance && instance.off) {
        instance.off('changeMode', fixEditorContent);
        instance.off('load', fixEditorContent);
      }
    };
  }, [isReady]);

  /**
   * 组件渲染
   */
  return (
    <div 
      className="toast-editor-container" 
      onClick={(e) => {
        // 阻止冒泡，防止编辑器内的点击影响外部表单
        e.stopPropagation();
      }}
      onSubmit={(e) => {
        // 阻止可能的表单提交
        e.preventDefault();
        return false;
      }}
    >
      <Editor
        ref={editorRef}
        initialValue={initialData}
        previewStyle="vertical"
        height={height}
        initialEditType={initialEditType}
        useCommandShortcut={true}
        usageStatistics={false}
        hideModeSwitch={false}
        language="zh-CN"
        toolbarItems={[
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task', 'indent', 'outdent'],
          ['table', 'image', 'link'],
          ['code', 'codeblock'],
          // --- 使用 el 属性创建自定义按钮 --- 
          [{
            name: 'customDivider', // 分隔符名称
            el: createToolbarDivider(), // 创建分隔符
            tooltip: '' // tooltip 必须提供，即使为空
          },
          {
            name: 'customLatexButton', // 按钮名称
            tooltip: '插入LaTeX公式',
            el: (() => {
              const button = document.createElement('button');
              button.className = 'toastui-editor-toolbar-icons custom-latex-button';
              button.textContent = '∑';
              button.type = 'button'; // 重要：防止触发表单提交
              button.style.fontSize = '18px';
              button.style.margin = '0 2px';
              button.addEventListener('click', (e: MouseEvent) => {
                e.preventDefault(); // 再次确保阻止默认行为
                e.stopPropagation();
                handleLatexClickInternal(); // 调用我们定义的处理函数
              });
              return button;
            })()
          },
          {
            name: 'customVideoButton', // 按钮名称
            tooltip: '插入视频',
            el: (() => {
              const button = document.createElement('button');
              button.className = 'toastui-editor-toolbar-icons custom-video-button';
              button.textContent = '▶';
              button.type = 'button'; // 重要
              button.style.fontSize = '16px';
              button.style.margin = '0 2px';
              button.addEventListener('click', (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                handleVideoClickInternal(); // 调用我们定义的处理函数
              });
              return button;
            })()
          }]
          // --- 结束自定义按钮 --- 
        ]}
        plugins={[[colorSyntax, colorSyntaxOptions]]}
        hooks={{ addImageBlobHook: uploadImageHook }}
        onChange={handleEditorChange}
        onLoad={handleEditorReady}
        customHTMLRenderer={customHTMLRenderer}
      />
    </div>
  );
};

/**
 * 防抖函数
 * 用于优化高频率事件处理
 * @param func 需要防抖的函数
 * @param wait 等待时间(毫秒)
 * @returns 防抖处理后的函数
 */
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: unknown, ...args: any[]) {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * 判断DOM元素是否有特定类名
 * 防止对非标准DOM元素操作导致类型错误
 * @param element DOM元素
 * @param className 类名
 * @returns 是否包含该类名
 */
function hasClass(element: Element | null, className: string): boolean {
  if (!element || !className) return false;

  try {
    // 优先使用 classList API (最安全可靠)
    if (element.classList && typeof element.classList.contains === 'function') {
      return element.classList.contains(className);
    }

    // 处理 className 是字符串的情况
    if (typeof element.className === 'string') {
      // 使用空格作为分隔符进行精确匹配
      return (' ' + element.className + ' ').indexOf(' ' + className + ' ') > -1;
    }

    // 处理 SVGElement 的 className (SVGAnimatedString)
    // 检查 baseVal 是否存在且为字符串
    if (element.className && typeof element.className === 'object' && typeof (element.className as any).baseVal === 'string') {
      return (' ' + (element.className as SVGAnimatedString).baseVal + ' ').indexOf(' ' + className + ' ') > -1;
    }

    // 其他未知情况，安全返回 false
    console.warn('hasClass: Encountered unexpected element.className type:', typeof element.className, 'on element:', element);
    return false;
  } catch (error) {
    // 捕获任何意外错误，防止整个应用崩溃
    console.error('Error in hasClass function:', error, 'Element:', element, 'ClassName:', className);
    return false;
  }
}

// 辅助函数：创建工具栏分隔符
function createToolbarDivider(): HTMLElement {
  const divider = document.createElement('div');
  divider.className = 'toastui-editor-toolbar-divider';
  return divider;
}

export default ToastEditor; 