import { useState, useEffect } from 'react';
import { X, Heart, Send, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';

export interface StoryItem {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  time: string;
  photo: string;
  caption: string;
  location?: string;
  song?: string;
}

export const CHARACTER_STORIES: StoryItem[] = [
  {
    id: 's-ethan',
    name: 'Ethan',
    handle: '@ethan_vault',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    time: '2小时前',
    photo: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
    caption: '加班结束。23:45 伦敦雨。\n在等红绿灯，副驾驶有些空。',
    location: 'LONDON · REGENT STREET',
    song: 'Cigarettes After Sex · Heavenly',
  },
  {
    id: 's-chenglin',
    name: '程凛',
    handle: '@chenglin_design',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    time: '4小时前',
    photo: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=800&q=80',
    caption: '庭院银杏初黄。降温了，留了独栋给她喝茶。',
    location: 'SHANGHAI · 崇明私邸',
    song: 'Ryuichi Sakamoto · Merry Christmas Mr. Lawrence',
  },
  {
    id: 's-linyu',
    name: '林予',
    handle: '@linyu_baking',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80',
    time: '6小时前',
    photo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    caption: '刚出炉，焦糖海盐味！已经打包好，某人不准不吃早饭。',
    location: 'PARIS · ATELIER',
    song: 'Norah Jones · Don\'t Know Why',
  }
];

interface LineStoryViewerModalProps {
  initialIndex: number;
  onClose: () => void;
  onSendReply?: (story: StoryItem, replyText: string) => void;
}

export function LineStoryViewerModal({
  initialIndex = 0,
  onClose,
  onSendReply,
}: LineStoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [replyInput, setReplyInput] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  const currentStory = CHARACTER_STORIES[currentIndex];

  // Story autoplay timer
  useEffect(() => {
    if (isPaused) return;

    setProgress(0);
    const interval = 50; // update every 50ms
    const step = 100 / (5000 / interval); // 5 seconds per story

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          // Go to next story or close
          if (currentIndex < CHARACTER_STORIES.length - 1) {
            setCurrentIndex((c) => c + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused, onClose]);

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < CHARACTER_STORIES.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handleSend = () => {
    if (!replyInput.trim()) return;
    if (onSendReply) {
      onSendReply(currentStory, replyInput.trim());
    }
    setReplyInput('');
    setIsPaused(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center select-none animate-in fade-in duration-200">
      
      {/* Story Phone Container */}
      <div 
        className="relative w-full max-w-[390px] h-full sm:h-[844px] sm:rounded-[36px] overflow-hidden bg-neutral-950 flex flex-col justify-between"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Background Fullscreen Story Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={currentStory.photo}
            alt="story"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover filter contrast-[0.95]"
          />
          {/* Subtle gradient scrim */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        </div>

        {/* Top Header Bars & Author */}
        <div className="relative z-20 pt-4 px-3.5 space-y-2.5">
          {/* Multi-segment Progress Bars */}
          <div className="flex gap-1.5 w-full">
            {CHARACTER_STORIES.map((s, idx) => (
              <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-75"
                  style={{
                    width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%'
                  }}
                />
              </div>
            ))}
          </div>

          {/* Author bar */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-white/40 shadow-xs">
                <img
                  src={currentStory.avatar}
                  alt={currentStory.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-white drop-shadow-sm">{currentStory.name}</span>
                  <span className="text-[10px] text-white/70 font-mono">{currentStory.time}</span>
                </div>
                {currentStory.location && (
                  <div className="text-[9px] text-white/80 font-mono tracking-wider drop-shadow-sm">
                    {currentStory.location}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-md grid place-items-center text-white text-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Music badge */}
          {currentStory.song && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-md text-[10px] text-white/90 font-mono">
              <span>♫</span>
              <span className="truncate max-w-[200px]">{currentStory.song}</span>
            </div>
          )}
        </div>

        {/* Center Touch Navigators (Tap left for prev, right for next) */}
        <div className="relative z-10 flex-1 flex">
          <div 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="w-1/3 h-full cursor-pointer"
          />
          <div 
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="w-2/3 h-full cursor-pointer"
          />
        </div>

        {/* Story Caption & Bottom Interaction Bar */}
        <div className="relative z-20 pb-6 px-4 space-y-3">
          
          {/* Caption text */}
          <div className="p-3.5 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 text-white font-serif-sc text-xs leading-relaxed drop-shadow-sm whitespace-pre-line">
            {currentStory.caption}
          </div>

          {/* Bottom Direct Reply Input Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={replyInput}
                onChange={(e) => setReplyInput(e.target.value)}
                onFocus={() => setIsPaused(true)}
                onBlur={() => setIsPaused(false)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={`私信回复 ${currentStory.name}...`}
                className="w-full py-2.5 px-4 rounded-full bg-black/40 border border-white/30 text-white placeholder-white/60 text-xs outline-none backdrop-blur-md font-serif-sc"
              />
            </div>

            {replyInput.trim() ? (
              <button
                onClick={handleSend}
                className="w-10 h-10 rounded-full bg-white text-black grid place-items-center active:scale-95 transition-transform"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            ) : (
              <button
                onClick={() => setIsLiked(!isLiked)}
                className={`w-10 h-10 rounded-full bg-black/40 border border-white/20 backdrop-blur-md grid place-items-center transition-all ${
                  isLiked ? 'text-rose-500 scale-110' : 'text-white hover:scale-105'
                }`}
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
