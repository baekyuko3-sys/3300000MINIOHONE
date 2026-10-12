import type { MusicTrack } from './music';
import { getLikedTracks, saveLikedTracks } from './music';

export interface MusicProfile {
  id: string;
  name: string;
  sig: string;
  img?: string;
  /** Linked LINE persona id (optional). */
  personaId?: string;
  /** palette index 0-2 */
  t?: number;
  likedTrackIds: string[];
}

const PROFILES_KEY = 'phone:music-profiles';
const ACTIVE_KEY = 'phone:music-active-profile';
const LIKED_BY_PROFILE_KEY = 'phone:music-liked-by-profile';
const LEGACY_IDENTITIES_KEY = 'phone:music-identities-v1';
const LEGACY_ACTIVE_KEY = 'phone:music-active-identity-v1';

function uid() {
  return 'mp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function defaultProfiles(): MusicProfile[] {
  return [
    {
      id: uid(),
      name: '我',
      sig: '',
      likedTrackIds: getLikedTracks().map((track) => track.id),
      t: 0,
    },
  ];
}

function normalizeProfile(item: Partial<MusicProfile> & { note?: string; avatar?: string }): MusicProfile {
  const rawSig = item.sig != null ? item.sig : item.note != null ? item.note : '';
  // 旧版默认文案，当成未填写
  const cleaned = String(rawSig).trim() === '刚刚开始用音乐' ? '' : String(rawSig);
  return {
    id: String(item.id || uid()),
    name: String(item.name || '未命名').slice(0, 8),
    sig: cleaned.slice(0, 40),
    img: item.img ? String(item.img) : item.avatar ? String(item.avatar) : '',
    personaId: item.personaId ? String(item.personaId) : '',
    t: typeof item.t === 'number' ? item.t : 0,
    likedTrackIds: Array.isArray(item.likedTrackIds) ? item.likedTrackIds.map(String) : [],
  };
}

function migrateFromLegacyIdentities(): MusicProfile[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_IDENTITIES_KEY) || 'null');
    if (!Array.isArray(parsed) || !parsed.length) return null;
    const likedMap: Record<string, MusicTrack[]> = {};
    const profiles = parsed.map((item: any) => {
      const id = String(item.id || uid());
      const liked = Array.isArray(item.likedTracks)
        ? item.likedTracks.filter((track: any) => track && track.id)
        : [];
      likedMap[id] = liked;
      return normalizeProfile({
        id,
        name: item.name,
        note: item.note,
        avatar: item.avatar,
        personaId: item.personaId,
        likedTrackIds: liked.map((track: MusicTrack) => track.id),
      });
    });
    writeLikedMap(likedMap);
    saveMusicProfiles(profiles);
    const legacyActive = window.localStorage.getItem(LEGACY_ACTIVE_KEY) || '';
    const activeId = profiles.some((profile) => profile.id === legacyActive)
      ? legacyActive
      : profiles[0].id;
    setActiveMusicProfileId(activeId);
    if (likedMap[activeId]?.length) saveLikedTracks(likedMap[activeId]);
    return profiles;
  } catch {
    return null;
  }
}

export function getMusicProfiles(): MusicProfile[] {
  if (typeof window === 'undefined') return defaultProfiles();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILES_KEY) || 'null');
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item) => normalizeProfile(item));
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateFromLegacyIdentities();
  if (migrated?.length) return migrated;
  const created = defaultProfiles();
  saveMusicProfiles(created);
  return created;
}

export function saveMusicProfiles(profiles: MusicProfile[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.slice(0, 20)));
  window.dispatchEvent(new CustomEvent('sane333:music-profiles-changed'));
}

export function getActiveMusicProfileId(): string {
  if (typeof window === 'undefined') return '';
  const stored = window.localStorage.getItem(ACTIVE_KEY) || '';
  const profiles = getMusicProfiles();
  if (profiles.some((profile) => profile.id === stored)) return stored;
  return profiles[0]?.id || '';
}

export function setActiveMusicProfileId(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new CustomEvent('sane333:music-profiles-changed'));
}

export function getActiveMusicProfile(): MusicProfile {
  const profiles = getMusicProfiles();
  const activeId = getActiveMusicProfileId();
  return profiles.find((profile) => profile.id === activeId) || profiles[0];
}

function readLikedMap(): Record<string, MusicTrack[]> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIKED_BY_PROFILE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLikedMap(map: Record<string, MusicTrack[]>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LIKED_BY_PROFILE_KEY, JSON.stringify(map));
}

/** Load active profile's liked tracks into the global music liked list used by player */
export function syncActiveProfileLikesToGlobal() {
  const profile = getActiveMusicProfile();
  if (!profile) return;
  const map = readLikedMap();
  const tracks = map[profile.id];
  if (Array.isArray(tracks) && tracks.length) {
    saveLikedTracks(tracks);
    return;
  }
  // migrate legacy global likes into this profile once
  const legacy = getLikedTracks();
  if (legacy.length) {
    map[profile.id] = legacy;
    writeLikedMap(map);
    const profiles = getMusicProfiles().map((item) =>
      item.id === profile.id
        ? { ...item, likedTrackIds: legacy.map((track) => track.id) }
        : item,
    );
    saveMusicProfiles(profiles);
  } else {
    saveLikedTracks([]);
  }
}

export function persistActiveProfileLikes(tracks: MusicTrack[]) {
  const profile = getActiveMusicProfile();
  if (!profile) return;
  const map = readLikedMap();
  map[profile.id] = tracks.slice(0, 300);
  writeLikedMap(map);
  const profiles = getMusicProfiles().map((item) =>
    item.id === profile.id
      ? { ...item, likedTrackIds: tracks.map((track) => track.id) }
      : item,
  );
  saveMusicProfiles(profiles);
  saveLikedTracks(tracks);
}

export function createMusicProfile(
  name: string,
  extras?: { sig?: string; personaId?: string },
): MusicProfile {
  const profile: MusicProfile = {
    id: uid(),
    name: name.trim().slice(0, 8) || '新 ID',
    sig: (extras?.sig || '').trim().slice(0, 40),
    personaId: extras?.personaId || '',
    likedTrackIds: [],
    t: Math.floor(Math.random() * 3),
  };
  const next = [...getMusicProfiles(), profile];
  saveMusicProfiles(next);
  setActiveMusicProfileId(profile.id);
  persistActiveProfileLikes([]);
  return profile;
}

export function updateMusicProfile(id: string, patch: Partial<MusicProfile>) {
  const next = getMusicProfiles().map((profile) =>
    profile.id === id ? { ...profile, ...patch, id: profile.id } : profile,
  );
  saveMusicProfiles(next);
}

export function switchMusicProfile(id: string) {
  // save current likes under current profile before switch
  persistActiveProfileLikes(getLikedTracks());
  setActiveMusicProfileId(id);
  syncActiveProfileLikesToGlobal();
}
