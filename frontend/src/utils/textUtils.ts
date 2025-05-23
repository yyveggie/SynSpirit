/**
 * 文本处理工具函数
 * 
 * 提供用于处理和格式化文本及日期的工具函数。
 */

/**
 * 从HTML内容中生成纯文本摘要
 * @param htmlContent HTML格式的内容
 * @param maxLength 最大长度，默认为30
 * @returns 纯文本摘要
 */
export const generateExcerpt = (htmlContent: string | undefined | null, maxLength: number = 30): string => {
  if (!htmlContent) return '';

  // 优先处理可能包含其他标签的特殊块
  let text = htmlContent.replace(/<span class="latex-inline.*?">.*?<\/span>/gi, '[公式]');
  text = text.replace(/<div class="latex-block.*?">.*?<\/div>/gi, '[公式]');
  text = text.replace(/<pre><code.*?<\/code><\/pre>/gi, '[代码块]');
  text = text.replace(/<figure class="media">.*?<iframe.*?><\/iframe>.*?<\/figure>/gi, '[视频]');
  text = text.replace(/<div class="video-container.*?">.*?<\/div>/gi, '[视频]');
  text = text.replace(/<video[^>]*>.*?<\/video>/gi, '[视频]');
  text = text.replace(/<img[^>]*>/gi, '[图片]');
  text = text.replace(/<figure[^>]*>(?!.*?<(?:iframe|img|video)).*?<\/figure>/gi, '[媒体]'); // 其他 figure 内容

  // 移除所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, '');

  // 替换空白字符并去除首尾空格
  text = text.replace(/\s+/g, ' ').trim();

  // 截断
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
};

/**
 * 将日期字符串格式化为相对时间
 * @param dateString 日期字符串
 * @returns 相对时间描述（如"5分钟前"）
 */
export const formatRelativeDate = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds}秒前`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
  
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * 标签颜色样式列表（避免蓝色）
 */
export const tagColorClasses = [
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
];

/**
 * 获取标签颜色样式
 * @param index 索引值
 * @returns 对应的颜色类名
 */
export const getTagColor = (index: number): string => tagColorClasses[index % tagColorClasses.length]; 