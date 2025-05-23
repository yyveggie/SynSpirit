# 编辑器 LaTeX 公式与视频嵌入实现说明

本文档旨在说明当前项目中文章编辑器（基于 Toast UI Editor）如何实现自定义的 LaTeX 公式和视频嵌入功能，并确保其在"所见即所得"(WYSIWYG) 模式、Markdown 模式以及最终文章展示页面的兼容性和正确渲染。

## 1. 编辑器核心代码文件

涉及此功能的核心前端代码文件主要有两个：

1.  `frontend/src/components/ToastEditor.tsx`: 封装了 Toast UI Editor 的 React 组件，负责编辑器的初始化、配置、自定义按钮的添加和事件处理。
2.  `frontend/src/pages/ArticlePage.tsx`: 文章展示页面，负责渲染从数据库获取的文章内容，包含处理 LaTeX 和视频占位符的最终渲染逻辑。
3.  `frontend/src/pages/NewArticlePageToast.tsx`: 新建/编辑文章的页面，负责加载 `ToastEditor` 组件，并处理文章数据的提交。

## 2. 自定义插件实现 (LaTeX 与视频)

我们没有使用 Toast UI Editor 官方的插件系统，而是通过其 `toolbarItems` 配置来自定义工具栏按钮，并直接在 `ToastEditor.tsx` 组件内部实现按钮点击后的逻辑。

### 2.1. 添加自定义按钮

在 `ToastEditor.tsx` 中，`Editor` 组件的 `toolbarItems` 属性被用来定义工具栏。LaTeX 和视频按钮是作为自定义 HTML 元素 (`el`) 添加的：

```typescript
// frontend/src/components/ToastEditor.tsx (部分代码)

toolbarItems={[
  // ... 其他标准按钮 ...
  [{ // 自定义按钮组
    el: createCustomButton('latex-button', '∑', '插入 LaTeX 公式'), // 创建 LaTeX 按钮
    tooltip: '插入 LaTeX 公式',
    // command: 'latex', // 注意：未使用 command，直接绑定事件
  }, {
    el: createCustomButton('video-button', '►', '嵌入视频'), // 创建视频按钮
    tooltip: '嵌入视频',
    // command: 'video', // 注意：未使用 command，直接绑定事件
  }],
]}
```

`createCustomButton` 是一个辅助函数，用于创建带有特定样式和 ID 的 `button` 元素。

### 2.2. 按钮点击事件处理

按钮创建后，在 `useEffect` Hook 中，我们获取这些按钮的 DOM 元素，并使用 `addEventListener` 直接绑定点击事件到组件内部定义的处理函数：

```typescript
// frontend/src/components/ToastEditor.tsx (部分代码)

useEffect(() => {
  const editorInstance = editorRef.current?.getInstance();
  if (editorInstance) {
    // ... 其他逻辑 ...

    // --- 直接为自定义按钮添加事件监听器 ---
    const latexButton = editorContainerRef.current?.querySelector('#latex-button');
    if (latexButton) {
      latexButton.addEventListener('click', handleLatexClickInternal);
    }

    const videoButton = editorContainerRef.current?.querySelector('#video-button');
    if (videoButton) {
      videoButton.addEventListener('click', handleVideoClickInternal);
    }

    // 清理函数中移除监听器
    return () => {
      latexButton?.removeEventListener('click', handleLatexClickInternal);
      videoButton?.removeEventListener('click', handleVideoClickInternal);
      // ... 其他清理 ...
    };
  }
}, [/* 依赖项 */]);

// LaTeX 处理函数
const handleLatexClickInternal = () => {
  const editor = editorRef.current?.getInstance();
  if (!editor) return;
  const latexTemplate = '$$\\nlatex % 光标在这里 %\n$$';
  editor.insertText(latexTemplate);
  // 尝试将光标移动到 % % 之间 (可能需要微调)
  const currentRange = editor.getSelection();
  if (currentRange) {
    const newStart = currentRange[0] + 9; // 定位到 '%' 后
    editor.setSelection(newStart, newStart);
  }
};

// 视频处理函数
const handleVideoClickInternal = () => {
  const editor = editorRef.current?.getInstance();
  if (!editor) return;
  const url = prompt("请输入视频 URL (例如 YouTube, Bilibili):");
  if (url) {
    // 插入占位符，注意使用全角冒号以匹配 ArticlePage 中的正则
    const videoPlaceholder = `[视频占位符：${url}]`;
    editor.insertText(videoPlaceholder);
  }
};
```

*   **LaTeX**: 点击按钮后，调用 `editor.insertText()` 插入 `$$latex ... $$` 模板。`latex` 前缀是为了方便在 `ArticlePage.tsx` 中明确区分并渲染。
*   **视频**: 点击按钮后，弹窗要求用户输入 URL，然后调用 `editor.insertText()` 插入 `[视频占位符：URL]` 文本。**关键在于编辑器本身不渲染 iframe**，只插入这个文本占位符。

## 3. WYSIWYG 与 Markdown 模式的兼容性与最终渲染

目标是无论用户在哪种模式下编辑，最终在文章展示页面都能看到正确的渲染结果。

*   **Markdown 模式**:
    *   **LaTeX**: 输入的 `$$latex ... $$` 块直接保存到数据库。
    *   **视频**: 输入的 `[视频占位符：URL]` 文本直接保存到数据库。
*   **WYSIWYG 模式**:
    *   **LaTeX**: Toast UI Editor 内部会尝试渲染 `$$...$$` 块（我们添加的 `latex` 前缀不影响其识别为块公式）。用户看到的是渲染后的公式。保存时，原始的 `$$latex ... $$` 文本被保存。
    *   **视频**: 用户看到的是**纯文本** `[视频占位符：URL]`。这是**有意为之**，避免了在编辑器内部渲染 `iframe` 可能带来的复杂性和问题。保存时，这个文本占位符被保存。
*   **最终展示 (`ArticlePage.tsx`)**:
    *   **LaTeX**:
        *   `ArticlePage.tsx` 的 `useEffect` Hook 中包含 KaTeX 渲染逻辑。
        *   这段逻辑会查找文章内容 (`article.content`) 中的文本节点。
        *   当找到包含 `$$latex ... $$` 的文本节点时，它会提取 `...` 部分的公式内容，并使用 `katex.render()` 将其渲染为 HTML 公式，然后替换掉原来的文本节点。
        *   这确保了即使带有 `latex` 前缀，公式也能被正确渲染。
        ```typescript
        // frontend/src/pages/ArticlePage.tsx (KaTeX 渲染部分简化逻辑)
        useEffect(() => {
          if (article?.content && contentRef.current) {
            // ... (MutationObserver 设置) ...
            const renderLatex = (textNode: Text) => {
              let latexContent = textNode.nodeValue || '';
              const latexBlockMatch = latexContent.match(/\\$\\$latex\\s*([\\s\\S]*?)\\s*\\$\\$/);
              if (latexBlockMatch && latexBlockMatch[1]) {
                latexContent = latexBlockMatch[1].trim();
                const container = document.createElement('span');
                katex.render(latexContent, container, { /* ... options ... */ });
                textNode.parentNode?.replaceChild(container, textNode);
              }
              // ... (处理标准 $$ $$ 块的逻辑) ...
            };
            // ... (初始渲染和启动 Observer) ...
          }
        }, [article?.content]);
        ```
    *   **视频**:
        *   在 `ArticlePage.tsx` 组件渲染文章内容之前，会调用 `processContentForVideos` 函数。
        ```typescript
        // frontend/src/pages/ArticlePage.tsx
        const processContentForVideos = (htmlContent: string): string => {
          const videoPlaceholderRegex = /\\[视频占位符[:：]\\s*(https?:\\/\\/[^\\s\\]]+)\\]/g;
          // ... (getYouTubeVideoId 辅助函数) ...
          return htmlContent.replace(videoPlaceholderRegex, (match, originalUrl) => {
            const videoId = getYouTubeVideoId(originalUrl);
            if (!videoId) return match; // 如果无法提取 ID，返回原始占位符
            const embedUrl = `https://www.youtube.com/embed/${videoId}`; // 构建标准嵌入 URL
            // 返回包含 iframe 的响应式 HTML 结构
            return `<div style="..."><iframe src="${embedUrl}" ...></iframe></div>`;
          });
        };
        // ...
        <div
          ref={contentRef}
          className="..."
          dangerouslySetInnerHTML={{ __html: processContentForVideos(article.content) }} // 在这里调用处理函数
        />
        ```
        *   这个函数使用正则表达式查找 `[视频占位符：URL]` (兼容全/半角冒号)。
        *   找到后，它会调用 `getYouTubeVideoId` 尝试从 URL 中提取视频 ID。
        *   如果成功，它会构建标准的 YouTube 嵌入 URL (`https://www.youtube.com/embed/VIDEO_ID`)。
        *   最后，它返回一个包含 `iframe` 的 HTML 字符串（包裹在一个用于响应式布局的 `div` 中），这个 HTML 会替换掉原文中的占位符文本。
        *   这个替换过程发生在 `dangerouslySetInnerHTML` 之前，因此最终渲染到页面的是可交互的 `iframe` 视频，而不是占位符。

## 4. 核心代码与注意事项

以下是实现上述功能的关键代码部分，修改时需要特别注意：

*   **`frontend/src/components/ToastEditor.tsx`**:
    *   `toolbarItems` 数组中自定义按钮的 `el` 定义。
    *   `useEffect` 中为自定义按钮添加/移除事件监听器的逻辑。
    *   `handleLatexClickInternal` 函数：插入 `$$latex ... $$` 的逻辑。
    *   `handleVideoClickInternal` 函数：插入 `[视频占位符：URL]` 的逻辑。
*   **`frontend/src/pages/ArticlePage.tsx`**:
    *   KaTeX 渲染相关的 `useEffect`：特别是查找 `$$latex ... $$` 并调用 `katex.render` 的部分。
    *   `processContentForVideos` 函数：正则表达式、`getYouTubeVideoId` 函数、构建 `embedUrl` 和生成最终 `iframe` HTML 的逻辑。
    *   `dangerouslySetInnerHTML={{ __html: processContentForVideos(article.content) }}`：确保在渲染前调用了处理函数。

**注意事项**:

*   **占位符格式一致性**: 视频占位符的格式 (`[视频占位符：...]`) 和 `ArticlePage.tsx` 中处理它的正则表达式必须严格对应（包括冒号的全/半角）。
*   **LaTeX 前缀**: `$$latex` 前缀是特意添加的，用于在 `ArticlePage.tsx` 中可靠地识别并渲染，不要轻易移除。
*   **iframe 安全**: 直接渲染 `iframe` 总是存在一定的风险（如 XSS），虽然目前仅限于处理用户输入的 URL，但未来若有更复杂的嵌入需求，应考虑使用更安全的处理方式（如 `<iframe>` 的 `sandbox` 属性或服务器端验证）。
*   **编辑器内部渲染**: 目前的设计避免了在 WYSIWYG 模式下渲染视频 `iframe`。如果未来需要在编辑器内部实现视频预览，需要更复杂的处理，并小心可能引入的问题。

这份文档记录了当前 LaTeX 和视频功能的实现方式，希望能为后续的维护和开发提供清晰的指引。 