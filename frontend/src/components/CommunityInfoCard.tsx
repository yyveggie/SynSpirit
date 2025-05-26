import React from 'react';
import { useNavigate } from 'react-router-dom';

interface CommunityInfoCardProps {
  name: string;
  description: string | null;
  slug: string;
  id: number;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  isLoadingFavorite: boolean;
  onCreatePost?: () => void;
  // 可以添加更多属性，例如成员数、创建时间等
}

const CommunityInfoCard: React.FC<CommunityInfoCardProps> = ({
  name,
  description,
  slug,
  id,
  isFavorited,
  onToggleFavorite,
  isLoadingFavorite,
  onCreatePost
}) => {
  const navigate = useNavigate();

  const handleCreatePost = () => {
    navigate(`/community/new-post`, { state: { topicId: id, topicName: name } });
  };

  return (
    <div className="rounded-lg bg-gray-100 p-4 shadow-md">
      <h2 className="text-xl font-semibold text-black mb-2">{name}</h2>
      <p className="text-sm text-gray-700 mb-4">
        {description || '暂无社区描述。'}
      </p>
      {/* 在这里可以使用 isFavorited, onToggleFavorite, isLoadingFavorite 来控制按钮状态或显示 */} 
      {/* 例如，可以修改收藏按钮的样式或禁用状态 */} 
      {/* 按钮的 onClick 事件现在应该调用 onToggleFavorite */} 
      {/* 创建帖子按钮 (如果提供了回调) */} 
      {/* {
        onCreatePost && (
          <button 
            onClick={onCreatePost}
            className="..."
          >
            创建新帖子
          </button>
        )
      } */} 
    </div>
  );
};

export default CommunityInfoCard; 