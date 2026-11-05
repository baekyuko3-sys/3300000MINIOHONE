import { readPersistentState, reportPersistenceIssue } from './usePersistentState';

// Family-card allowance is auxiliary state; keep its existing storage key and migration format.
function writeWalletState<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage failure leaves the previous value intact */ }
}

export interface WalletTransaction {
  id: string;
  type: 'redpacket_send' | 'redpacket_grab' | 'topup' | 'transfer';
  amount: number;
  desc: string;
  counterparty?: string;
  createdAt: string;
}

type TransferSettlement = { id: string; status: 'sent' | 'accepted' | 'refunded'; amount: number; counterparty: string; familyHolderName?: string; updatedAt: string };
type PacketOperation = {
  id: string;
  claimed: string[];
  refunded: boolean;
  sent?: boolean;
  slots?: Record<string, number>;
  sharesCents?: number[];
  totalCents?: number;
  familyHolderName?: string;
};
type WalletLedger = {
  version: 1;
  balanceCents: number;
  transactions: WalletTransaction[];
  transfers: TransferSettlement[];
  packets: PacketOperation[];
  familyCards: FamilyCard[];
};

const LEDGER_KEY = 'line:wallet-ledger-v1';
const LEDGER_BACKUP_KEY = 'line:wallet-ledger-v1:backup';
let walletLedgerBlocked = false;
const BALANCE_KEY = 'line:wallet-balance';
const TX_KEY = 'line:wallet-transactions';
const TRANSFER_SETTLEMENT_KEY = 'line:wallet-transfer-settlements';
const PACKET_OPERATION_KEY = 'line:wallet-redpacket-operations';
const FAMILY_KEY = 'line:wallet-family-cards';
const WALLET_LOCK_NAME = '33phone-wallet-ledger-v1';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function makeEmptyLedger(): WalletLedger {
  return { version: 1, balanceCents: 0, transactions: [], transfers: [], packets: [], familyCards: [] };
}

function parseWalletLedger(raw: string | null): WalletLedger | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WalletLedger>;
    if (parsed?.version !== 1 || !Number.isFinite(parsed.balanceCents) ||
      !Array.isArray(parsed.transactions) || !Array.isArray(parsed.transfers) || !Array.isArray(parsed.packets)) return null;
    return {
      version: 1,
      balanceCents: Math.max(0, Math.round(Number(parsed.balanceCents))),
      transactions: parsed.transactions,
      transfers: parsed.transfers,
      packets: parsed.packets,
      familyCards: Array.isArray(parsed.familyCards) ? parsed.familyCards : readJson<FamilyCard[]>(FAMILY_KEY, []),
    };
  } catch {
    return null;
  }
}

/** Read the consolidated ledger, recovering the last verified copy before legacy migration. */
function readWalletLedger(): WalletLedger {
  if (typeof window === 'undefined') return makeEmptyLedger();
  let primaryRaw: string | null = null;
  let backupRaw: string | null = null;
  try {
    primaryRaw = window.localStorage.getItem(LEDGER_KEY);
    backupRaw = window.localStorage.getItem(LEDGER_BACKUP_KEY);
  } catch {
    walletLedgerBlocked = true;
    reportPersistenceIssue('wallet-read', '钱包账本无法读取；为防止覆盖可能存在的余额和流水，已暂停钱包写入');
    return makeEmptyLedger();
  }

  const primary = parseWalletLedger(primaryRaw);
  if (primary) {
    walletLedgerBlocked = false;
    return primary;
  }
  const backup = parseWalletLedger(backupRaw);
  if (backup) {
    walletLedgerBlocked = false;
    if (primaryRaw !== null) {
      reportPersistenceIssue('wallet-recovery', '钱包主账本损坏，已从最近一次验证过的备份账本恢复');
      try {
        const recoveryKey = 'sane333:recovery:corrupt:line-wallet-ledger';
        if (window.localStorage.getItem(recoveryKey) === null) {
          window.localStorage.setItem(recoveryKey, JSON.stringify({ key: LEDGER_KEY, capturedAt: new Date().toISOString(), raw: primaryRaw }));
        }
      } catch { /* the valid backup remains available */ }
    }
    return backup;
  }

  if (primaryRaw !== null || backupRaw !== null) {
    walletLedgerBlocked = true;
    // Do not silently migrate stale split keys over a corrupt consolidated ledger.
    // Preserve the damaged bytes and fail closed until the user restores a backup.
    try {
      const damaged = primaryRaw ?? backupRaw;
      const recoveryKey = 'sane333:recovery:corrupt:line-wallet-ledger';
      if (damaged && window.localStorage.getItem(recoveryKey) === null) {
        window.localStorage.setItem(recoveryKey, JSON.stringify({ key: primaryRaw !== null ? LEDGER_KEY : LEDGER_BACKUP_KEY, capturedAt: new Date().toISOString(), raw: damaged }));
      }
    } catch { /* keep the original ledger keys untouched */ }
    reportPersistenceIssue('wallet-corrupt', '钱包主账本和恢复副本均无法解析；已暂停钱包写入以免覆盖原始账单数据');
    return makeEmptyLedger();
  }

  walletLedgerBlocked = false;
  const legacyBalance = Number(readJson<number>(BALANCE_KEY, 0));
  const legacyTransactions = readJson<WalletTransaction[]>(TX_KEY, []);
  const legacyTransfers = readJson<TransferSettlement[]>(TRANSFER_SETTLEMENT_KEY, []);
  const legacyPackets = readJson<PacketOperation[]>(PACKET_OPERATION_KEY, []);
  return {
    version: 1,
    balanceCents: Number.isFinite(legacyBalance) ? Math.max(0, Math.round(legacyBalance * 100)) : 0,
    transactions: Array.isArray(legacyTransactions) ? legacyTransactions : [],
    transfers: Array.isArray(legacyTransfers) ? legacyTransfers : [],
    packets: Array.isArray(legacyPackets) ? legacyPackets : [],
    familyCards: readJson<FamilyCard[]>(FAMILY_KEY, []),
  };
}

/** The primary ledger is authoritative; a verified mirror permits recovery from later corruption. */
function persistWalletLedger(next: WalletLedger): boolean {
  if (typeof window === 'undefined' || walletLedgerBlocked) return false;
  try {
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(LEDGER_KEY, serialized);
    if (window.localStorage.getItem(LEDGER_KEY) !== serialized) return false;
    // Write the recovery mirror only after the primary commit has been verified.
    // A failed mirror write must not roll back a valid primary transaction.
    try { window.localStorage.setItem(LEDGER_BACKUP_KEY, serialized); } catch { /* primary remains committed */ }
    return true;
  } catch {
    return false;
  }
}

function notifyWalletUpdated(): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
  }
}

function makeTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): WalletTransaction {
  return {
    ...tx,
    id: 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
  };
}

let fallbackWalletQueue: Promise<unknown> = Promise.resolve();

async function commitWalletLedger<T>(mutate: (current: WalletLedger) => { next: WalletLedger; result: T } | null): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  const execute = (): T | null => {
    const current = readWalletLedger();
    const changed = mutate(current);
    if (!changed || !persistWalletLedger(changed.next)) return null;
    // Keep legacy family-card readers in sync, but the ledger remains authoritative.
    try { window.localStorage.setItem(FAMILY_KEY, JSON.stringify(changed.next.familyCards)); } catch { /* ledger commit already succeeded */ }
    notifyWalletUpdated();
    return changed.result;
  };
  try {
    const lockManager = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: { request: <R>(name: string, options: { mode: 'exclusive' }, callback: () => R) => Promise<R> } }).locks
      : undefined;
    if (lockManager?.request) return await lockManager.request(WALLET_LOCK_NAME, { mode: 'exclusive' }, execute);
    // Compatibility fallback: serialize this tab's operations. Cross-tab safety is provided
    // by Web Locks in current Chromium, Firefox and Safari; this fallback keeps older browsers usable.
    const task = fallbackWalletQueue.then(execute, execute);
    fallbackWalletQueue = task.then(() => undefined, () => undefined);
    return await task;
  } catch {
    return null;
  }
}

export function getWalletBalance(): number {
  return readWalletLedger().balanceCents / 100;
}

export async function setWalletBalance(amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount < 0) return;
  await commitWalletLedger(current => ({
    next: { ...current, balanceCents: Math.round(amount * 100) },
    result: undefined,
  }));
}

export function getWalletTransactions(): WalletTransaction[] {
  return readWalletLedger().transactions;
}

export async function addWalletTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): Promise<WalletTransaction | null> {
  if (!Number.isFinite(tx.amount) || Math.round(tx.amount * 100) === 0) return null;
  return commitWalletLedger(current => {
    const delta = Math.round(tx.amount * 100);
    const balanceCents = current.balanceCents + delta;
    if (balanceCents < 0) return null;
    const full = makeTransaction({ ...tx, amount: delta / 100 });
    return {
      next: { ...current, balanceCents, transactions: [full, ...current.transactions] },
      result: full,
    };
  });
}

function findTransfer(current: WalletLedger, id: string): TransferSettlement | undefined {
  return current.transfers.find(entry => entry.id === id);
}

/** Read authoritative transfer state for chat-card recovery after a failed UI write. */
export function getWalletTransferStatus(operationId: string): TransferSettlement['status'] | null {
  if (!operationId) return null;
  return findTransfer(readWalletLedger(), operationId)?.status || null;
}

export async function walletSendTransfer(amount: number, counterparty: string, desc = '', operationId?: string, familyHolderName?: string): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0 || !operationId?.trim()) return false;
  const cents = Math.round(amount * 100);
  if (cents <= 0) return false;
  const result = await commitWalletLedger(current => {
    const existing = findTransfer(current, operationId);
    if (existing) return { next: current, result: existing.status !== 'refunded' && existing.amount === cents / 100 };
    if (current.balanceCents < cents) return null;
    const now = new Date().toISOString();
    const settlement: TransferSettlement = { id: operationId, status: 'sent', amount: cents / 100, counterparty, familyHolderName: familyHolderName || undefined, updatedAt: now };
    const transaction = makeTransaction({ type: 'transfer', amount: -cents / 100, desc: desc || '转账支出', counterparty: counterparty || undefined });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents - cents,
        transactions: [transaction, ...current.transactions],
        transfers: [settlement, ...current.transfers.filter(entry => entry.id !== operationId)],
        familyCards: applyFamilyCardSpend(current.familyCards, familyHolderName, cents),
      },
      result: true,
    };
  });
  return result === true;
}

export async function walletSettleTransfer(operationId: string, decision: 'accepted' | 'rejected'): Promise<boolean> {
  if (!operationId || (decision !== 'accepted' && decision !== 'rejected')) return false;
  const result = await commitWalletLedger(current => {
    const item = findTransfer(current, operationId);
    if (!item) return null;
    if (item.status !== 'sent') return { next: current, result: item.status === (decision === 'accepted' ? 'accepted' : 'refunded') };
    const now = new Date().toISOString();
    const updated: TransferSettlement = { ...item, status: decision === 'accepted' ? 'accepted' : 'refunded', updatedAt: now };
    if (decision === 'accepted') {
      return { next: { ...current, transfers: [updated, ...current.transfers.filter(entry => entry.id !== operationId)] }, result: true };
    }
    const transaction = makeTransaction({ type: 'transfer', amount: item.amount, desc: '转账拒收退款', counterparty: item.counterparty || undefined });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents + Math.round(item.amount * 100),
        familyCards: applyFamilyCardAdjustment(current.familyCards, item.familyHolderName, -Math.round(item.amount * 100)),
        transactions: [transaction, ...current.transactions],
        transfers: [updated, ...current.transfers.filter(entry => entry.id !== operationId)],
      },
      result: true,
    };
  });
  return result === true;
}

function findPacket(current: WalletLedger, id: string): PacketOperation | undefined {
  return current.packets.find(entry => entry.id === id);
}

/** Read reserved packet slots so LINE can repair a stale chat card after a storage failure. */
export function getWalletPacketClaims(packetId: string): Array<{ claimId: string; slotIndex: number; amountCents: number }> {
  const packet = findPacket(readWalletLedger(), packetId);
  if (!packet || !packet.slots || !Array.isArray(packet.sharesCents)) return [];
  return Object.entries(packet.slots)
    .filter(([claimId, slotIndex]) => Boolean(claimId) && Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < packet.sharesCents!.length)
    .map(([claimId, slotIndex]) => ({
      claimId,
      slotIndex,
      amountCents: Number(packet.sharesCents![slotIndex] || 0),
    }))
    .filter(item => item.amountCents > 0);
}

export async function walletSendRedPacket(totalAmount: number, desc: string, operationId?: string, sharesCents?: number[], familyHolderName?: string): Promise<boolean> {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !operationId?.trim()) return false;
  const cents = Math.round(totalAmount * 100);
  if (cents <= 0) return false;
  if (!Array.isArray(sharesCents) || !sharesCents.length || sharesCents.some(value => !Number.isInteger(value) || value <= 0) || sharesCents.reduce((sum, value) => sum + value, 0) !== cents) return false;
  const result = await commitWalletLedger(current => {
    const existing = findPacket(current, operationId);
    if (existing) {
      const sameShares = Array.isArray(existing.sharesCents) && existing.sharesCents.length === sharesCents.length && existing.sharesCents.every((value, index) => value === sharesCents[index]);
      return { next: current, result: existing.sent === true && !existing.refunded && existing.totalCents === cents && sameShares };
    }
    if (current.balanceCents < cents) return null;
    const packet: PacketOperation = { id: operationId, claimed: [], refunded: false, sent: true, sharesCents: [...sharesCents], totalCents: cents, slots: {}, familyHolderName: familyHolderName || undefined };
    const transaction = makeTransaction({ type: 'redpacket_send', amount: -cents / 100, desc: desc || '发出红包' });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents - cents,
        transactions: [transaction, ...current.transactions],
        packets: [packet, ...current.packets.filter(entry => entry.id !== operationId)],
        familyCards: applyFamilyCardSpend(current.familyCards, familyHolderName, cents),
      },
      result: true,
    };
  });
  return result === true;
}

/** Reserve a unique share for an NPC on a packet sent by this wallet. */
export async function walletRegisterRedPacketClaim(packetId: string, claimId: string, slotIndex: number): Promise<boolean> {
  if (!packetId || !claimId || !Number.isInteger(slotIndex) || slotIndex < 0) return false;
  const result = await commitWalletLedger(current => {
    const packet = findPacket(current, packetId);
    if (!packet?.sent || packet.refunded || !packet.sharesCents || slotIndex >= packet.sharesCents.length) return null;
    const existingSlot = packet.slots?.[claimId];
    if (packet.claimed.includes(claimId)) return { next: current, result: existingSlot === slotIndex };
    if (Object.entries(packet.slots || {}).some(([id, slot]) => id !== claimId && slot === slotIndex)) return null;
    const nextPacket: PacketOperation = {
      ...packet,
      slots: { ...(packet.slots || {}), [claimId]: slotIndex },
      claimed: [...packet.claimed, claimId],
    };
    return {
      next: { ...current, packets: [nextPacket, ...current.packets.filter(entry => entry.id !== packetId)] },
      result: true,
    };
  });
  return result === true;
}

/** Claiming an incoming packet credits balance and records the claim in one commit. */
export async function walletClaimRedPacket(packetId: string, claimId: string, amount: number, from: string, slotIndex?: number, sharesCents?: number[], totalAmount?: number): Promise<boolean> {
  if (!packetId || !claimId || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(slotIndex) || (slotIndex as number) < 0) return false;
  if (!Array.isArray(sharesCents) || !sharesCents.length || sharesCents.some(value => !Number.isInteger(value) || value <= 0)) return false;
  if (!Number.isFinite(totalAmount) || (totalAmount as number) <= 0) return false;
  const cents = Math.round(amount * 100);
  const totalCents = Math.round((totalAmount as number) * 100);
  const slot = slotIndex as number;
  if (cents <= 0 || slot >= sharesCents.length || sharesCents[slot] !== cents || sharesCents.reduce((sum, value) => sum + value, 0) !== totalCents) return false;
  const result = await commitWalletLedger(current => {
    const packet = findPacket(current, packetId);
    if (packet?.sent || packet?.refunded || packet?.claimed.includes(claimId)) return null;
    if (packet?.sharesCents && (packet.sharesCents.length !== sharesCents.length || packet.sharesCents.some((value, index) => value !== sharesCents[index]))) return null;
    if (packet && Object.entries(packet.slots || {}).some(([id, used]) => id !== claimId && used === slot)) return null;
    const nextPacket: PacketOperation = {
      ...(packet || { id: packetId, claimed: [], refunded: false, sent: false }),
      sharesCents: packet?.sharesCents || [...sharesCents],
      totalCents: packet?.totalCents || sharesCents.reduce((sum, value) => sum + value, 0),
      slots: { ...(packet?.slots || {}), [claimId]: slot },
      claimed: [...(packet?.claimed || []), claimId],
    };
    const transaction = makeTransaction({ type: 'redpacket_grab', amount: cents / 100, desc: `抢到${from}的红包`, counterparty: from });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents + cents,
        transactions: [transaction, ...current.transactions],
        packets: [nextPacket, ...current.packets.filter(entry => entry.id !== packetId)],
      },
      result: true,
    };
  });
  return result === true;
}

/** Only the original sender may refund; refund amount is derived from the stored share table. */
export async function walletRefundRedPacket(packetId: string, _amount: number, desc = '未领取红包退回', legacySharesCents?: number[], claimedSlots: number[] = []): Promise<boolean> {
  if (!packetId) return false;
  const validLegacyShares = Array.isArray(legacySharesCents) && legacySharesCents.length > 0 && legacySharesCents.every(value => Number.isInteger(value) && value > 0)
    ? legacySharesCents
    : null;
  const result = await commitWalletLedger(current => {
    const existing = findPacket(current, packetId);
    if (existing?.refunded) return { next: current, result: true };
    if (existing?.sent === false) return null;
    const legacyTotalCents = validLegacyShares?.reduce((sum, value) => sum + value, 0);
    const legacySendCount = legacyTotalCents
      ? current.transactions.filter(tx => tx.type === 'redpacket_send' && tx.amount < 0 && Math.round(-tx.amount * 100) === legacyTotalCents).length
      : 0;
    const alreadyRecoveredCount = legacyTotalCents
      ? current.packets.filter(item => item.sent === true && item.refunded && item.totalCents === legacyTotalCents).length
      : 0;
    const hasUnmatchedLegacyDebit = legacySendCount > alreadyRecoveredCount;
    // Old versions sometimes created an operation record only when an NPC claimed.
    // Reconstruct only when a matching historical debit still exists and is unused.
    const packet: PacketOperation | undefined = existing?.sent === true
      ? existing
      : (validLegacyShares && hasUnmatchedLegacyDebit
        ? {
            ...(existing || { id: packetId, claimed: [], refunded: false }),
            sent: true,
            sharesCents: existing?.sharesCents?.length ? existing.sharesCents : [...validLegacyShares],
            totalCents: existing?.totalCents || legacyTotalCents,
            slots: existing?.slots || {},
          }
        : undefined);
    if (!packet?.sent) return null;
    const fixedShares = packet.sharesCents?.length ? packet.sharesCents : validLegacyShares;
    if (!fixedShares?.length || fixedShares.some(value => !Number.isInteger(value) || value <= 0)) return null;
    const occupied = new Set<number>([
      ...Object.values(packet.slots || {}),
      ...claimedSlots.filter(Number.isInteger),
    ]);
    const refundCents = fixedShares.reduce((sum, share, index) => sum + (occupied.has(index) ? 0 : share), 0);
    const updated: PacketOperation = {
      ...packet,
      sharesCents: fixedShares,
      totalCents: packet.totalCents || fixedShares.reduce((sum, value) => sum + value, 0),
      refunded: true,
    };
    const transactions = refundCents > 0
      ? [makeTransaction({ type: 'redpacket_send', amount: refundCents / 100, desc }), ...current.transactions]
      : current.transactions;
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents + refundCents,
        familyCards: applyFamilyCardAdjustment(current.familyCards, packet.familyHolderName, -refundCents),
        transactions,
        packets: [updated, ...current.packets.filter(entry => entry.id !== packetId)],
      },
      result: true,
    };
  });
  return result === true;
}

export async function walletGrabRedPacket(amount: number, from: string): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await addWalletTransaction({ type: 'redpacket_grab', amount, desc: `抢到${from}的红包`, counterparty: from });
}

export async function walletTopup(amount: number): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return Boolean(await addWalletTransaction({ type: 'topup', amount: Math.round(amount * 100) / 100, desc: '钱包充值' }));
}

export function formatWalletAmount(amount: number): string {
  const sign = amount > 0 ? '+' : '';
  return `${sign}¥${Math.abs(amount).toFixed(2)}`;
}

export interface FamilyCard {
  id: string;
  holderName: string;
  holderAvatar?: string;
  monthlyLimit: number;
  spentThisMonth: number;
  createdAt: string;
  /** Local calendar month for spentThisMonth; absent on legacy cards. */
  monthKey?: string;
}

function applyFamilyCardSpend(cards: FamilyCard[] | undefined, holderName: string | undefined, amountCents: number): FamilyCard[] {
  const normalized = normalizeFamilyCardsForMonth(cards || [], currentFamilyCardMonth());
  if (!holderName) return normalized;
  const index = normalized.findIndex(card => card.holderName === holderName);
  if (index < 0) return normalized;
  const next = [...normalized];
  const card = next[index];
  next[index] = { ...card, spentThisMonth: Math.round((card.spentThisMonth * 100 + amountCents)) / 100 };
  return next;
}

function applyFamilyCardAdjustment(cards: FamilyCard[] | undefined, holderName: string | undefined, amountCents: number): FamilyCard[] {
  const normalized = normalizeFamilyCardsForMonth(cards || [], currentFamilyCardMonth());
  if (!holderName || !amountCents) return normalized;
  const index = normalized.findIndex(card => card.holderName === holderName);
  if (index < 0) return normalized;
  const next = [...normalized];
  const card = next[index];
  next[index] = { ...card, spentThisMonth: Math.max(0, Math.round((card.spentThisMonth * 100 + amountCents)) / 100) };
  return next;
}

export function currentFamilyCardMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Preserve legacy spend once, then reset the monthly counter when the calendar month changes. */
export function normalizeFamilyCardsForMonth(cards: FamilyCard[], monthKey: string): FamilyCard[] {
  return cards.map(card => {
    // Legacy cards have no month marker. Preserve their existing value as the
    // current month's spend rather than unexpectedly erasing user data.
    if (!card.monthKey) return { ...card, monthKey };
    if (card.monthKey !== monthKey) return { ...card, spentThisMonth: 0, monthKey };
    return card;
  });
}

export function getFamilyCards(): FamilyCard[] {
  const stored = readWalletLedger().familyCards || readPersistentState<FamilyCard[]>(FAMILY_KEY, []);
  return normalizeFamilyCardsForMonth(stored, currentFamilyCardMonth());
}

export async function addFamilyCard(holderName: string, monthlyLimit: number, holderAvatar?: string): Promise<FamilyCard | null> {
  if (!holderName.trim() || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return null;
  const card: FamilyCard = {
    id: 'fc-' + Date.now().toString(36),
    holderName,
    holderAvatar,
    monthlyLimit,
    spentThisMonth: 0,
    monthKey: currentFamilyCardMonth(),
    createdAt: new Date().toISOString(),
  };
  const saved = await commitWalletLedger(current => ({ next: { ...current, familyCards: [...normalizeFamilyCardsForMonth(current.familyCards || [], currentFamilyCardMonth()), card] }, result: card }));
  return saved || null;
}

export async function removeFamilyCard(id: string): Promise<void> {
  await commitWalletLedger(current => ({ next: { ...current, familyCards: (current.familyCards || []).filter(card => card.id !== id) }, result: undefined }));
}

// 亲情卡消费：把给持卡人的钱计入月限额（发红包/转账时调用）
// 没有亲情卡 → 返回 true（不限制）；超限额 → 返回 false（仍然记录，显示为超支）
export async function spendFamilyCard(holderName: string, amount: number): Promise<boolean> {
  if (!holderName || !Number.isFinite(amount) || amount <= 0) return false;
  const result = await commitWalletLedger(current => {
    const list = normalizeFamilyCardsForMonth(current.familyCards || [], currentFamilyCardMonth());
    const idx = list.findIndex(card => card.holderName === holderName);
    if (idx < 0) return { next: { ...current, familyCards: list }, result: true };
    const card = list[idx];
    const spent = Math.round((card.spentThisMonth + amount) * 100) / 100;
    const next = [...list];
    next[idx] = { ...card, spentThisMonth: spent };
    return { next: { ...current, familyCards: next }, result: spent <= card.monthlyLimit };
  });
  return result === true;
}

// 自定义金额充值
export async function walletTopupCustom(amount: number): Promise<boolean> {
  if (amount <= 0 || !isFinite(amount)) return false;
  return walletTopup(Math.round(amount * 100) / 100);
}
