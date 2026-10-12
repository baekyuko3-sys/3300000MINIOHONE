import { readAppSettings } from './appSettings';
import { runProactiveCatchup } from './proactiveRuntime';

const HEARTBEAT_KEY = 'phone:background-heartbeat';
const ACTIVITY_KEY = 'phone:last-active-at';
let timer: number | null = null;

export interface BackgroundHeartbeat {
  lastActiveAt: string;
  heartbeatAt: string;
  backgroundEnabled: boolean;
}

function persistHeartbeat() {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  const settings = readAppSettings();
  const heartbeat: BackgroundHeartbeat = {
    lastActiveAt: window.localStorage.getItem(ACTIVITY_KEY) || now,
    heartbeatAt: now,
    backgroundEnabled: settings.backgroundEnabled,
  };
  try {
    window.localStorage.setItem(HEARTBEAT_KEY, JSON.stringify(heartbeat));
  } catch {
    // Ignore storage limits.
  }
}

export function markUserActivity() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVITY_KEY, new Date().toISOString());
  } catch {
    // Ignore storage limits.
  }
  persistHeartbeat();
}

export function getBackgroundHeartbeat(): BackgroundHeartbeat | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HEARTBEAT_KEY);
    return raw ? (JSON.parse(raw) as BackgroundHeartbeat) : null;
  } catch {
    return null;
  }
}

export function startBackgroundRuntime() {
  if (typeof window === 'undefined' || timer !== null) return;

  const tick = () => {
    persistHeartbeat();
    const settings = readAppSettings();

    void runProactiveCatchup();

    if (settings.notificationEnabled && 'Notification' in window && Notification.permission === 'granted') {
      document.dispatchEvent(new CustomEvent('sane333:background-tick'));
    }

    const interval = Math.max(1, Math.min(30, settings.keepAliveMinutes)) * 60_000;
    window.clearInterval(timer ?? undefined);
    timer = window.setInterval(tick, interval);
    persistHeartbeat();
  };

  window.addEventListener('focus', () => {
    markUserActivity();
    void runProactiveCatchup();
  });
  window.addEventListener('click', markUserActivity, { passive: true });
  document.addEventListener('visibilitychange', () => {
    markUserActivity();
    if (document.visibilityState === 'visible') void runProactiveCatchup();
  });
  window.addEventListener('beforeunload', persistHeartbeat);
  tick();
}

export function stopBackgroundRuntime() {
  if (typeof window === 'undefined') return;
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export function notifyFromRuntime(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  new Notification(title, { body, tag: 'sane333' });
  return true;
}
