/**
 * TextWithLinks.tsx
 * 
 * 这个组件将文本中的URL转换为可点击的链接。
 * 用于在评论中显示链接。
 */
import React from 'react';

interface TextWithLinksProps {
  text: string;
  className?: string;
}

export const TextWithLinks: React.FC<TextWithLinksProps> = ({ text, className = '' }) => {
  // URL正则表达式，匹配常见URL格式
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // 将文本拆分为普通文本和链接部分
  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex) || [];
  
  // 合并两个数组，形成交替的文本和链接序列
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    result.push(parts[i]);
    if (matches[i]) {
      result.push(matches[i]);
    }
  }
  
  return (
    <span className={className}>
      {result.map((part, index) => {
        // 检查这部分是否是URL
        if (urlRegex.test(part)) {
          return (
            <a 
              key={index} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};

export default TextWithLinks; 