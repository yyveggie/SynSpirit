/**
 * latexHelper.ts - LaTeX公式渲染辅助工具
 * 提供了渲染页面中LaTeX公式的支持函数
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

// LaTeX渲染函数类型定义
export type RenderLatexFunction = (latex: string, displayMode: boolean, element: HTMLElement) => void;

/**
 * 预处理LaTeX代码，移除不兼容字符
 * @param latex LaTeX代码
 * @returns 处理后的LaTeX代码
 */
const preprocessLatex = (latex: string): string => {
  if (!latex) return '';
  
  // 移除零宽空格(U+200B)和其他不可见Unicode字符
  return latex
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 移除零宽字符
    .replace(/\\\\(\s*)/g, '\\\\')          // 修复多余的换行空格
    .trim();                                // 移除首尾空格
};

/**
 * 初始化LaTeX公式渲染观察者
 * 使用MutationObserver监听DOM变化，自动渲染新增的LaTeX公式
 * @param renderLatex 渲染LaTeX的回调函数
 * @returns MutationObserver实例
 */
export const initLatexObserver = (renderLatex: RenderLatexFunction): MutationObserver => {
  const renderFunction = (latex: string, displayMode: boolean, element: HTMLElement) => {
    try {
      if (!latex || latex === 'undefined') return;
      
      // 预处理LaTeX代码
      const processedLatex = preprocessLatex(latex);
      
      katex.render(processedLatex, element, {
        throwOnError: false,
        displayMode: displayMode,
        trust: true,      // 允许某些命令
        strict: false,    // 放宽错误处理
        output: 'html'    // 使用HTML输出
      });
    } catch (error) {
      console.error('LaTeX渲染错误:', error, 'LaTeX代码:', latex);
      if (element) {
        element.innerHTML = `<span style="color: red; font-size: 0.9em;">LaTeX错误</span>`;
  }
    }
  };

  // 查找并渲染文档中的所有LaTeX元素
  const renderAllLatex = () => {
    // 渲染行内公式
    document.querySelectorAll('span.math-inline').forEach(el => {
      const latex = el.getAttribute('data-latex') || el.textContent;
      if (latex) renderFunction(latex, false, el as HTMLElement);
    });

    // 渲染块级公式
    document.querySelectorAll('div.math-display').forEach(el => {
      const latex = el.getAttribute('data-latex') || el.textContent;
      if (latex) renderFunction(latex, true, el as HTMLElement);
    });
  };

  // 初始渲染
  setTimeout(renderAllLatex, 100);

  // 创建MutationObserver监听DOM变化
    const observer = new MutationObserver((mutations) => {
      let shouldRender = false;
      
      mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldRender = true;
        }
      });
      
      if (shouldRender) {
      setTimeout(renderAllLatex, 100);
      }
    });
    
  // 开始观察文档变化
    observer.observe(document.body, {
      childList: true,
    subtree: true
    });
    
    return observer;
};

/**
 * 手动调用重新渲染LaTeX元素
 * @param renderFn - LaTeX渲染函数
 * @param container - 容器元素，默认为document.body
 */
export const refreshLatexRendering = (
  renderFn: (latex: string, displayMode: boolean, element: HTMLElement) => void, 
  container: HTMLElement = document.body
) => {
  if (!renderFn || typeof renderFn !== 'function') {
    console.error('LaTeX渲染函数未提供或不是有效函数');
    return;
  }
  
  try {
    // 重置所有元素的渲染状态
    container.querySelectorAll('.latex-rendered').forEach(el => {
      el.classList.remove('latex-rendered');
    });
    
    // 重新渲染内联元素
    container.querySelectorAll('span.latex-inline').forEach(element => {
      try {
        const textContent = element.textContent || '';
        // 安全获取LaTeX内容
        let latex = element.getAttribute('data-latex');
        if (!latex && textContent) {
          // 只在textContent存在时尝试调用trim
          latex = textContent.trim();
        }
        
        if (latex && latex !== 'undefined') {
          renderFn(latex, false, element as HTMLElement);
          element.classList.add('latex-rendered');
        }
      } catch (err) {
        console.error('内联LaTeX重新渲染失败:', err);
      }
    });
    
    // 重新渲染块级元素
    container.querySelectorAll('div.latex-block').forEach(element => {
      try {
        const textContent = element.textContent || '';
        // 安全获取LaTeX内容
        let latex = element.getAttribute('data-latex');
        if (!latex && textContent) {
          // 只在textContent存在时尝试调用trim
          latex = textContent.trim();
        }
        
        if (latex && latex !== 'undefined') {
          renderFn(latex, true, element as HTMLElement);
          element.classList.add('latex-rendered');
        }
      } catch (err) {
        console.error('块级LaTeX重新渲染失败:', err);
      }
    });
  } catch (err) {
    console.error('LaTeX手动渲染失败:', err);
  }
}; 