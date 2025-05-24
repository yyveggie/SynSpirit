import React from 'react';
import { useRecommendations } from '../context/RecommendationsContext';
import RecommendedContentCards from './RecommendedContentCards';
import { AnimatePresence, motion } from 'framer-motion';

interface GlobalRecommendationsDisplayProps {
  isChatboxExpanded: boolean;
}

const GlobalRecommendationsDisplay: React.FC<GlobalRecommendationsDisplayProps> = ({ isChatboxExpanded }) => {
  const { recommendationSets } = useRecommendations();

  return (
    <AnimatePresence>
      {isChatboxExpanded && recommendationSets.length > 0 && (
        <motion.div
          className="global-recommendations-outer-wrapper mb-2"
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: '0.5rem' }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          layout
        >
          <div 
            className="recommendations-content-area bg-transparent rounded-lg"
                >
            <RecommendedContentCards />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalRecommendationsDisplay; 