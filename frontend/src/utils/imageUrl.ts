// frontend/src/utils/imageUrl.ts
import { API_BASE_URL } from '../config';

/**
 * Represents a media item extracted from HTML content.
 */
export interface MediaItem {
    type: 'image' | 'video';
    url: string;
}

/**
 * @deprecated 使用getCosImageUrl代替
 * Constructs the correct image URL, handling external, COS, and relative paths.
 * Only processes image paths, returns video URLs directly.
 * @param imagePath The path or URL from the database.
 * @returns The final image URL or undefined.
 */
export const getImageUrlLegacy = (imagePath: string | null | undefined): string | undefined => {
    if (!imagePath) return undefined;
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    if (imagePath.startsWith('/static') || imagePath.startsWith('uploads/')) {
        if (!API_BASE_URL) {
            console.error("API_BASE_URL is not defined for constructing image URL.");
            return imagePath; // Fallback
        }

        // Separate checks for type and format
        if (typeof API_BASE_URL !== 'string') {
            console.error("API_BASE_URL is not a string:", API_BASE_URL);
            return imagePath; // Fallback
        }
        // Use type assertion here to bypass the persistent inference issue
        if (!(API_BASE_URL as string).includes('//')) {
             console.error("Invalid API_BASE_URL format (missing //):", API_BASE_URL);
             return imagePath; // Fallback
        }
        
        // Now we can likely use API_BASE_URL directly, or keep the validated variable
        const validatedApiBaseUrl = API_BASE_URL as string;

        try {
            // Use the validated variable
            const urlParts = validatedApiBaseUrl.split('/');
            if (urlParts.length < 3 || !urlParts[2]) {
                 console.error("Invalid API_BASE_URL format:", validatedApiBaseUrl);
                 return imagePath; // Fallback
            }
            const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
            return `${baseUrlWithoutPath}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
        } catch (e) {
             console.error("Error parsing API_BASE_URL:", validatedApiBaseUrl, e);
             return imagePath; // Fallback
        }
    }
    // Fallback for other cases or potentially invalid paths
    return imagePath;
};

/**
 * @deprecated 使用extractSimpleMediaItems代替
 * Extracts all image and video (iframe) source URLs from an HTML string.
 * @param htmlContent The HTML content to parse.
 * @returns An array of MediaItem objects found, in order of appearance.
 */
export const extractMediaItems = (htmlContent: string | null | undefined): MediaItem[] => {
    if (!htmlContent) return [];

    const mediaItems: MediaItem[] = [];
    
    // 先处理Markdown格式的图片链接
    const markdownImageRegex = /!\[(.*?)\]\((https?:\/\/[^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(htmlContent)) !== null) {
        if (match[2] && match[2].trim() !== '') {
            mediaItems.push({ type: 'image', url: match[2] });
        }
    }
    
    // 处理视频占位符 - YouTube
    const youtubeRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g;
    while ((match = youtubeRegex.exec(htmlContent)) !== null) {
        if (match[1] && match[1].trim() !== '') {
            mediaItems.push({ type: 'video', url: `https://www.youtube.com/embed/${match[2]}` });
        }
    }
    
    // 处理视频占位符 - Bilibili
    const bilibiliRegex = /\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g;
    while ((match = bilibiliRegex.exec(htmlContent)) !== null) {
        if (match[1] && match[1].trim() !== '') {
            mediaItems.push({ type: 'video', url: `https://player.bilibili.com/player.html?bvid=${match[2]}&page=1` });
        }
    }

    // 然后处理HTML格式的图片和视频
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            // 在解析前，先处理Markdown图片格式为HTML格式，以防DOMParser无法解析Markdown
            const processedHtml = htmlContent
                .replace(/!\[(.*?)\]\((https?:\/\/[^)]+)\)/g, '<img src="$2" alt="$1">')
                .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+))\]/g, 
                    '<iframe src="https://www.youtube.com/embed/$2"></iframe>')
                .replace(/\[视频占位符:\s*(https?:\/\/(?:www\.)?bilibili\.com\/video\/([A-Za-z0-9]+)(?:\/)?.*?)\]/g,
                    '<iframe src="https://player.bilibili.com/player.html?bvid=$2&page=1"></iframe>');
            
            const doc = parser.parseFromString(processedHtml, 'text/html');
            
            // Select both images and iframes in their document order
            const mediaElements = doc.querySelectorAll('img, iframe');

            mediaElements.forEach(element => {
                let src: string | null = null;
                let type: 'image' | 'video' | null = null;

                if (element.tagName.toLowerCase() === 'img') {
                    src = element.getAttribute('src');
                    type = 'image';
                } else if (element.tagName.toLowerCase() === 'iframe') {
                    src = element.getAttribute('src');
                    type = 'video'; 
                }

                // Basic validation
                if (src && src.trim() !== '' && !src.startsWith('data:')) {
                    // 检查是否已经存在相同URL的媒体项，避免重复
                    const exists = mediaItems.some(item => item.url === src);
                    if (!exists && type) {
                        mediaItems.push({ type, url: src });
                    }
                }
            });
        } catch (error) {
            console.error("Error parsing HTML for media extraction:", error);
        }
    } else {
        console.warn("DOMParser not available. Skipping HTML media extraction.");
    }
    
    return mediaItems;
};

/**
 * 从内容中提取媒体项目（图片、视频等），简化版
 */
export function extractSimpleMediaItems(content: string): string[] {
  // 提取图片链接 ![alt](url)
  const imageRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  let match;
  const mediaItems: string[] = [];

  while ((match = imageRegex.exec(content)) !== null) {
    mediaItems.push(match[1]);
  }

  return mediaItems;
}

/**
 * 获取图片完整URL，具有COS支持
 * @param url 图片URL（可能是相对路径或完整URL）
 * @returns 处理后的完整URL
 */
export function getCosImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // 已经是完整URL - 包括腾讯云COS
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // 如果是腾讯云COS URL，确保CORS配置正确
    if (url.includes('cos.ap-shanghai.myqcloud.com')) {
      // 添加缓存控制参数，避免重复加载
      // 注意：只在开发环境添加，生产环境应该利用正常的缓存机制
      if (process.env.NODE_ENV === 'development') {
        // 检查URL是否已经有查询参数
        const hasQueryParams = url.includes('?');
        // 为URL添加cache时间戳参数，使浏览器长时间缓存（1小时）
        // 使用Math.floor(Date.now() / 3600000)将时间戳精度降低到小时级别
        const cacheParam = `${hasQueryParams ? '&' : '?'}_t=${Math.floor(Date.now() / 3600000)}`;
        return `${url}${cacheParam}`;
      }
      return url; // 直接使用完整URL
    }
    return url; // 其他完整URL
  }
  
  // 处理相对路径
  const urlParts = API_BASE_URL.split('/');
  const baseUrlWithoutPath = `${urlParts[0]}//${urlParts[2]}`;
  
  if (url.startsWith('/static')) {
    return `${baseUrlWithoutPath}${url}`;
  }
  
  if (url.startsWith('uploads/')) {
    return `${baseUrlWithoutPath}/static/${url}`;
  }
  
  if (!url.includes('/')) {
    return `${baseUrlWithoutPath}/static/uploads/${url}`;
  }
  
  // 默认返回原始URL
  return url;
}
 