import { readPersistentState } from './usePersistentState';

function writeWalletState<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export interface WalletTransaction {
  id: string;
  type: 'redpacket_send' | 'redpacket_grab' | 'topup' | 'transfer';
  amount: number; // 正数=收入，负数=支出
  desc: string;
  counterparty?: string; // 对方名字
  createdAt: string;
}

const BALANCE_KEY = 'line:wallet-balance';
const TX_KEY = 'line:wallet-transactions';

export function getWalletBalance(): number {
  return readPersistentState<number>(BALANCE_KEY, 0);
}

export function setWalletBalance(amount: number): void {
  writeWalletState(BALANCE_KEY, Math.max(0, Math.round(amount * 100) / 100));
}

export function getWalletTransactions(): WalletTransaction[] {
  return readPersistentState<WalletTransaction[]>(TX_KEY, []);
}

export function addWalletTransaction(tx: Omit<WalletTransaction, 'id' | 'createdAt'>): WalletTransaction {
  const full: WalletTransaction = {
    ...tx,
    id: 'tx-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  };
  const list = getWalletTransactions();
  writeWalletState(TX_KEY, [full, ...list].slice(0, 200));
  // 同步更新余额
  setWalletBalance(getWalletBalance() + tx.amount);
  window.dispatchEvent(new CustomEvent('sane333:wallet-updated'));
  return full;
}

// 转账结算采用独立追加式状态，保留既有余额、亲情卡及历史流水。
type TransferSettlement = { id: string; status: 'sent' | 'accepted' | 'refunded'; amount: number; counterparty: string; updatedAt: string };
const TRANSFER_SETTLEMENT_KEY = 'line:wallet-transfer-settlements';
function getTransferSettlements(): TransferSettlement[] { return readPersistentState<TransferSettlement[]>(TRANSFER_SETTLEMENT_KEY, []); }
function saveTransferSettlement(item: TransferSettlement): void {
  const all = getTransferSettlements();
  writeWalletState(TRANSFER_SETTLEMENT_KEY, [item, ...all.filter(entry => entry.id !== item.id)].slice(0, 500));
}
export function walletSendTransfer(amount: number, counterparty: string, desc = '', operationId?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0 || !operationId) return false;
  const cents = Math.round(amount * 100);
  if (cents <= 0) return false;
  const existing = getTransferSettlements().find(entry => entry.id === operationId);
  if (existing) return existing.status !== 'refunded';
  if (Math.round(getWalletBalance() * 100) < cents) return false;
  const normalizedAmount = cents / 100;
  addWalletTransaction({ type: 'transfer', amount: -normalizedAmount, desc: desc || '转账支出', counterparty: counterparty || undefined });
  saveTransferSettlement({ id: operationId, status: 'sent', amount: normalizedAmount, counterparty, updatedAt: new Date().toISOString() });
  return true;
}
export function walletSettleTransfer(operationId: string, decision: 'accepted' | 'rejected'): boolean {
  const item = getTransferSettlements().find(entry => entry.id === operationId);
  if (!item || item.status !== 'sent') return false;
  if (decision === 'rejected') {
    addWalletTransaction({ type: 'transfer', amount: item.amount, desc: '转账拒收退款', counterparty: item.counterparty });
    saveTransferSettlement({ ...item, status: 'refunded', updatedAt: new Date().toISOString() });
  } else saveTransferSettlement({ ...item, status: 'accepted', updatedAt: new Date().toISOString() });
  return true;
}

export function walletSendRedPacket(totalAmount: number, desc: string, operationId?: string): boolean {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return false;
  const cents = Math.round(totalAmount * 100);
  if (cents <= 0) return false;
  const amount = cents / 100;
  const ops = getPacketOperations();
  if (operationId) {
    const existing = ops.find(item => item.id === operationId);
    if (existing) return existing.sent === true && !existing.refunded;
  }
  if (Math.round(getWalletBalance() * 100) < cents) return false;
  addWalletTransaction({ type: 'redpacket_send', amount: -amount, desc: desc || '发出红包' });
  if (operationId) {
    const existing = ops.find(item => item.id === operationId);
    savePacketOperation({ ...(existing || { id: operationId, claimed: [], refunded: false }), sent: true });
  }
  return true;
}

// 红包领取和退款用消息 ID + 领取者 ID 做幂等保护。
type PacketOperation = { id: string; claimed: string[]; refunded: boolean; sent?: boolean };
const PACKET_OPERATION_KEY = 'line:wallet-redpacket-operations';
function getPacketOperations(): PacketOperation[] { return readPersistentState<PacketOperation[]>(PACKET_OPERATION_KEY, []); }
function savePacketOperation(item: PacketOperation): void {
  const all = getPacketOperations();
  writeWalletState(PACKET_OPERATION_KEY, [item, ...all.filter(x => x.id !== item.id)].slice(0, 500));
}
export function walletClaimRedPacket(packetId: string, claimId: string, amount: number, from: string): boolean {
  if (!packetId || !claimId || !Number.isFinite(amount) || amount <= 0) return false;
  const ops = getPacketOperations();
  const op = ops.find(x => x.id === packetId) || { id: packetId, claimed: [], refunded: false };
  if (op.refunded || op.claimed.includes(claimId)) return false;
  const cents = Math.round(amount * 100);
  if (cents <= 0) return false;
  addWalletTransaction({ type: 'redpacket_grab', amount: cents / 100, desc: `抢到${from}的红包`, counterparty: from });
  savePacketOperation({ ...op, claimed: [...op.claimed, claimId] });
  return true;
}
export function walletRefundRedPacket(packetId: string, amount: number, desc = '未领取红包退回'): boolean {
  if (!packetId || !Number.isFinite(amount) || amount <= 0) return false;
  const ops = getPacketOperations();
  const op = ops.find(x => x.id === packetId) || { id: packetId, claimed: [], refunded: false };
  if (op.refunded) return false;
  const cents = Math.round(amount * 100);
  if (cents <= 0) return false;
  addWalletTransaction({ type: 'redpacket_send', amount: cents / 100, desc });
  savePacketOperation({ ...op, refunded: true });
  return true;
}
export function walletGrabRedPacket(amount: number, from: string): void {
  addWalletTransaction({ type: 'redpacket_grab', amount, desc: `抢到${from}的红包`, counterparty: from });
}

// 充值（虚拟）
export function walletTopup(amount: number): void {
  addWalletTransaction({
    type: 'topup',
    amount,
    desc: '钱包充值',
  });
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
}

const FAMILY_KEY = 'line:wallet-family-cards';

export function getFamilyCards(): FamilyCard[] {
  return readPersistentState<FamilyCard[]>(FAMILY_KEY, []);
}

export function addFamilyCard(holderName: string, monthlyLimit: number, holderAvatar?: string): FamilyCard {
  const card: FamilyCard = {
    id: 'fc-' + Date.now().toString(36),
    holderName,
    holderAvatar,
    monthlyLimit,
    spentThisMonth: 0,
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
