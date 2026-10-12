import { useState } from 'react';
import { ArrowLeft, Phone, MoreHorizontal, Send, Mic, Smile, Play, Pause, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { ScreenType } from '../../types';

interface ChatScreenViewProps {
  themeMode?: any;
  onNavigate: (screen: ScreenType) => void;
}

interface ChatMsgItem {
  id: string;
  sender: string;
  time: string;
  text?: string;
  imageUrl?: string;
  caption?: string;
  isVoice?: boolean;
  voiceDuration?: string;
  voiceTranscript?: string;
  cotThinking?: string;
}

export function ChatScreenView({ onNavigate }: ChatScreenViewProps) {
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [showCoT, setShowCoT] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMsgItem[]>([
    {
      id: 'm1',
      sender: 'character',
      time: '21:42',
      text: '在看你发来的照片了，真好看。',
    },
    {
      id: 'm2',
      sender: 'user',
      time: '21:43',
      text: '你看喜欢就好。',
    },
    {
      id: 'm3',
      sender: 'user',
      time: '21:43',
      imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=400&q=80',
      caption: 'FRAME 07 · 伦敦夜雨',
    },
    {
      id: 'm4',
      sender: 'character',
      time: '21:44',
      text: '下次带你去。',
    },
    {
      id: 'm5',
      sender: 'character',
      time: '21:45',
      isVoice: true,
      voiceDuration: '0:12',
      voiceTranscript: '“刚走到楼下，风有点凉。晚上睡觉记得关好窗户，明天见。”',
      cotThinking: '（听到她发来的语音，指尖在大衣口袋里轻轻握了握。原以为只是普通的出差，但看着伦敦夜雨里她发来的风景，突然就想立刻飞回她身边。）'
    },
    {
      id: 'm6',
      sender: 'character',
      time: '21:46',
      text: '把今天留给自己，剩下的事情明天再说。',
    }
  ]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      time: '刚刚',
      text: inputText.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    setTimeout(() => {
      const reply = {
        id: `char-${Date.now()}`,
        sender: 'character',
        time: '刚刚',
        text: '收到纸条了。早点睡，我在。',
        cotThinking: '（指尖触碰屏幕上的字句，目光停顿良久。即使隔着大洋，她的一句话也能瞬间驱散雨夜的湿冷。）'
      };
      setMessages((prev) => [...prev, reply]);
    }, 1200);
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      {/* Paper Noise Background */}
      <div className="absolute inset-0 opacity-15 bg-paper-noise pointer-events-none" />

      {/* Top Header styled like LINE Private Archive thread */}
      <div className="relative z-10 px-5 pt-12 pb-3.5 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onNavigate('home')}
            className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 backdrop-blur-md grid place-items-center text-xs hover:bg-neutral-200 active:scale-95 transition-all text-[#1a1a1a]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-white font-mono font-bold tracking-wider">
                LINE
              </span>
              <span className="font-serif font-bold text-sm tracking-wide text-[#1a1a1a]">
                Ethan
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>
            <div className="text-[9px] text-[#8e8b86] font-mono tracking-wider mt-0.5">
              LINE PRIVATE CHAT · LONDON 21:47
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#1a1a1a] text-white grid place-items-center text-xs font-mono">
            ⌘
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar text-xs">
        {/* Date stamp */}
        <div className="text-center my-2">
          <span className="text-[8px] tracking-[2px] text-[#8b8782] bg-[rgba(245,242,236,.8)] px-3 py-1 rounded-full border border-[rgba(40,36,31,.1)] font-mono uppercase">
            02 OCT 2026 · ARCHIVE THREAD
          </span>
        </div>

        {messages.map((msg: any) => {
          const isChar = msg.sender === 'character';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isChar ? 'items-start' : 'items-end'} space-y-1`}
            >
              {/* CoT Secret Mental Diary Box */}
              {msg.cotThinking && (
                <div className="w-full max-w-[88%] mb-1">
                  <button
                    onClick={() => setShowCoT(!showCoT)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[rgba(247,244,238,.9)] hover:bg-white text-[10px] text-[#8b7560] border border-[rgba(139,117,96,.25)] shadow-xs transition-all font-mono"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b7560] animate-pulse" />
                    <span>FILM NOTE · 心理潜台词</span>
                    {showCoT ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                  </button>

                  {showCoT && (
                    <div className="mt-1 p-3 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.15)] text-[11px] leading-relaxed text-[#55504a] font-serif-sc shadow-sm relative">
                      <div className="text-[8px] font-mono tracking-widest text-[#8b8782] mb-1 uppercase">
                        [CONFIDENTIAL INNER MONOLOGUE]
                      </div>
                      {msg.cotThinking}
                      <div className="absolute right-3 bottom-2 font-handwriting text-[9px] text-[#8b7560]">
                        sealed.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Message bubble */}
              <div className="flex items-end gap-2 max-w-[86%]">
                {isChar && (
                  <div 
                    className="w-7 h-7 rounded-full shrink-0 shadow-xs relative overflow-hidden"
                    style={{ background: 'linear-gradient(145deg,#b6a38d,#695e55)' }}
                  >
                    <div className="absolute w-[11px] h-[13px] rounded-full bg-[#e1d2c0] left-[8px] top-[5px]" />
                    <div className="absolute w-[22px] h-[13px] rounded-[50%_50%_42%_42%] bg-[#51473f] left-[3px] top-[1px]" />
                  </div>
                )}

                {/* Voice Cassette Bubble */}
                {msg.isVoice ? (
                  <div
                    onClick={() => setIsPlayingVoice(!isPlayingVoice)}
                    className="p-3 rounded-2xl bg-[#ebe7df] border border-[rgba(40,36,31,.15)] shadow-sm flex items-center gap-3 cursor-pointer hover:bg-[#e4dfd6] transition-all text-[#242323]"
                  >
                    <button className="w-7 h-7 rounded-full bg-[#2d2b29] text-white grid place-items-center text-xs shrink-0 shadow-xs">
                      {isPlayingVoice ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-[#8b8782]">VOICE MEMO</span>
                        <span className="font-mono text-xs font-bold">{msg.voiceDuration}</span>
                      </div>
                      <div className="text-[10px] text-[#69635c] italic font-serif-sc mt-0.5">
                        {msg.voiceTranscript}
                      </div>
                    </div>
                  </div>
                ) : msg.imageUrl ? (
                  /* Polaroid / Film Photo Bubble */
                  <div className="p-2 pb-3.5 rounded-2xl bg-[#eee9df] border border-[rgba(40,36,31,.12)] shadow-md max-w-[210px] rotate-[-1deg]">
                    <div className="rounded-xl overflow-hidden filter contrast-[0.92] saturate-[0.7]">
                      <img
                        src={msg.imageUrl}
                        alt="film photo"
                        referrerPolicy="no-referrer"
                        className="w-full h-32 object-cover"
                      />
                    </div>
                    <div className="mt-2 text-center text-[8px] text-[#777067] font-mono tracking-wider">
                      {msg.caption}
                    </div>
                  </div>
                ) : (
                  /* Paper / Ink Bubble */
                  <div
                    className={`px-4 py-2.5 rounded-2xl leading-relaxed text-[12px] font-serif-sc shadow-sm ${
                      isChar
                        ? 'bg-[#ebe7df] text-[#242323] border border-[rgba(40,36,31,.12)] rounded-bl-xs'
                        : 'bg-[#36332f] text-[#fbf9f5] rounded-br-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Ribbon Bar */}
      <div className="relative z-10 p-3 bg-[rgba(247,244,238,.9)] backdrop-blur-xl border-t border-[rgba(40,36,31,.12)]">
        <div className="flex items-center gap-2">
          <button className="p-2 text-[#8b8782] hover:text-[#242323]">
            <Paperclip className="w-4 h-4" />
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="像写纸条一样丢进风里..."
              className="w-full py-2 pl-3.5 pr-8 rounded-2xl text-xs outline-none bg-[#ebe7df] border border-[rgba(40,36,31,.15)] text-[#242323] placeholder-[#99928a] font-serif-sc focus:border-[#8b7560]"
            />
            <button className="absolute right-2.5 top-2.5 text-[#8b8782]">
              <Smile className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleSend}
            className="w-8 h-8 rounded-full bg-[#36332f] text-white grid place-items-center shadow-sm active:scale-95 transition-transform"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
