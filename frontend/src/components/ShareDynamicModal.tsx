/**
 * 此文件定义了 ShareDynamicModal 组件，一个专门用于分享/转发动态的模态框。
 *
 * 主要功能:
 * - 接收要分享的动态数据作为 props。
 * - 提供一个文本输入框让用户添加分享评论。
 * - 支持图片上传、拖拽、粘贴功能。
 * - 展示多种分享平台选项，包括系统原生分享功能。
 * - 调用 API 执行分享/转发操作。
 * - 处理提交状态和错误显示。
 *
 * 注意: 如果新增、删除或修改功能，必须在这开头的注释中同步修改，
 * 如发现功能与注释描述不同，也可以在确定后修改。
 */
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify'; // 引入toast用于复制链接成功提示
import { Send, Link2, Share2, MoreHorizontal, Loader2 } from 'lucide-react'; // 引入Lucide图标
import { motion, AnimatePresence } from 'framer-motion'; // 引入动画组件
import ImageUploader, { UploadedImage } from './ImageUploader'; // 引入图片上传组件
import { useAuth } from '../context/AuthContext'; // 引入认证上下文
import { FaLink, FaWeibo } from 'react-icons/fa'; // 引入新的图标
import Modal from './Modal'; // 引入Modal组件

interface ShareDynamicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string, images?: string[]) => Promise<void>; 
  comment: string;
  setComment: React.Dispatch<React.SetStateAction<string>>;
  error: string | null;
  isLoading: boolean;
  dynamicToShare: any;
  username: string;
  altText: string;
}

const ShareDynamicModal: React.FC<ShareDynamicModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  comment, 
  setComment, 
  error,
  isLoading,
  dynamicToShare,
  username,
  altText
}) => {
  // 检查系统分享 API 是否可用
  const [isShareApiAvailable, setIsShareApiAvailable] = useState(false);
  // 是否展开更多分享平台
  const [showMorePlatforms, setShowMorePlatforms] = useState(false);
  // 上传的图片列表
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  // 获取认证信息以获取令牌
  const { token } = useAuth();
  
  // 检查是否所有图片都已上传完成
  const allImagesUploaded = uploadedImages.every(img => !img.uploading && !img.error);
  
  useEffect(() => {
    // 在组件挂载后检查 navigator.share API 是否可用
    setIsShareApiAvailable(
      typeof navigator !== 'undefined' && 
      typeof navigator.share === 'function'
    );
    
    // 如果有初始图片，添加到上传列表
    if (dynamicToShare?.images && dynamicToShare.images.length > 0) {
      const initialUploadedImages = dynamicToShare.images.map((url: string, index: number) => ({
        id: `initial_${index}`,
        url,
        file: null // 标记为初始图片，没有对应的 File 对象
      }));
      setUploadedImages(initialUploadedImages);
    }
  }, [dynamicToShare?.images]);

  // 处理图片变更
  const handleImagesChange = (images: UploadedImage[]) => {
    setUploadedImages(images);
  };

  // 处理分享提交
  const handleSubmit = async () => {
    if (!allImagesUploaded) {
      toast.warning('请等待所有图片上传完成');
      return;
    }
    
    // 收集已成功上传的图片URL列表
    const imageUrls = uploadedImages
      .filter(img => !img.uploading && !img.error)
      .map(img => img.url);
    
    // 调用提交回调，传递评论和图片URL
    await onSubmit(comment, imageUrls);
  };

  // 处理复制链接
  const handleCopyLink = () => {
    // 获取动态ID，优先使用action_id，如果没有则使用id
    const dynamicId = dynamicToShare?.action_id || dynamicToShare?.id;
    if (!dynamicId) {
      toast.error('无法获取动态ID');
      return;
    }
    
    // 生成分享链接
    const origin = window.location.origin;
    const shareUrl = `${origin}/dynamic/${dynamicId}`;
    
    navigator.clipboard.writeText(shareUrl)
      .then(() => toast.success('动态链接已复制到剪贴板，可直接分享'))
      .catch(() => toast.error('无法复制链接'));
  };

  // 生成分享链接的通用函数
  const generateShareUrl = () => {
    const dynamicId = dynamicToShare?.action_id || dynamicToShare?.id;
    if (!dynamicId) {
      toast.error('无法获取动态ID');
      return null;
    }
    
    const origin = window.location.origin;
    return `${origin}/dynamic/${dynamicId}`;
  };

  // 打开X(Twitter)分享
  const handleTwitterShare = () => {
    const shareUrl = generateShareUrl();
    if (!shareUrl) return;
    
    const shareText = comment ? `${comment} - ${username}` : `来自 ${username} 的分享`; // 使用评论或默认文本
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  // 打开微博分享
  const handleWeiboShare = () => {
    const shareUrl = generateShareUrl();
    if (!shareUrl) return;
    
    const shareText = comment ? `${comment} - ${username}` : `来自 ${username} 的分享`;
    window.open(`https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`, '_blank');
  };

  // 使用系统分享API（如果可用）
  const handleSystemShare = () => {
    const shareUrl = generateShareUrl();
    if (!shareUrl) return;
    
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const shareText = comment ? `${comment} - ${username}` : `来自 ${username} 的分享`;
      navigator.share({
        title: `分享 - ${username}`,
        text: shareText,
        url: shareUrl
      }).catch((err) => {
        console.error('分享API错误:', err);
        toast.error('无法使用系统分享功能');
      });
    } else {
      toast.info('您的浏览器不支持系统分享功能');
    }
  };

  // 更多分享平台选项
  const additionalPlatforms = [
    {
      name: 'WhatsApp',
      icon: (
        <svg className="w-6 h-6 text-green-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      onClick: () => {
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        window.open(`https://wa.me/?text=${encodeURIComponent(comment ? `${comment} - ${username}` : `来自 ${username} 的分享` + ' ' + shareUrl)}`, '_blank');
      }
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      onClick: () => {
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
      }
    },
    {
      name: 'Gmail',
      icon: (
        <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
        </svg>
      ),
      onClick: () => {
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        window.open(`mailto:?subject=${encodeURIComponent(`分享 - ${username}`)}&body=${encodeURIComponent(comment ? `${comment} - ${shareUrl}` : shareUrl)}`, '_blank');
      }
    },
    {
      name: 'Outlook',
      icon: (
        <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v1.83l2.41-1.46.17-.11.17-.05zm.01 3.17v3.08h3.74v-3.08zm4.49 3.08H23.99v-3.08h-6.23z" />
        </svg>
      ),
      onClick: () => {
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        window.open(`mailto:?subject=${encodeURIComponent(`分享 - ${username}`)}&body=${encodeURIComponent(comment ? `${comment} - ${shareUrl}` : shareUrl)}`, '_blank');
      }
    },
    // 增加微信分享选项
    {
      name: '微信',
      icon: (
        <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8.686 13.562c-0.575 0-1.042-0.467-1.042-1.042s0.467-1.042 1.042-1.042c0.575 0 1.042 0.467 1.042 1.042s-0.467 1.042-1.042 1.042zM14.25 13.562c-0.575 0-1.042-0.467-1.042-1.042s0.467-1.042 1.042-1.042c0.575 0 1.042 0.467 1.042 1.042s-0.467 1.042-1.042 1.042zM20.002 16.271c0.038-0.277 0.063-0.558 0.063-0.845 0-3.489-3.258-6.32-7.277-6.32s-7.277 2.83-7.277 6.32c0 3.489 3.258 6.32 7.277 6.32 0.847 0 1.662-0.126 2.423-0.363l0.212 0.147c0.939 0.491 1.999 0.693 3.089 0.595 0.253-0.023 0.451-0.224 0.473-0.477s-0.136-0.477-0.374-0.543c-0.709-0.195-1.296-0.655-1.608-1.242 0.006-0.004 0.012-0.008 0.017-0.012 0.93-0.588 1.631-1.442 1.983-2.462l0-0.119zM6.857 4.322c-4.455 0.006-8.071 3.113-8.071 6.936 0 2.126 1.151 4.008 2.934 5.231l-0.014 0.009c-0.348 0.652-0.997 1.16-1.788 1.383-0.264 0.073-0.439 0.339-0.414 0.615 0.024 0.28 0.245 0.505 0.525 0.53 1.212 0.108 2.386-0.116 3.433-0.662l0.235-0.163c0.844 0.262 1.752 0.404 2.697 0.403 4.012 0 7.337-2.692 8.017-6.22-1.436-3.215-4.861-5.455-8.864-5.455-0.264 0-0.526 0.011-0.786 0.033 0.003-0.069 0.005-0.138 0.005-0.207 0-0.807-0.133-1.588-0.381-2.316 0.012-0.032 0.022-0.065 0.035-0.098 0.048-0.12 0.108-0.22 0.158-0.328-0.166 0.007-0.343 0.023-0.553 0.023-1.088 0-2.142-0.213-3.099-0.595l0.126-0.106c1.682-1.495 3.908-2.403 6.347-2.35-0.047-0.388-0.183-0.733-0.399-1.015 0.109-0.158 0.226-0.326 0.319-0.516-0.094 0.013-0.184 0.033-0.278 0.042-0.832 0.097-1.75-0.06-2.575-0.493l-0.074-0.05c-0.469 0.118-0.963 0.18-1.473 0.18-0.089 0-0.177-0.002-0.265-0.006h0.013z" />
        </svg>
      ),
      onClick: () => { 
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        // 因为微信需要在微信环境内才能直接分享，所以这里只能提示用户手动分享或复制链接
        navigator.clipboard.writeText(shareUrl)
          .then(() => toast.info('微信分享请点击右上角菜单或复制链接分享给好友（链接已复制到剪贴板）'))
          .catch(() => toast.error('无法复制链接')); 
      }
    },
    // 增加小红书分享选项
    {
      name: '小红书',
      icon: (
        <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.4,6.572h-4.137c0.146-0.496,0.22-1.009,0.22-1.521c0.001-2.956-2.396-5.357-5.351-5.36  C7.177-0.309,4.782,2.094,4.783,5.051c0,0.513,0.074,1.025,0.221,1.521H0.865C0.386,6.572,0,6.958,0,7.439v10.897  c0,0.48,0.386,0.866,0.865,0.866H19.4c0.479,0,0.867-0.389,0.867-0.866V7.439C20.267,6.958,19.879,6.572,19.4,6.572z   M10.133,2.691c1.328,0,2.407,1.079,2.408,2.41c0,1.328-1.08,2.407-2.408,2.407S7.728,6.429,7.728,5.101  C7.728,3.773,8.806,2.691,10.133,2.691z M10.133,10.441L7.728,15.22l4.813-1.182L10.133,10.441z" />
        </svg>
      ),
      onClick: () => { 
        const shareUrl = generateShareUrl();
        if (!shareUrl) return;
        // 小红书没有官方Web分享API，所以这里也是提示用户手动操作
        navigator.clipboard.writeText(shareUrl)
          .then(() => toast.info('请在小红书APP中搜索并分享（链接已复制到剪贴板）'))
          .catch(() => toast.error('无法复制链接')); 
      }
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`转发给 ${username}`} altText={altText}>
      <div className="relative mb-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="说点什么吧...（可选）"
          rows={6}
          className="w-full p-4 rounded-lg bg-gray-700/30 border border-gray-600/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-white resize-none text-base"
          disabled={isLoading}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && allImagesUploaded) { handleSubmit(); } }}
        />
        
        <motion.button
          onClick={handleSubmit}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className={`absolute bottom-4 right-4 p-2 rounded-full bg-transparent hover:bg-blue-500/20 transition-colors ${isLoading || !allImagesUploaded ? 'text-gray-400 hover:text-gray-300' : 'text-blue-400 hover:text-blue-300'}`}
          disabled={isLoading || !allImagesUploaded}
          aria-label="发送"
          title={!allImagesUploaded ? "等待图片上传完成" : "发送"}
        >
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Send className="h-6 w-6" />
          )}
        </motion.button>
      </div>
      
      <ImageUploader 
        onImagesChange={handleImagesChange} 
        token={token}
        maxImages={9}
        subfolder="share_images"
      />

      {error && (
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-red-400 mb-4"
        >
          {error}
        </motion.p>
      )}

      <div className="flex justify-center space-x-6 mb-4">
        <motion.button 
          onClick={handleTwitterShare}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className="p-3 bg-gray-700/30 hover:bg-gray-900/40 rounded-full transition-colors"
          title="分享到 X (Twitter)"
        >
          <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.6823 10.6218L20.2391 3H18.6854L12.9921 9.61788L8.44486 3H3.2002L10.0765 13.0074L3.2002 21H4.75404L10.7663 14.0113L15.5541 21H20.7988L13.6819 10.6218H13.6823ZM11.5541 13.0956L10.8574 12.0991L5.31391 4.16971H7.70053L12.1742 10.5689L12.8709 11.5655L18.6861 19.8835H16.2995L11.5541 13.096V13.0956Z" />
          </svg>
        </motion.button>
        
        <motion.button 
          onClick={handleCopyLink}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className="p-3 bg-gray-700/30 hover:bg-indigo-900/40 rounded-full transition-colors"
          title="复制链接"
        >
          <FaLink className="h-5 w-5 text-indigo-400" />
        </motion.button>
        
        <motion.button 
          onClick={handleWeiboShare}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className="p-3 bg-gray-700/30 hover:bg-red-900/40 rounded-full transition-colors"
          title="分享到微博"
        >
          <FaWeibo className="h-5 w-5 text-red-400" />
        </motion.button>
        
        {isShareApiAvailable ? (
          <motion.button 
            onClick={handleSystemShare}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="p-3 bg-gray-700/30 hover:bg-green-900/40 rounded-full transition-colors"
            title="系统分享"
          >
            <Share2 className="h-5 w-5 text-green-400" />
          </motion.button>
        ) : (
          <motion.button 
            onClick={() => setShowMorePlatforms(!showMorePlatforms)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            className="p-3 bg-gray-700/30 hover:bg-purple-900/40 rounded-full transition-colors"
            title="更多分享选项"
          >
            <MoreHorizontal className="h-5 w-5 text-purple-400" />
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {showMorePlatforms && (
          <motion.div 
            className="flex justify-center space-x-6 mt-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            {additionalPlatforms.map((platform, index) => (
              <motion.button 
                key={index}
                onClick={platform.onClick}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className="p-3 bg-gray-700/30 hover:bg-gray-600/50 rounded-full transition-colors"
                title={`分享到 ${platform.name}`}
              >
                {platform.icon}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
};

export default ShareDynamicModal; 