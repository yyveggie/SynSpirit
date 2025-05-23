/**
 * 此文件定义了 ToastEditorWrapper 组件，作为SharedEditor的替代品。
 * 它将保持与SharedEditor完全相同的API接口，但内部使用ToastEditor实现。
 * 这种设计允许我们在不改变现有代码的情况下，实现从CKEditor到Toast UI Editor的平滑过渡。
 */
import React from 'react';
import ToastEditor from './ToastEditor';

interface SharedEditorProps {
  initialData?: string; // 编辑时传入的初始数据
  onChange: (data: string) => void; // 内容变化时的回调
  token: string | null; // 用户认证令牌，用于上传
  onReady?: (editor: any) => void; // 编辑器就绪时的回调
  placeholder?: string; // 添加占位符属性
}

// 保持与SharedEditor相同的接口，但使用ToastEditor实现
const ToastEditorWrapper: React.FC<SharedEditorProps> = ({
  initialData = '',
  onChange,
  token,
  onReady,
  placeholder = '请输入内容'
}) => {
  return (
    <div className="toast-editor-wrapper">
      <ToastEditor
        initialData={initialData}
        onChange={onChange}
        token={token}
        onReady={onReady}
        placeholder={placeholder}
        height="400px" // 可以根据需要调整高度
        initialEditType="wysiwyg" // 默认使用所见即所得模式
      />
    </div>
  );
};

export default ToastEditorWrapper; 