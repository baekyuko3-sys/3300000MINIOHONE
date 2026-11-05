import { readPersistentState } from './usePersistentState';

export interface WalletTransaction {
  id: string;
  type: 'redpacket_send' | 'redpacket_grab' | 'topup' | 'transfer';
  amount: number;
  desc: string;
  counterparty?: string;
  createdAt: string;
}

type TransferSettlement = { id: string; status: 'sent' | 'accepted' | 'refunded'; amount: number; counterparty: string; updatedAt: string };
type PacketOperation = {
  id: string;
  claimed: string[];
  refunded: boolean;
  sent?: boolean;
  slots?: Record<string, number>;
  sharesCents?: number[];
  totalCents?: number;
};
type WalletLedger = {
  version: 1;
  balanceCents: number;
  transactions: WalletTransaction[];
  transfers: TransferSettlement[];
  packets: PacketOperation[];
};

const LEDGER_KEY = 'line:wallet-ledger-v1';
const BALANCE_KEY = 'line:wallet-balance';
const TX_KEY = 'line:wallet-transactions';
const TRANSFER_SETTLEMENT_KEY = 'line:wallet-transfer-settlements';
const PACKET_OPERATION_KEY = 'line:wallet-redpacket-operations';

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
  return { version: 1, balanceCents: 0, transactions: [], transfers: [], packets: [] };
}

/** Read the consolidated ledger, migrating the legacy split keys once when necessary. */
function readWalletLedger(): WalletLedger {
  if (typeof window === 'undefined') return makeEmptyLedger();
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WalletLedger>;
      if (parsed?.version === 1 && Number.isFinite(parsed.balanceCents) && Array.isArray(parsed.transactions) && Array.isArray(parsed.transfers) && Array.isArray(parsed.packets)) {
        return {
          version: 1,
          balanceCents: Math.max(0, Math.round(Number(parsed.balanceCents))),
          transactions: parsed.transactions,
          transfers: parsed.transfers,
          packets: parsed.packets,
        };
      }
    }
  } catch { /* fall through to legacy migration */ }

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
  };
}

/** One localStorage key is the commit boundary for balance, transaction and settlement state. */
function persistWalletLedger(next: WalletLedger): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(next);
    window.localStorage.setItem(LEDGER_KEY, serialized);
    return window.localStorage.getItem(LEDGER_KEY) === serialized;
  } catch {
    return false;
  }
}

function notifyWalletUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
}

function makeTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): WalletTransaction {
  return {
    ...tx,
    id: 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
  };
}

function commitWalletLedger<T>(mutate: (current: WalletLedger) => { next: WalletLedger; result: T } | null): T | null {
  const current = readWalletLedger();
  const changed = mutate(current);
  if (!changed || !persistWalletLedger(changed.next)) return null;
  notifyWalletUpdated();
  return changed.result;
}

export function getWalletBalance(): number {
  return readWalletLedger().balanceCents / 100;
}

export function setWalletBalance(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) return;
  commitWalletLedger(current => ({
    next: { ...current, balanceCents: Math.round(amount * 100) },
    result: undefined,
  }));
}

export function getWalletTransactions(): WalletTransaction[] {
  return readWalletLedger().transactions;
}

export function addWalletTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): WalletTransaction | null {
  if (!Number.isFinite(tx.amount) || Math.round(tx.amount * 100) === 0) return null;
  return commitWalletLedger(current => {
    const delta = Math.round(tx.amount * 100);
    const balanceCents = current.balanceCents + delta;
    if (balanceCents < 0) return null;
    const full = makeTransaction({ ...tx, amount: delta / 100 });
    return {
      next: { ...current, balanceCents, transactions: [full, ...current.transactions].slice(0, 200) },
      result: full,
    };
  });
}

function findTransfer(current: WalletLedger, id: string): TransferSettlement | undefined {
  return current.transfers.find(entry => entry.id === id);
}

export function walletSendTransfer(amount: number, counterparty: string, desc = '', operationId?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0 || !operationId?.trim()) return false;
  const cents = Math.round(amount * 100);
  if (cents <= 0) return false;
  const result = commitWalletLedger(current => {
    const existing = findTransfer(current, operationId);
    if (existing) return { next: current, result: existing.status !== 'refunded' && existing.amount === cents / 100 };
    if (current.balanceCents < cents) return null;
    const now = new Date().toISOString();
    const settlement: TransferSettlement = { id: operationId, status: 'sent', amount: cents / 100, counterparty, updatedAt: now };
    const transaction = makeTransaction({ type: 'transfer', amount: -cents / 100, desc: desc || '转账支出', counterparty: counterparty || undefined });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents - cents,
        transactions: [transaction, ...current.transactions].slice(0, 200),
        transfers: [settlement, ...current.transfers.filter(entry => entry.id !== operationId)].slice(0, 500),
      },
      result: true,
    };
  });
  return result === true;
}

export function walletSettleTransfer(operationId: string, decision: 'accepted' | 'rejected'): boolean {
  if (!operationId || (decision !== 'accepted' && decision !== 'rejected')) return false;
  const result = commitWalletLedger(current => {
    const item = findTransfer(current, operationId);
    if (!item) return null;
    if (item.status !== 'sent') return { next: current, result: item.status === (decision === 'accepted' ? 'accepted' : 'refunded') };
    const now = new Date().toISOString();
    const updated: TransferSettlement = { ...item, status: decision === 'accepted' ? 'accepted' : 'refunded', updatedAt: now };
    if (decision === 'accepted') {
      return { next: { ...current, transfers: [updated, ...current.transfers.filter(entry => entry.id !== operationId)].slice(0, 500) }, result: true };
    }
    const transaction = makeTransaction({ type: 'transfer', amount: item.amount, desc: '转账拒收退款', counterparty: item.counterparty || undefined });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents + Math.round(item.amount * 100),
        transactions: [transaction, ...current.transactions].slice(0, 200),
        transfers: [updated, ...current.transfers.filter(entry => entry.id !== operationId)].slice(0, 500),
      },
      result: true,
    };
  });
  return result === true;
}

function findPacket(current: WalletLedger, id: string): PacketOperation | undefined {
  return current.packets.find(entry => entry.id === id);
}

export function walletSendRedPacket(totalAmount: number, desc: string, operationId?: string, sharesCents?: number[]): boolean {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !operationId?.trim()) return false;
  const cents = Math.round(totalAmount * 100);
  if (cents <= 0) return false;
  if (!Array.isArray(sharesCents) || !sharesCents.length || sharesCents.some(value => !Number.isInteger(value) || value <= 0) || sharesCents.reduce((sum, value) => sum + value, 0) !== cents) return false;
  const result = commitWalletLedger(current => {
    const existing = findPacket(current, operationId);
    if (existing) {
      const sameShares = Array.isArray(existing.sharesCents) && existing.sharesCents.length === sharesCents.length && existing.sharesCents.every((value, index) => value === sharesCents[index]);
      return { next: current, result: existing.sent === true && !existing.refunded && existing.totalCents === cents && sameShares };
    }
    if (current.balanceCents < cents) return null;
    const packet: PacketOperation = { id: operationId, claimed: [], refunded: false, sent: true, sharesCents: [...sharesCents], totalCents: cents, slots: {} };
    const transaction = makeTransaction({ type: 'redpacket_send', amount: -cents / 100, desc: desc || '发出红包' });
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents - cents,
        transactions: [transaction, ...current.transactions].slice(0, 200),
        packets: [packet, ...current.packets.filter(entry => entry.id !== operationId)].slice(0, 500),
      },
      result: true,
    };
  });
  return result === true;
}

/** Reserve a unique share for an NPC on a packet sent by this wallet. */
export function walletRegisterRedPacketClaim(packetId: string, claimId: string, slotIndex: number): boolean {
  if (!packetId || !claimId || !Number.isInteger(slotIndex) || slotIndex < 0) return false;
  const result = commitWalletLedger(current => {
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
      next: { ...current, packets: [nextPacket, ...current.packets.filter(entry => entry.id !== packetId)].slice(0, 500) },
      result: true,
    };
  });
  return result === true;
}

/** Claiming an incoming packet credits balance and records the claim in one commit. */
export function walletClaimRedPacket(packetId: string, claimId: string, amount: number, from: string, slotIndex?: number, sharesCents?: number[]): boolean {
  if (!packetId || !claimId || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(slotIndex) || (slotIndex as number) < 0) return false;
  if (!Array.isArray(sharesCents) || !sharesCents.length || sharesCents.some(value => !Number.isInteger(value) || value <= 0)) return false;
  const cents = Math.round(amount * 100);
  const slot = slotIndex as number;
  if (cents <= 0 || slot >= sharesCents.length || sharesCents[slot] !== cents) return false;
  const result = commitWalletLedger(current => {
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
        transactions: [transaction, ...current.transactions].slice(0, 200),
        packets: [nextPacket, ...current.packets.filter(entry => entry.id !== packetId)].slice(0, 500),
      },
      result: true,
    };
  });
  return result === true;
}

/** Only the original sender may refund; refund amount is derived from the stored share table. */
export function walletRefundRedPacket(packetId: string, _amount: number, desc = '未领取红包退回', legacySharesCents?: number[], claimedSlots: number[] = []): boolean {
  if (!packetId) return false;
  const validLegacyShares = Array.isArray(legacySharesCents) && legacySharesCents.length > 0 && legacySharesCents.every(value => Number.isInteger(value) && value > 0)
    ? legacySharesCents
    : null;
  const result = commitWalletLedger(current => {
    const existing = findPacket(current, packetId);
    // Older app versions deducted the balance without registering the packet ID.
    // The caller only reaches this path for an expired message sent by the user.
    const packet: PacketOperation | undefined = existing || (validLegacyShares
      ? { id: packetId, claimed: [], refunded: false, sent: true, sharesCents: [...validLegacyShares], totalCents: validLegacyShares.reduce((sum, value) => sum + value, 0), slots: {} }
      : undefined);
    if (!packet?.sent) return null;
    if (packet.refunded) return { next: current, result: true };
    const shares = packet.sharesCents || (validLegacyShares && {
      shares: [...validLegacyShares],
      total: validLegacyShares.reduce((sum, value) => sum + value, 0),
    });
    const fixedShares = Array.isArray(shares) ? shares : shares?.shares;
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
      ? [makeTransaction({ type: 'redpacket_send', amount: refundCents / 100, desc }), ...current.transactions].slice(0, 200)
      : current.transactions;
    return {
      next: {
        ...current,
        balanceCents: current.balanceCents + refundCents,
        transactions,
        packets: [updated, ...current.packets.filter(entry => entry.id !== packetId)].slice(0, 500),
      },
      result: true,
    };
  });
  return result === true;
}

export function walletGrabRedPacket(amount: number, from: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  addWalletTransaction({ type: 'redpacket_grab', amount, desc: `抢到${from}的红包`, counterparty: from });
}

export function walletTopup(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  addWalletTransaction({ type: 'topup', amount: Math.round(amount * 100) / 100, desc: '钱包充值' });
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

const FAMILY_KEY = 'line:wallet-family-cards';

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
  const stored = readPersistentState<FamilyCard[]>(FAMILY_KEY, []);
  const normalized = normalizeFamilyCardsForMonth(stored, currentFamilyCardMonth());
  if (normalized.some((card, index) => card.monthKey !== stored[index]?.monthKey || card.spentThisMonth !== stored[index]?.spentThisMonth)) {
    writeWalletState(FAMILY_KEY, normalized);
  }
  return normalized;
}

export function addFamilyCard(holderName: string, monthlyLimit: number, holderAvatar?: string): FamilyCard {
  const card: FamilyCard = {
    id: 'fc-' + Date.now().toString(36),
    holderName,
    holderAvatar,
    monthlyLimit,
    spentThisMonth: 0,
    monthKey: currentFamilyCardMonth(),
    createdAt: new Date().toISOString(),
  };
  const list = getFamilyCards();
  writeWalletState(FAMILY_KEY, [...list, card]);
  window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
  return card;
}

export function removeFamilyCard(id: string): void {
  writeWalletState(FAMILY_KEY, getFamilyCards().filter(c => c.id !== id));
  window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
}

// 亲情卡消费：把给持卡人的钱计入月限额（发红包/转账时调用）
// 没有亲情卡 → 返回 true（不限制）；超限额 → 返回 false（仍然记录，显示为超支）
export function spendFamilyCard(holderName: string, amount: number): boolean {
  if (!holderName || !(amount > 0)) return true;
  const list = getFamilyCards();
  const idx = list.findIndex(c => c.holderName === holderName);
  if (idx < 0) return true;
  const card = list[idx];
  const spent = Math.round((card.spentThisMonth + amount) * 100) / 100;
  const next = [...list];
  next[idx] = { ...card, spentThisMonth: spent };
  writeWalletState(FAMILY_KEY, next);
  window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
  return spent <= card.monthlyLimit;
}

// 自定义金额充值
export function walletTopupCustom(amount: number): void {
  if (amount <= 0 || !isFinite(amount)) return;
  walletTopup(Math.round(amount * 100) / 100);
}
