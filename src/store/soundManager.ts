import { getMedia } from './mediaVault';
import { readAppSettings } from './appSettings';

export type AppSoundKind = 'message' | 'moments' | 'call';

function getSource(kind: AppSoundKind, settings: ReturnType<typeof readAppSettings>): { ref: string; url: string } {
  if (kind === 'message') return { ref: settings.messageSoundRef, url: settings.messageSoundUrl };
  if (kind === 'moments') return { ref: settings.momentsSoundRef, url: settings.momentsSoundUrl };
  return { ref: settings.callRingtoneRef, url: settings.callRingtoneUrl };
}

export async function playAppSound(kind: AppSoundKind): Promise<void> {
  const settings = readAppSettings();
  if (!settings.soundEnabled) return;

  const source = getSource(kind, settings);
  let src = source.url.trim();
  if (source.ref) {
    try {
      const dataUrl = await getMedia(source.ref);
      if (dataUrl) src = dataUrl;
    } catch {
      // Fall back to a URL or the built-in tone.
    }
  }

  try {
    if (src) {
      const audio = new Audio(src);
      audio.volume = Math.max(0, Math.min(1, settings.soundVolume));
      await audio.play();
      return;
    }
  } catch {
    // Autoplay restrictions or an invalid URL should not break the app.
  }

  const context = typeof window !== 'undefined'
    ? new (window.AudioContext || (window as any).webkitAudioContext)()
    : null;
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = kind === 'call' ? 'sine' : 'triangle';
  oscillator.frequency.value = kind === 'call' ? 880 : kind === 'moments' ? 660 : 520;
  gain.gain.value = Math.max(0.01, Math.min(0.08, settings.soundVolume * 0.12));
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + (kind === 'call' ? 0.55 : 0.16));
}

export async function saveSoundFile(file: File, kind: AppSoundKind): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('SOUND_FILE_READ_FAILED'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
  if (!dataUrl) throw new Error('SOUND_FILE_EMPTY');

  const ref = await import('./mediaVault').then(module =>
    module.putMedia(dataUrl, 'sound-' + kind + '-' + Date.now().toString(36))
  );
  return ref;
}
