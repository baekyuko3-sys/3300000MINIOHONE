import { useEffect, useState } from 'react';
import { getMedia } from '../store/mediaVault';

export function npcInitial(name: string): string {
  const clean = String(name || '').trim();
  if (!clean) return '?';
  return clean[0]!.toUpperCase();
}

function palette(name: string): string {
  const paletteList = [
    'linear-gradient(145deg,#b6a38d,#695e55)',
    'linear-gradient(145deg,#c4a7a7,#7d5a60)',
    'linear-gradient(145deg,#a7b8c4,#5a6e7d)',
    'linear-gradient(145deg,#b0c4a7,#5f7d5a)',
    'linear-gradient(145deg,#c4b49a,#7d6a4e)',
  ];
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return paletteList[hash % paletteList.length]!;
}

interface NpcAvatarProps {
  name: string;
  avatar?: string;
  className?: string;
  textClassName?: string;
}

/** 上传头像优先，没有就用名字第一个大字，media: 引用自动解析 */
export function NpcAvatar({ name, avatar, className, textClassName }: NpcAvatarProps) {
  const [resolved, setResolved] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    setResolved('');
    const value = String(avatar || '');
    if (!value) return;
    if (value.startsWith('media:')) {
      void getMedia(value.slice(6)).then(url => {
        if (!cancelled && url) setResolved(url);
      });
    } else {
      setResolved(value);
    }
    return () => { cancelled = true; };
  }, [avatar]);

  if (resolved) {
    return (
      <span className={className} style={{ overflow: 'hidden' }}>
        <img src={resolved} alt={name} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ background: palette(name), display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}
    >
      <span className={textClassName}>{npcInitial(name)}</span>
    </span>
  );
}
