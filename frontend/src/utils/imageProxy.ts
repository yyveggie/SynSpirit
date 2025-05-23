/**
 * 图片URL代理工具
 * 
 * 用于解决跨域图片加载问题，提供以下功能：
 * - 检测腾讯云COS图片链接
 * - 使用后端代理加载图片
 * - 自动处理本地和第三方图片链接
 * - 支持图片加载重试和回退
 * - 内置性能优化
 */

// 图片代理配置
const CONFIG = {
  // 最大重试次数
  MAX_RETRIES: 2,
  // 代理域名列表（用于负载均衡或CDN，当前未启用）
  PROXY_DOMAINS: ['/api/upload/proxy/image'],
  // 重试延迟（毫秒）
  RETRY_DELAY: 1000,
  // 是否在开发模式下启用调试日志
  DEBUG: true, // 总是启用调试日志来查找问题
  // 图片加载超时（毫秒）
  TIMEOUT: 15000, // 增加超时时间，因为数据万象首次处理可能需要更长时间
  // 是否禁用缓存
  DISABLE_CACHE: false,
  // 优先尝试直接加载COS图片
  PRIORITIZE_DIRECT_COS: false,
  // 动态栏图片优先级低，先加载低质量版本
  DYNAMIC_FEED_LOW_QUALITY_FIRST: true
};

// 失败URL记录，避免重复请求已知失败的链接
const failedUrls = new Set<string>();

// 图片域名健康状态
const domainHealth = CONFIG.PROXY_DOMAINS.reduce((acc, domain) => {
  acc[domain] = { failures: 0, lastFailure: 0 };
  return acc;
}, {} as Record<string, {failures: number, lastFailure: number}>);

/**
 * 检查是否是腾讯云COS图片URL
 * @param url 要检查的URL
 * @returns 是否是腾讯云COS图片
 */
export const isCosImageUrl = (url: string): boolean => {
  if (!url) return false;
  
  try {
    const parsedUrl = new URL(url);
    // 添加确切的域名匹配，确保匹配正确的腾讯云COS域名
    return parsedUrl.hostname.includes('myqcloud.com') || 
           parsedUrl.hostname.includes('cos.ap-') || 
           parsedUrl.hostname.includes('synspirit-test-1313131901.cos.ap-shanghai.myqcloud.com');
  } catch (e) {
    // 如果不是有效的URL，返回false
    return false;
  }
};

/**
 * 选择最健康的代理域名
 * @returns 代理域名
 */
const selectProxyDomain = (): string => {
  // 当前只有一个代理域名，直接返回
  return CONFIG.PROXY_DOMAINS[0];
  
  /* 保留多域名支持代码，未来扩展使用
  // 按失败次数和最后失败时间排序
  const domains = [...CONFIG.PROXY_DOMAINS].sort((a, b) => {
    const healthA = domainHealth[a];
    const healthB = domainHealth[b];
    
    // 首先按失败次数排序
    if (healthA.failures !== healthB.failures) {
      return healthA.failures - healthB.failures;
    }
    
    // 失败次数相同，按最后失败时间排序（优先选择恢复时间更长的）
    return healthA.lastFailure - healthB.lastFailure;
  });
  
  return domains[0];
  */
};

/**
 * 记录域名失败
 * @param domain 失败的域名
 */
const recordDomainFailure = (domain: string): void => {
  if (domainHealth[domain]) {
    domainHealth[domain].failures += 1;
    domainHealth[domain].lastFailure = Date.now();
  }
  
  if (CONFIG.DEBUG) {
    console.warn(`图片代理域名 ${domain} 请求失败，当前失败次数: ${domainHealth[domain]?.failures}`);
  }
};

/**
 * 检查图片URL是否可以预加载
 * @param url 图片URL
 * @returns 是否应该加载
 */
const shouldLoadImage = (url: string): boolean => {
  // 如果URL已经在失败列表中，避免重复请求
  if (failedUrls.has(url)) {
    if (CONFIG.DEBUG) {
      console.warn(`跳过已知失败的图片URL: ${url}`);
    }
    return false;
  }
  
  return true;
};

/**
 * 为动态栏图片添加低质量加载参数
 * @param url 原始COS图片URL
 * @returns 添加了低质量参数的URL
 */
const addLowQualityParamsToCosUrl = (url: string): string => {
  if (!url || !isCosImageUrl(url)) return url;
  
  try {
    // 检查URL是否已经包含查询参数
    const hasQuery = url.includes('?');
    
    // 直接添加数据万象参数，正确格式
    // 使用腾讯云数据万象提供的图像处理能力
    // 使用!50p表示按原图大小的50%缩小，同时限制最大宽度为400像素
    const processedUrl = url + (hasQuery ? '&' : '?') + 'imageMogr2/thumbnail/!50p/scrop/400x400/quality/75';
    
    return processedUrl;
  } catch (e) {
    if (CONFIG.DEBUG) {
      console.error(`添加低质量参数失败: ${e}`);
    }
    return url;
  }
};

/**
 * 获取代理图片URL
 * @param url 原始图片URL
 * @param retryCount 重试计数
 * @returns 处理后的图片URL
 */
export const getProxiedImageUrl = (
  url: string, 
  options: { 
    noCache?: boolean,
    retryCount?: number,
    isDynamicFeed?: boolean
  } = {}
): string => {
  if (!url) return '';
  
  const { 
    noCache = CONFIG.DISABLE_CACHE, 
    retryCount = 0,
    isDynamicFeed = false
  } = options;
  
  // 如果是data:URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  // 如果是相对路径，直接返回
  if (url.startsWith('/')) {
    return url;
  }
  
  // 对所有外部图片使用代理，不限于COS
  // 已经重试达到最大次数，标记为失败并返回默认图片
  if (retryCount >= CONFIG.MAX_RETRIES) {
    if (!failedUrls.has(url)) {
      failedUrls.add(url);
      if (CONFIG.DEBUG) {
        console.error(`图片加载失败，已达最大重试次数: ${url}`);
      }
    }
    // 返回默认图片或原始URL
    return '/images/image-error.png';
  }
  
  // 如果是重试请求，优先使用代理
  if (retryCount > 0) {
    // 选择一个健康的代理域名
    const proxyDomain = selectProxyDomain();
    const queryParams = new URLSearchParams();

    let fullyDecodedUrlRetry = url;
    let currentUrlToDecodeRetry = url;
    if (CONFIG.DEBUG) console.log(`[getProxiedImageUrl Retry Path] Initial URL for iterative decode: "${currentUrlToDecodeRetry}"`);
    try {
        for (let i = 0; i < 5; i++) {
            const decodedOnce = decodeURIComponent(currentUrlToDecodeRetry);
            if (CONFIG.DEBUG) console.log(`[getProxiedImageUrl Retry Path] Decode attempt ${i+1}: "${currentUrlToDecodeRetry}" -> "${decodedOnce}"`);
            if (decodedOnce === currentUrlToDecodeRetry) {
                fullyDecodedUrlRetry = decodedOnce;
                if (CONFIG.DEBUG) console.log(`[getProxiedImageUrl Retry Path] Iterative decode finished. Final raw URL: "${fullyDecodedUrlRetry}"`);
                break;
            }
            currentUrlToDecodeRetry = decodedOnce;
            fullyDecodedUrlRetry = currentUrlToDecodeRetry;
            if (i === 4 && CONFIG.DEBUG) console.log(`[getProxiedImageUrl Retry Path] Max decode attempts reached. Using: "${fullyDecodedUrlRetry}"`);
        }
    } catch (e) {
        if (CONFIG.DEBUG) {
            console.warn(`[getProxiedImageUrl Retry Path] Error during iterative decoding for URL: "${url}". Using last good: "${fullyDecodedUrlRetry}". Error:`, e);
        }
    }
    if (CONFIG.DEBUG) console.log(`[getProxiedImageUrl Retry Path] URL for queryParams.append (should be raw): "${fullyDecodedUrlRetry}"`);
    queryParams.append('url', fullyDecodedUrlRetry);
    
    // 如果需要禁用缓存
    // 确保 noCache 选项得到遵守，并且重试时强制 no_cache (如果全局 disable_cache 为 false)
    if (noCache || (retryCount > 0 && !CONFIG.DISABLE_CACHE)) {
      queryParams.append('no_cache', '1');
    }
    
    // 如果是重试请求，添加_t参数以避免浏览器缓存
    queryParams.append('_t', Date.now().toString());
    
    const finalUrl = `${proxyDomain}?${queryParams.toString()}`;
    
    return finalUrl;
  }
  
  // 优先策略1: 对于动态栏图片，先尝试加载低质量版本
  if (isDynamicFeed && CONFIG.DYNAMIC_FEED_LOW_QUALITY_FIRST && isCosImageUrl(url)) {
    return addLowQualityParamsToCosUrl(url);
  }
  
  // 优先策略2: 如果配置为优先使用直接链接且是腾讯云COS链接
  if (CONFIG.PRIORITIZE_DIRECT_COS && isCosImageUrl(url) && retryCount === 0) {
    // 第一次尝试直接使用COS链接
    return url;
  }
  
  // 选择一个健康的代理域名
  const proxyDomain = selectProxyDomain();
  
  // 添加查询参数
  const queryParams = new URLSearchParams();

  let fullyDecodedUrlDefault = url;
  let currentUrlToDecodeDefault = url;
  try {
      for (let i = 0; i < 5; i++) {
          const decodedOnce = decodeURIComponent(currentUrlToDecodeDefault);
          if (decodedOnce === currentUrlToDecodeDefault) {
              fullyDecodedUrlDefault = decodedOnce;
              break;
          }
          currentUrlToDecodeDefault = decodedOnce;
          fullyDecodedUrlDefault = currentUrlToDecodeDefault;
      }
  } catch (e) {
  }
  queryParams.append('url', fullyDecodedUrlDefault);
  
  // 如果需要禁用缓存
  if (noCache) {
    queryParams.append('no_cache', '1');
  }
  
  // 如果是重试请求，添加_t参数以避免浏览器缓存
  if (retryCount > 0) {
    queryParams.append('_t', Date.now().toString());
  }
  
  const finalUrl = `${proxyDomain}?${queryParams.toString()}`;
  
  return finalUrl;
};

/**
 * 修复图片URL，如果是腾讯云COS图片则使用代理
 * @param url 原始图片URL
 * @param noCache 是否禁用缓存
 * @param isDynamicFeed 是否为动态栏图片
 * @returns 处理后的图片URL
 */
export const fixImageUrl = (
  url: string, 
  noCache: boolean = false,
  isDynamicFeed: boolean = false
): string => {
  // 使用优化后的策略处理图片URL
  return getProxiedImageUrl(url, { noCache, isDynamicFeed });
};

/**
 * 处理图片加载错误，执行重试逻辑
 * @param url 原始URL（非代理URL）
 * @param imageElement 图片DOM元素
 * @param retryCount 当前重试次数
 * @param isDynamicFeed 是否为动态栏图片
 */
export const handleImageLoadError = (
  url: string,
  imageElement: HTMLImageElement | null,
  retryCount: number = 0,
  isDynamicFeed: boolean = false
): void => {
  if (!imageElement || !url) return;
  
  // 记录当前使用的源失败
  if (retryCount === 0 && CONFIG.PRIORITIZE_DIRECT_COS && isCosImageUrl(url)) {
    // 第一次失败，是直接使用COS链接失败，下一次尝试用代理
    if (CONFIG.DEBUG) {
      console.warn(`直接加载COS图片失败，尝试使用代理: ${url}`);
    }
  } else {
    // 记录代理域名失败
    try {
      const currentSrc = new URL(imageElement.src);
      const domain = `${currentSrc.protocol}//${currentSrc.host}${currentSrc.pathname}`;
      recordDomainFailure(domain);
    } catch (e) {
      // 忽略URL解析错误
    }
  }
  
  // 如果还可以重试
  if (retryCount < CONFIG.MAX_RETRIES) {
    const nextRetry = retryCount + 1;
    
    // 延迟重试，避免立即请求
    setTimeout(() => {
      if (CONFIG.DEBUG) {
        console.warn(`重试加载图片(${nextRetry}/${CONFIG.MAX_RETRIES}): ${url}`);
      }
      
      // 使用新的重试参数获取代理URL
      // 第一次重试时如果是动态栏图片且是COS图片，尝试不使用数据万象处理
      const newProxiedUrl = getProxiedImageUrl(url, { 
        retryCount: nextRetry,
        noCache: true, // 重试时禁用缓存
        isDynamicFeed: isDynamicFeed && nextRetry > 1 // 第一次重试如果是COS图片，尝试使用原图
      });
      
      // 设置新的加载错误处理程序
      imageElement.onerror = () => {
        // 直接执行重试逻辑
        handleImageLoadError(url, imageElement, nextRetry, isDynamicFeed);
        return true; // 阻止默认错误处理
      };
      
      // 设置超时定时器检测
      if (retryCount === 0) {
        setTimeout(() => {
          // 检查图片是否已加载完成
          if (!imageElement.complete && imageElement.src !== newProxiedUrl) {
            if (CONFIG.DEBUG) {
              console.warn(`图片加载超时，切换到代理: ${url}`);
            }
            // 使用代理但不使用数据万象处理，直接获取原图
            let fallbackUrl = url;
            if (isCosImageUrl(url)) {
              // 如果是COS图片，移除可能存在的数据万象参数
              try {
                const urlObj = new URL(url);
                // 移除所有imageMogr2开头的参数
                const params = Array.from(urlObj.searchParams.keys());
                params.forEach(key => {
                  if (key.startsWith('imageMogr2')) {
                    urlObj.searchParams.delete(key);
                  }
                });
                fallbackUrl = urlObj.toString();
              } catch(e) {
                // 解析失败，使用原始URL
                console.error('清除数据万象参数失败:', e);
              }
            }
            
            // 使用代理加载原图
            imageElement.src = getProxiedImageUrl(fallbackUrl, { 
              retryCount: 1,
              noCache: true,
              isDynamicFeed: false // 禁用低质量处理
            });
          }
        }, CONFIG.TIMEOUT);
      }
      
      // 重新设置src尝试加载
      imageElement.src = newProxiedUrl;
    }, CONFIG.RETRY_DELAY * Math.pow(1.5, retryCount)); // 指数退避策略
  }
}; 