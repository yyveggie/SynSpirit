/**
 * CreateDynamicModal.tsx
 * 
 * 功能注释：
 * 定义一个用于创建新动态的模态框组件。
 * 
 * 主要功能:
 * - 提供文本输入框让用户撰写动态内容。
 * - 支持图片上传、拖拽、粘贴功能 (最多9张)。
 * - 调用 API 执行创建动态的操作。
 * - 处理提交状态和错误显示。
 * - 采用毛玻璃背景风格，无明显边框线，注重美感和优雅排版。
 */
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Send, Loader2, ImagePlus, X } from 'lucide-react'; // 使用 ImagePlus 和 X 图标
import { motion, AnimatePresence } from 'framer-motion';
import ImageUploader, { UploadedImage } from './ImageUploader'; // 复用图片上传组件
import { useAuth } from '../context/AuthContext';
import Modal from './Modal'; // 复用基础 Modal 组件

interface CreateDynamicModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onSubmit 的参数：动态内容文本，可选的图片URL数组
  onSubmit: (content: string, images?: string[]) => Promise<void>; 
  content: string; // 外部传入的当前动态内容
  setContent: React.Dispatch<React.SetStateAction<string>>; // 更新外部动态内容的方法
  error: string | null; // 创建过程中的错误信息
  isLoading: boolean;   // 是否正在创建中
}

const CreateDynamicModal: React.FC<CreateDynamicModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  content, 
  setContent, 
  error,
  isLoading
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const { token } = useAuth(); // 用于图片上传等需要认证的操作
  const [showImageUploader, setShowImageUploader] = useState(false); // <- ADDED state
  
  // 检查是否所有图片都已上传完成
  const allImagesUploaded = uploadedImages.every(img => !img.uploading && !img.error);

  // 当模态框关闭时，清空已上传的图片和内容（如果不由父组件控制内容清空）
  useEffect(() => {
    if (!isOpen) {
      setUploadedImages([]);
      // 通常 content 和 setContent 由父组件管理其生命周期
      // 如果希望模态框关闭时也清空父组件的 content, 
      // 则应该在父组件的 onClose 回调中调用 setContent('')
    }
  }, [isOpen]);

  const handleImagesChange = (images: UploadedImage[]) => {
    setUploadedImages(images);
  };

  const handleSubmit = async () => {
    if (!allImagesUploaded) {
      toast.warning('请等待所有图片上传完成');
      return;
    }
    if (!content.trim() && uploadedImages.length === 0) {
      toast.info('请输入内容或上传图片后再发布哦');
      return;
    }
    
    const imageUrls = uploadedImages
      .filter(img => !img.uploading && !img.error && img.url)
      .map(img => img.url as string);
    
    await onSubmit(content, imageUrls.length > 0 ? imageUrls : undefined);
  };

  // 快捷键提交 Ctrl/Cmd + Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); // 防止默认换行
      if (!isLoading && allImagesUploaded) {
        handleSubmit();
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="记录此刻的想法...">
      {/* 主容器: 响应式布局，中等屏幕以上左右布局，以下上下布局 */}
      <div className="relative flex flex-col md:flex-row md:space-x-6 space-y-6 md:space-y-0 p-6 bg-gray-800/50 backdrop-blur-xl rounded-xl shadow-2xl max-w-3xl w-full">
        
        {/* 左侧：文本输入区 和 操作按钮区 */}
        <div className="flex flex-col flex-grow md:w-2/3 space-y-6">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="有什么新鲜事想分享？"
            rows={10} // 增加行数以适应更大的垂直空间
            className="w-full p-4 rounded-lg bg-black/20 focus:bg-black/30 outline-none focus:ring-2 focus:ring-blue-500/70 text-gray-100 placeholder-gray-400/70 resize-none text-base leading-relaxed shadow-md transition-all duration-300 ease-in-out min-h-[200px] flex-grow"
            disabled={isLoading}
            onKeyDown={handleKeyDown}
            autoFocus 
          />
          
          {/* 操作按钮区 和 Cmd/Ctrl+Enter 提示 - 移到文本区下方 */}
          <div className="flex flex-col items-end">
            <div className="flex justify-end items-center w-full">
              <motion.button
                onClick={onClose} 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors 
                            bg-gray-600/30 hover:bg-gray-500/40 text-gray-300 hover:text-gray-100 
                            focus:outline-none focus:ring-2 focus:ring-gray-500/80 mr-3
                            disabled:opacity-50`}
                disabled={isLoading}
                aria-label="取消"
              >
                取消
              </motion.button>
              <motion.button
                onClick={handleSubmit}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className={`relative px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 overflow-hidden 
                            bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 
                            text-white shadow-md hover:shadow-lg 
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900/50 focus:ring-indigo-500 
                            disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:from-blue-500 disabled:hover:to-indigo-600`}
                disabled={isLoading || !allImagesUploaded}
                aria-label="发布动态"
                title={!allImagesUploaded ? "等待图片上传完成" : "发布 (Cmd/Ctrl+Enter)"}
              >
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </span>
                )}
                <span className={isLoading ? 'opacity-0' : 'opacity-100'}>发布</span>
              </motion.button>
            </div>
            <p className="text-xs text-gray-500 text-right mt-2 pr-1">Cmd/Ctrl+Enter 可快速发送</p>
          </div>
        </div>

        {/* 右侧：图片上传区 */}
        <div className="flex flex-col md:w-1/3 space-y-4 items-center md:items-stretch">
          {!showImageUploader && (
            <button 
              onClick={() => setShowImageUploader(true)}
              className="w-full h-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-600/70 hover:border-gray-500/90 rounded-xl cursor-pointer transition-colors duration-200 bg-white/5 hover:bg-white/10 group min-h-[200px] md:min-h-0 md:flex-grow"
            >
              <ImagePlus className="w-10 h-10 text-gray-400/80 group-hover:text-blue-400/90 mb-2 transition-colors duration-200" />
              <p className="text-sm text-gray-400/90 group-hover:text-gray-300/90">添加图片 (可选)</p>
              <p className="text-xs text-gray-500/80 mt-1 text-center">支持拖拽、粘贴<br/>最多9张，单张不超过10MB</p>
            </button>
          )}

          {showImageUploader && (
            <div className="w-full h-full flex flex-col"> 
              <ImageUploader 
                onImagesChange={handleImagesChange}
                token={token} 
                maxImages={9}
                subfolder="dynamic_images"
              />
            </div>
          )}
          
          {/* 错误提示 - 如果需要在图片区显示，可以移到这里，或者保持在底部 */} 
          {error && showImageUploader && ( // 只在图片上传器可见时在其区域显示相关错误
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-400 bg-red-500/10 p-2 rounded-md text-center mt-2"
            >
              {error}
            </motion.p>
          )}
        </div>

        {/* 全局错误提示 - 如果错误与图片上传无关，或希望总在底部显示 */} 
        {error && !showImageUploader && (
            <motion.p 
              initial={{ opacity: 0, y: 10 }} // Adjusted y for appearing at bottom
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-400 bg-red-500/10 p-2 rounded-md text-center md:col-span-2 mt-4"
            >
              {error}
            </motion.p>
        )}

      </div>
    </Modal>
  );
};

export default CreateDynamicModal; 