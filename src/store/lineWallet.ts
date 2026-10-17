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

// 发红包：扣钱
export function walletSendRedPacket(totalAmount: number, desc: string): boolean {
  const balance = getWalletBalance();
  if (balance < totalAmount) return false;
  addWalletTransaction({
    type: 'redpacket_send',
    amount: -totalAmount,
    desc: desc || '发出红包',
  });
  return true;
}

// 抢红包：加钱
export function walletGrabRedPacket(amount: number, from: string): void {
  addWalletTransaction({
    type: 'redpacket_grab',
    amount,
    desc: `抢到${from}的红包`,
    counterparty: from,
  });
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
