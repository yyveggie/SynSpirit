/**
 * ImageUploader.tsx - 图片上传组件
 * 
 * 此组件提供以下功能:
 * - 支持粘贴上传图片 (Ctrl+V)
 * - 支持拖拽上传图片
 * - 支持点击选择图片上传
 * - 显示上传进度
 * - 上传到腾讯云COS存储
 * - 支持多图片同时上传
 * - 支持上传错误重试
 * - 支持预览和删除已上传图片
 * 
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XCircle, UploadCloud, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import axios from 'axios';
import { API_BASE_URL } from '../config';

interface ImageUploaderProps {
  onImagesChange: (images: UploadedImage[]) => void;
  token: string | null;
  maxImages?: number;
  subfolder?: string;
}

export interface UploadedImage {
  id: string;
  url: string;
  uploading: boolean;
  progress: number;
  error?: string;
  file?: File;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImagesChange,
  token,
  maxImages = 9, // 默认最多9张图片
  subfolder = 'shareimages', // 默认子文件夹
}) => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 向父组件传递图片变更
  useEffect(() => {
    onImagesChange(uploadedImages);
  }, [uploadedImages, onImagesChange]);

  // 粘贴事件处理
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      
      // 检查是否已达到最大图片数量
      if (uploadedImages.length >= maxImages) {
        toast.warning(`最多只能上传${maxImages}张图片`);
        return;
      }

      const items = e.clipboardData.items;
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image'));
      
      if (imageItems.length > 0) {
        e.preventDefault(); // 防止默认粘贴行为
        
        // 计算可以继续上传的图片数量
        const remainingSlots = maxImages - uploadedImages.length;
        const itemsToProcess = imageItems.slice(0, remainingSlots);
        
        for (const item of itemsToProcess) {
          const file = item.getAsFile();
          if (file) {
            await handleImageUpload(file);
          }
        }
        
        if (imageItems.length > remainingSlots) {
          toast.warning(`已达到最大图片数量限制(${maxImages}张)，${imageItems.length - remainingSlots}张图片未上传`);
        }
      }
    };
    
    // 添加粘贴事件监听到容器
    const container = containerRef.current;
    if (container) {
      container.addEventListener('paste', handlePaste);
    }
    
    // 添加全局粘贴事件
    document.addEventListener('paste', handlePaste);
    
    return () => {
      if (container) {
        container.removeEventListener('paste', handlePaste);
      }
      document.removeEventListener('paste', handlePaste);
    };
  }, [uploadedImages, maxImages]);

  // 处理图片上传
  const handleImageUpload = async (file: File) => {
    // 验证文件类型和大小
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      toast.error('不支持的图片格式，请使用JPG、PNG、GIF、WEBP或AVIF格式');
      return;
    }
    
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('图片大小不能超过10MB');
      return;
    }
    
    // 创建图片预览
    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const previewUrl = URL.createObjectURL(file);
    
    // 添加到上传列表
    setUploadedImages(prev => [...prev, {
      id: imageId,
      url: previewUrl,
      file: file,
      uploading: true,
      progress: 0
    }]);
    
    // 创建FormData
    const formData = new FormData();
    formData.append('image', file);
    formData.append('subfolder', subfolder);
    
    try {
      // 使用axios上传带进度监控
      const response = await axios.post(
        `${API_BASE_URL}/api/upload/image`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadedImages(prev => prev.map(img => 
                img.id === imageId ? { ...img, progress } : img
              ));
            }
          }
        }
      );
      
      // 上传成功，更新状态
      if (response.data?.imageUrl) {
        URL.revokeObjectURL(previewUrl); // 释放预览URL
        setUploadedImages(prev => prev.map(img => 
          img.id === imageId ? { 
            ...img, 
            uploading: false,
            url: response.data.imageUrl,
            file: undefined // 上传成功后不再需要保存文件
          } : img
        ));
      } else {
        throw new Error('上传响应中缺少图片URL');
      }
    } catch (error) {
      console.error('图片上传失败:', error);
      setUploadedImages(prev => prev.map(img => 
        img.id === imageId ? { 
          ...img, 
          uploading: false, 
          error: '上传失败，点击重试'
        } : img
      ));
      toast.error('图片上传失败，请重试');
    }
  };

  // 重试上传
  const handleRetryUpload = (imageId: string) => {
    const imageToRetry = uploadedImages.find(img => img.id === imageId);
    if (imageToRetry?.file) {
      // 将图片标记为正在上传状态
      setUploadedImages(prev => prev.map(img => 
        img.id === imageId ? { ...img, uploading: true, progress: 0, error: undefined } : img
      ));
      // 重新上传
      handleImageUpload(imageToRetry.file);
    } else {
      // 如果没有文件对象（可能已被清理），则移除该图片
      handleRemoveImage(imageId);
    }
  };

  // 移除图片
  const handleRemoveImage = (imageId: string) => {
    setUploadedImages(prev => {
      // 找到要移除的图片
      const imageToRemove = prev.find(img => img.id === imageId);
      
      // 如果有blob预览URL，释放它
      if (imageToRemove && imageToRemove.url && imageToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      
      // 从状态中移除
      return prev.filter(img => img.id !== imageId);
    });
  };

  // 文件选择处理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // 检查是否已达到最大图片数量
    const remainingSlots = maxImages - uploadedImages.length;
    if (remainingSlots <= 0) {
      toast.warning(`最多只能上传${maxImages}张图片`);
      return;
    }
    
    // 转换为数组并筛选图片文件
    const validFiles = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .slice(0, remainingSlots);
    
    // 上传所有有效文件
    validFiles.forEach(file => {
      handleImageUpload(file);
    });
    
    // 清空input，允许重复选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // 显示提示信息（如果有文件被忽略）
    if (files.length > remainingSlots) {
      toast.warning(`已达到最大图片数量限制(${maxImages}张)，${files.length - remainingSlots}张图片未上传`);
    }
  };

  // 拖拽相关处理函数
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    // 检查是否已达到最大图片数量
    const remainingSlots = maxImages - uploadedImages.length;
    if (remainingSlots <= 0) {
      toast.warning(`最多只能上传${maxImages}张图片`);
      return;
    }
    
    // 处理拖拽的文件
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
        .filter(file => file.type.startsWith('image/'))
        .slice(0, remainingSlots);
      
      if (files.length === 0) {
        toast.warning('请拖放图片文件');
        return;
      }
      
      // 上传所有图片
      files.forEach(file => {
        handleImageUpload(file);
      });
      
      // 显示提示信息（如果有文件被忽略）
      if (e.dataTransfer.files.length > remainingSlots) {
        toast.warning(`已达到最大图片数量限制(${maxImages}张)，${e.dataTransfer.files.length - remainingSlots}张图片未上传`);
      }
    }
  };

  // 手动触发文件选择
  const triggerFileInput = () => {
    if (uploadedImages.length >= maxImages) {
      toast.warning(`最多只能上传${maxImages}张图片`);
      return;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative mt-4 mb-6 ${isDragging ? 'bg-blue-900/20' : 'bg-transparent'} transition-colors duration-300`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 图片上传区域 */}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-blue-900/20 backdrop-blur-sm border-2 border-dashed border-blue-400 rounded-lg text-center p-8"
          >
            <UploadCloud className="w-12 h-12 text-blue-300 mb-2" />
            <p className="text-blue-200 font-medium">拖放图片到此处上传</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 已上传图片显示区域 */}
      {uploadedImages.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {uploadedImages.map((image) => (
              <div 
                key={image.id} 
                className="relative group w-20 h-20 rounded-md overflow-hidden bg-gray-800/50 border border-gray-700/50"
              >
                {/* 图片预览 */}
                <img 
                  src={image.url} 
                  alt="上传预览" 
                  className="w-full h-full object-cover"
                />
                
                {/* 上传中状态 */}
                {image.uploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-1" />
                    <span className="text-xs text-blue-200">{image.progress}%</span>
                  </div>
                )}
                
                {/* 上传错误状态 */}
                {image.error && (
                  <div 
                    className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center cursor-pointer"
                    onClick={() => handleRetryUpload(image.id)}
                  >
                    <AlertCircle className="w-5 h-5 text-red-300 mb-1" />
                    <div className="flex items-center">
                      <RefreshCw className="w-3 h-3 text-red-300 mr-1" />
                      <span className="text-xs text-red-200">重试</span>
                    </div>
                  </div>
                )}
                
                {/* 删除按钮 */}
                <button
                  onClick={() => handleRemoveImage(image.id)}
                  className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  title="删除图片"
                >
                  <XCircle className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
            
            {/* 添加更多图片按钮 */}
            {uploadedImages.length < maxImages && (
              <button
                onClick={triggerFileInput}
                className="w-20 h-20 rounded-md border-2 border-dashed border-gray-600/50 flex flex-col items-center justify-center hover:border-blue-500/50 transition-colors text-gray-400 hover:text-blue-400"
                title="添加图片"
              >
                <UploadCloud className="w-6 h-6 mb-1" />
                <span className="text-xs">{uploadedImages.length}/{maxImages}</span>
              </button>
            )}
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            支持JPG、PNG、GIF等格式，最多{maxImages}张，单张不超过10MB
            {!isDragging && " (可直接粘贴或拖放)"}
          </p>
        </div>
      )}
      
      {/* 初始上传提示 - 仅在没有已上传图片时显示 */}
      {uploadedImages.length === 0 && (
        <div 
          onClick={triggerFileInput}
          className="border-2 border-dashed border-gray-600/50 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
        >
          <UploadCloud className="w-8 h-8 text-gray-500 mx-auto mb-2" />
          <p className="text-gray-400 mb-1">点击上传图片，或直接粘贴/拖放</p>
          <p className="text-xs text-gray-500">支持JPG、PNG、GIF等格式，最多{maxImages}张，单张不超过10MB</p>
        </div>
      )}
      
      {/* 隐藏的文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        multiple
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default ImageUploader; 