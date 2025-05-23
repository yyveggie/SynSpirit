/**
 * 修复重复导航栏脚本
 * 
 * 此脚本用于删除页面组件中重复导入和使用的Navbar组件。
 * 适用于已经在MainLayout中全局添加了Navbar的情况。
 */

const fs = require('fs');
const path = require('path');

// 配置路径
const pagesDir = path.resolve(__dirname, 'src/pages');

// 查找所有页面文件
function findPageFiles(dir) {
  const files = fs.readdirSync(dir);
  const pageFiles = [];
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // 递归查找子目录
      pageFiles.push(...findPageFiles(filePath));
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      pageFiles.push(filePath);
    }
  });
  
  return pageFiles;
}

// 修复文件中的Navbar导入和使用
function fixNavbarInFile(filePath) {
  console.log(`处理文件: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  // 是否有变化的标志
  let hasChanges = false;
  
  // 检查和删除导入语句
  const importRegex = /import\s+Navbar\s+from\s+['"]\.\.\/components\/Navbar['"];?/g;
  if (importRegex.test(content)) {
    content = content.replace(importRegex, '// 已移除: import Navbar from "../components/Navbar";');
    hasChanges = true;
  }
  
  // 检查并删除Navbar组件
  const navbarTags = [
    /<Navbar\s*\/>/g,                      // 自闭合标签
    /<Navbar\s*>\s*<\/Navbar>/g,           // 空标签
    /<Navbar\s*[^>]*\/>/g,                 // 带属性的自闭合标签
    /<Navbar\s*[^>]*>\s*<\/Navbar>/g       // 带属性的空标签
  ];
  
  navbarTags.forEach(regex => {
    if (regex.test(content)) {
      content = content.replace(regex, '');
      hasChanges = true;
    }
  });
  
  // 处理带注释的Navbar标签
  const commentedNavbarRegex = /<Navbar\s*\/\*.*?\*\/\s*\/>/g;
  if (commentedNavbarRegex.test(content)) {
    content = content.replace(commentedNavbarRegex, '');
    hasChanges = true;
  }
  
  // 如果有变化，写回文件
  if (hasChanges) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`修复完成: ${filePath}`);
    return true;
  } else {
    console.log(`无需修改: ${filePath}`);
    return false;
  }
}

// 主函数
function main() {
  console.log('开始修复重复的Navbar导入和使用...');
  
  const pageFiles = findPageFiles(pagesDir);
  console.log(`找到 ${pageFiles.length} 个页面文件需要检查`);
  
  let fixedCount = 0;
  
  pageFiles.forEach(file => {
    const isFixed = fixNavbarInFile(file);
    if (isFixed) fixedCount++;
  });
  
  console.log(`修复完成! 共修改了 ${fixedCount} 个文件`);
}

// 执行主函数
main(); 