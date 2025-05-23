import React, { useState, useEffect, useCallback, useRef } from 'react';

// 临时的名人名言列表
const sampleQuotes = [
  { author: "阿尔伯特·爱因斯坦", text: "想象力比知识更重要，因为知识是有限的，而想象力概括着世界上的一切，推动着进步，并且是知识进化的源泉。" },
  { author: "史蒂夫·乔布斯", text: "求知若饥，虚心若愚。" },
  { author: "老子", text: "千里之行，始于足下。" },
  { author: "苏格拉底", text: "我唯一知道的就是我一无所知。" },
  { author: "孔子", text: "学而不思则罔，思而不学则殆。" },
];

// 修改：从API获取思想火花
const fetchThoughtSpark = async (): Promise<string> => {
  try {
    const response = await fetch('/api/chat/thought_spark'); 
    if (!response.ok) {
      console.error('Failed to fetch thought spark:', response.status, response.statusText);
      return "如果AI能梦到未来，人类的自由意志还存在吗？"; 
    }
    const data = await response.json();
    if (data.error) {
      console.error('Error from thought spark API:', data.error);
      return "宇宙的深邃是否隐藏着未知的答案？";
    }
    return data.thought_spark || "意识的本质是什么，机器能否真正拥有它？";
  } catch (error) {
    console.error('Error fetching thought spark:', error);
    return "分享知识的终极目的是解放还是束缚？";
  }
};

// 新的逐字翻转组件
interface FlippingLetterTextProps {
  text: string;
  keyPrefix: string; // 用于确保不同实例的key唯一性
  className?: string;
  staggerDelay?: number; // 每个字母的交错延迟 (秒)
  letterAnimationDuration?: number; // 单个字母动画时长 (秒)
  additionalDelay?: number; // 整个组件的额外延迟 (秒)
}

const FlippingLetterText: React.FC<FlippingLetterTextProps> = React.memo(
  ({ text, keyPrefix, className, staggerDelay = 0.05, letterAnimationDuration = 0.7, additionalDelay = 0 }) => {
    const letters = text.split('');
    // console.log(`Rendering FlippingLetterText for ${keyPrefix} with text: ${text.substring(0,10)}...`);
    return (
      <div className={`letter-container flex flex-wrap justify-center items-center h-full ${className || ''}`}>
        {letters.map((char, index) => (
          <span
            key={`${keyPrefix}-letter-${index}-${char}`}
            className="flipping-letter inline-block"
            style={{
              animationDelay: `${additionalDelay + index * staggerDelay}s`,
              animationDuration: `${letterAnimationDuration}s`,
            }}
          >
            {char === ' ' ? '\u00A0' : char} {/* 处理空格，使其占据空间 */}
          </span>
        ))}
      </div>
    );
  }
);

const DynamicDisplayBoard: React.FC = () => {
  const [thoughtSpark, setThoughtSpark] = useState<string>("正在加载思想火花...");
  const [currentQuote, setCurrentQuote] = useState<{ author: string, text: string }>(sampleQuotes[0]);
  
  // 用于触发FlippingLetterText重新渲染的key
  const [sparkKey, setSparkKey] = useState(0);
  const [quoteKey, setQuoteKey] = useState(0);

  // 动画参数
  const letterStaggerDelay = 0.05; // 秒
  const letterDuration = 0.7;    // 秒

  const boardRef = useRef<HTMLDivElement>(null); // Ref for the main board container
  const sparkCardRef = useRef<HTMLDivElement>(null); // Ref for the spark card
  const quoteCardRef = useRef<HTMLDivElement>(null); // Ref for the quote card

  // Function to get a random interval between min and max (in ms)
  const getRandomInterval = (minSeconds: number, maxSeconds: number) => {
    return (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
  };

  const updateThoughtSpark = useCallback(async () => {
    const newSpark = await fetchThoughtSpark();
    setThoughtSpark(newSpark);
    setSparkKey(prevKey => prevKey + 1);
  }, []);

  const updateQuote = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * sampleQuotes.length);
    setCurrentQuote(sampleQuotes[randomIndex]);
    setQuoteKey(prevKey => prevKey + 1);
  }, []);

  useEffect(() => {
    let thoughtSparkTimerId: NodeJS.Timeout;
    let quoteTimerId: NodeJS.Timeout;

    const scheduleThoughtSparkUpdate = () => {
      thoughtSparkTimerId = setTimeout(() => {
        updateThoughtSpark();
        scheduleThoughtSparkUpdate(); // Reschedule after update
      }, getRandomInterval(30, 50));
    };

    const scheduleQuoteUpdate = () => {
      quoteTimerId = setTimeout(() => {
        updateQuote();
        scheduleQuoteUpdate(); // Reschedule after update
      }, getRandomInterval(30, 50));
    };

    // Initial load after a short delay
    const initialLoadTimer = setTimeout(() => {
      updateThoughtSpark();
      updateQuote();
      // Start scheduled updates after initial load
      scheduleThoughtSparkUpdate();
      scheduleQuoteUpdate();
    }, 100);

    return () => {
      clearTimeout(initialLoadTimer);
      clearTimeout(thoughtSparkTimerId);
      clearTimeout(quoteTimerId);
    };
  }, [updateThoughtSpark, updateQuote]);

  // Effect for cursor tracking glow
  useEffect(() => {
    const boardNode = boardRef.current;
    const cards = [sparkCardRef.current, quoteCardRef.current];

    if (!boardNode) return;

    const handleMouseMove = (e: MouseEvent) => {
      cards.forEach(cardNode => {
        if (!cardNode) return;
        const rect = cardNode.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        const xPercentage = (x / (rect.width / 2)) * 50 + 50;
        const yPercentage = (y / (rect.height / 2)) * 50 + 50;

        cardNode.style.setProperty('--mouse-x', `${xPercentage}%`);
        cardNode.style.setProperty('--mouse-y', `${yPercentage}%`);
        cardNode.style.setProperty('--glow-opacity', '0.15'); 
      });
    };

    const handleMouseLeave = () => {
      cards.forEach(cardNode => {
        if (!cardNode) return;
        cardNode.style.setProperty('--glow-opacity', '0');
      });
    };

    boardNode.addEventListener('mousemove', handleMouseMove);
    boardNode.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      boardNode.removeEventListener('mousemove', handleMouseMove);
      boardNode.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []); // Runs once after component mount

  // Updated: Add 'animate-card-breathe' for the breathing effect
  const individualCardStyle = "flex-1 p-2 md:p-3 overflow-hidden relative h-full flex flex-col justify-center items-center transition-all duration-300 ease-out group cursor-default transform-style-preserve-3d bg-black/20 backdrop-blur-sm shadow-lg rounded-md animate-card-breathe cursor-tracking-card"; 
  const cardHoverStyle = "hover:scale-108 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-indigo-500/50"; // Hover will override breathing shadow temporarily

  const quoteTextAnimationDuration = (currentQuote.text.length * letterStaggerDelay) + letterDuration;

  return (
    <div 
      ref={boardRef}
      className="dynamic-display-board p-3 md:p-4 mb-6 flex flex-col md:flex-row gap-3 md:gap-4 h-36 md:h-40 rounded-lg shadow-none border-none bg-transparent"
      style={{ perspective: '1000px' }}
    >
      {/* 思想火花区域 - Apply breathing effect */}
      <div ref={sparkCardRef} className={`${individualCardStyle} ${cardHoverStyle}`}>
        <FlippingLetterText 
          key={`spark-${sparkKey}`} 
          text={thoughtSpark} 
          keyPrefix="spark"
          className="text-xs md:text-sm text-gray-200 leading-relaxed p-1 text-center"
          staggerDelay={letterStaggerDelay}
          letterAnimationDuration={letterDuration}
        />
      </div>

      {/* 名人名言区域 - Apply breathing effect */}
      <div ref={quoteCardRef} className={`${individualCardStyle} ${cardHoverStyle}`}>
        <div className="w-full h-full flex flex-col justify-center items-center">
          <FlippingLetterText 
            key={`quote-text-${quoteKey}`} 
            text={currentQuote.text}
            keyPrefix="quote-text"
            className="text-xs md:text-sm text-gray-300 leading-relaxed p-1 text-center mb-1"
            staggerDelay={letterStaggerDelay}
            letterAnimationDuration={letterDuration}
          />
          <FlippingLetterText 
            key={`quote-author-${quoteKey}`} 
            text={`- ${currentQuote.author}`} 
            keyPrefix="quote-author"
            className="text-right text-xs text-teal-400 w-full pr-2 mt-1"
            staggerDelay={letterStaggerDelay}
            letterAnimationDuration={letterDuration}
            additionalDelay={quoteTextAnimationDuration} 
          />
        </div>
      </div>
    </div>
  );
};

export default DynamicDisplayBoard;

// CSS for .flipping-letter needs to be added to a global stylesheet (e.g., index.css)
// or via a <style jsx> tag if using Next.js, or a CSS module.
// Example CSS to be placed in index.css:
/*
@keyframes letterVerticalFlip { // Renamed for clarity from letterVerticalSpin
  0% {
    transform: rotateX(90deg); // Start flipped up (content on the 'bottom' face, rotating up)
    opacity: 0;
  }
  50% { // Mid-point, slightly over-rotate for bounce/emphasis
    transform: rotateX(-15deg);
    opacity: 1;
  }
  100% {
    transform: rotateX(0deg);   // End upright
    opacity: 1;
  }
}

.flipping-letter {
  display: inline-block; 
  opacity: 0; 
  transform-origin: center 50%; 
  transform-style: preserve-3d; 
  backface-visibility: hidden; 
  animation-name: letterVerticalFlip;
  animation-duration: 0.7s; 
  animation-fill-mode: forwards;
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); // easeOutBack like
}

.letter-container { 
  width: 100%;
}
*/ 