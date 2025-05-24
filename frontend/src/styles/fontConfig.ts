/**
 * 全局字体配置文件
 * 
 * 此文件定义了整个网站使用的字体配置，便于统一管理和修改
 * 包含字体族、字重和相关CSS样式
 */

export const fontConfig = {
  // 主要字体族配置
  fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  
  // 默认字重
  fontWeight: 350,
  
  // 字体加载URL
  fontUrl: 'https://fonts.geekzu.org/css2?family=Noto+Sans+SC:wght@200&display=swap',
  
  // 生成全局字体CSS
  getGlobalFontStyles: () => `
    body {
      font-family: ${fontConfig.fontFamily};
      font-weight: ${fontConfig.fontWeight};
    }
  `,
  
  // 在head中动态加载字体的函数
  loadFontInHead: () => {
    // 创建link元素
    const link = document.createElement('link');
    link.href = fontConfig.fontUrl;
    link.rel = 'stylesheet';
    
    // 将link元素添加到head中
    document.head.appendChild(link);
    
    // 创建并添加style元素
    const style = document.createElement('style');
    style.textContent = fontConfig.getGlobalFontStyles();
    document.head.appendChild(style);
  }
};

export default fontConfig; 