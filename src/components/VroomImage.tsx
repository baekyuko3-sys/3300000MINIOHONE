import { useEffect, useState } from 'react';
import { getMedia } from '../store/mediaVault';

/** VROOM 动态图片：media: 引用（IndexedDB 大图）自动解析，data:/http 直接显示 */
export function VroomImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  const [resolved, setResolved] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    setResolved('');
    const value = String(src || '');
    if (!value) return;
    if (value.startsWith('media:')) {
      void getMedia(value.slice(6)).then(url => {
        if (!cancelled && url) setResolved(url);
      });
    } else {
      setResolved(value);
    }
    return () => { cancelled = true; };
  }, [src]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src, resolved]);
  if (!resolved || failed) return null;
  return <img src={resolved} alt={alt || ''} className={className} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
