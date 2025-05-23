/**
 * 日期格式化工具函数
 * 
 * 将日期对象格式化为友好的字符串表示，基于距离当前时间的相对差异
 * - 1分钟内显示"刚刚"
 * - 1小时内显示"X分钟前"
 * - 24小时内显示"X小时前"
 * - 更久显示具体的年月日
 */

export const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // 小于1分钟，显示"刚刚"
  if (diffMinutes < 1) {
    return '刚刚';
  }
  
  // 小于1小时，显示"X分钟前"
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }
  
  // 小于24小时，显示"X小时前"
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }
  
  // 小于30天，显示"X天前"
  if (diffDays < 30) {
    return `${diffDays}天前`;
  }
  
  // 超过30天，显示具体的年月日
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 月份从0开始
  const day = date.getDate();
  
  const currentYear = now.getFullYear();
  
  // 如果是当前年份，只显示月日
  if (year === currentYear) {
    return `${month}月${day}日`;
  }
  
  // 不是当前年份，显示完整的年月日
  return `${year}年${month}月${day}日`;
}; 