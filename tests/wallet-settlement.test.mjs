import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getWalletBalance,
  getWalletTransactions,
  setWalletBalance,
  walletSendTransfer,
  walletSettleTransfer,
  walletSendRedPacket,
  walletRegisterRedPacketClaim,
  walletClaimRedPacket,
  walletRefundRedPacket,
  addFamilyCard,
  getFamilyCards,
} from '../src/store/lineWallet.ts';

function installStorage() {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
    dispatchEvent() { return true; },
  };
  return values;
}

beforeEach(() => {
  installStorage();
});

test('transfer debit, transaction and pending settlement commit together', async () => {
  await setWalletBalance(100);
  assert.equal(await walletSendTransfer(25.50, '角色', '晚餐', 'transfer-1'), true);
  assert.equal(getWalletBalance(), 74.50);
  assert.equal(getWalletTransactions().length, 1);
  assert.equal(getWalletTransactions()[0].amount, -25.50);
  assert.equal(await walletSendTransfer(25.50, '角色', '晚餐', 'transfer-1'), true);
  assert.equal(getWalletBalance(), 74.50);
  assert.equal(getWalletTransactions().length, 1);
});

test('transfer cannot overspend and rejected transfer refunds exactly once', async () => {
  await setWalletBalance(20);
  assert.equal(await walletSendTransfer(21, '角色', '', 'transfer-low'), false);
  assert.equal(getWalletBalance(), 20);
  assert.equal(await walletSendTransfer(12, '角色', '', 'transfer-2'), true);
  assert.equal(await walletSettleTransfer('transfer-2', 'rejected'), true);
  assert.equal(await walletSettleTransfer('transfer-2', 'rejected'), true);
  assert.equal(getWalletBalance(), 20);
  assert.equal(getWalletTransactions().length, 2);
});

test('accepted transfer does not refund and cannot be changed to rejected', async () => {
  await setWalletBalance(30);
  assert.equal(await walletSendTransfer(10, '角色', '', 'transfer-3'), true);
  assert.equal(await walletSettleTransfer('transfer-3', 'accepted'), true);
  assert.equal(await walletSettleTransfer('transfer-3', 'rejected'), false);
  assert.equal(getWalletBalance(), 20);
  assert.equal(getWalletTransactions().length, 1);
});

test('red packet debit stores fixed shares and duplicate send does not debit again', async () => {
  await setWalletBalance(50);
  assert.equal(await walletSendRedPacket(10, '祝福', 'packet-1', [200, 300, 500]), true);
  assert.equal(await walletSendRedPacket(10, '祝福', 'packet-1', [200, 300, 500]), true);
  assert.equal(await walletSendRedPacket(10, '祝福', 'packet-1', [100, 300, 600]), false);
  assert.equal(getWalletBalance(), 40);
  assert.equal(getWalletTransactions().length, 1);
  assert.equal(await walletSendRedPacket(10, '祝福', 'packet-invalid', [200, 300]), false);
  assert.equal(getWalletBalance(), 40);
});

test('NPC reservations are unique on sent packets; incoming claims credit once at the fixed share value', async () => {
  await setWalletBalance(3);
  assert.equal(await walletSendRedPacket(3, '红包', 'sent-1', [100, 200]), true);
  assert.equal(await walletRegisterRedPacketClaim('sent-1', 'npc:a', 0), true);
  assert.equal(await walletRegisterRedPacketClaim('sent-1', 'npc:b', 0), false);
  assert.equal(await walletClaimRedPacket('sent-1', 'me', 2, '我', 1, [100, 200], 3), false);

  assert.equal(await walletClaimRedPacket('incoming-1', 'me', 2.5, '朋友', 1, [100, 250], 3.5), true);
  assert.equal(await walletClaimRedPacket('incoming-1', 'me', 2.5, '朋友', 1, [100, 250], 3.5), false);
  assert.equal(await walletClaimRedPacket('incoming-2', 'me', 1, '朋友', 0, [100, 250], 9), false);
  assert.equal(getWalletBalance(), 2.5);
  assert.equal(getWalletTransactions().length, 2);
});

test('sender cannot claim own packet; refund is capped by unclaimed stored shares and idempotent', async () => {
  await setWalletBalance(20);
  assert.equal(await walletSendRedPacket(6, '红包', 'packet-2', [100, 200, 300]), true);
  assert.equal(await walletClaimRedPacket('packet-2', 'me', 1, '我', 0), false);
  assert.equal(await walletRegisterRedPacketClaim('packet-2', 'npc:a', 0), true);
  assert.equal(await walletRefundRedPacket('packet-2', 999, '退回', [999999], []), true);
  assert.equal(await walletRefundRedPacket('packet-2', 999, '重复退款'), true);
  assert.equal(getWalletBalance(), 19);
  assert.equal(getWalletTransactions().length, 2);
  assert.equal(getWalletTransactions()[0].amount, 5);
});

test('legacy sent packet without an operation record can refund only unclaimed fixed shares', async () => {
  const values = installStorage();
  // Legacy app state: packet debit already happened, but no packet operation ID was stored.
  values.set('line:wallet-balance', JSON.stringify(14));
  values.set('line:wallet-transactions', JSON.stringify([{
    id: 'legacy-send', type: 'redpacket_send', amount: -6, desc: '旧红包', createdAt: '2026-10-01T00:00:00.000Z',
  }]));
  assert.equal(await walletRefundRedPacket('legacy-packet', 5, '旧红包退回', [100, 200, 300], [0]), true);
  assert.equal(await walletRefundRedPacket('legacy-packet', 5, '重复退回', [100, 200, 300], [0]), true);
  assert.equal(getWalletBalance(), 19);
  assert.equal(getWalletTransactions().length, 2);
  assert.equal(getWalletTransactions()[0].amount, 5);
});

test('received or unbacked packet cannot be refunded by this wallet', async () => {
  await setWalletBalance(4);
  assert.equal(await walletRefundRedPacket('incoming-2', 50, '退款', [5000], []), false);
  assert.equal(getWalletBalance(), 4);
  assert.equal(getWalletTransactions().length, 0);
});

test('storage write failure leaves balance and ledger unchanged', async () => {
  const values = installStorage();
  await setWalletBalance(10);
  const before = getWalletBalance();
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  assert.equal(await walletSendTransfer(5, '角色', '', 'transfer-storage-fail'), false);
  window.localStorage.setItem = original;
  assert.equal(getWalletBalance(), before);
  assert.equal(getWalletTransactions().length, 0);
  assert.ok(values.has('line:wallet-ledger-v1'));
});

test('parallel wallet operations serialize and family card spend commits with transfer', async () => {
  await setWalletBalance(10);
  const card = await addFamilyCard('角色', 5);
  assert.ok(card);
  const outcomes = await Promise.all([
    walletSendTransfer(7, '角色', '', 'parallel-a', '角色'),
    walletSendTransfer(7, '角色', '', 'parallel-b', '角色'),
  ]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(getWalletBalance(), 3);
  assert.equal(getFamilyCards()[0].spentThisMonth, 7);
  assert.equal(getWalletTransactions().filter(tx => tx.type === 'transfer').length, 1);
});
