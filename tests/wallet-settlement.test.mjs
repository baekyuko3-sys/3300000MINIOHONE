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

test('transfer debit, transaction and pending settlement commit together', () => {
  setWalletBalance(100);
  assert.equal(walletSendTransfer(25.50, '角色', '晚餐', 'transfer-1'), true);
  assert.equal(getWalletBalance(), 74.50);
  assert.equal(getWalletTransactions().length, 1);
  assert.equal(getWalletTransactions()[0].amount, -25.50);
  assert.equal(walletSendTransfer(25.50, '角色', '晚餐', 'transfer-1'), true);
  assert.equal(getWalletBalance(), 74.50);
  assert.equal(getWalletTransactions().length, 1);
});

test('transfer cannot overspend and rejected transfer refunds exactly once', () => {
  setWalletBalance(20);
  assert.equal(walletSendTransfer(21, '角色', '', 'transfer-low'), false);
  assert.equal(getWalletBalance(), 20);
  assert.equal(walletSendTransfer(12, '角色', '', 'transfer-2'), true);
  assert.equal(walletSettleTransfer('transfer-2', 'rejected'), true);
  assert.equal(walletSettleTransfer('transfer-2', 'rejected'), true);
  assert.equal(getWalletBalance(), 20);
  assert.equal(getWalletTransactions().length, 2);
});

test('accepted transfer does not refund and cannot be changed to rejected', () => {
  setWalletBalance(30);
  assert.equal(walletSendTransfer(10, '角色', '', 'transfer-3'), true);
  assert.equal(walletSettleTransfer('transfer-3', 'accepted'), true);
  assert.equal(walletSettleTransfer('transfer-3', 'rejected'), false);
  assert.equal(getWalletBalance(), 20);
  assert.equal(getWalletTransactions().length, 1);
});

test('red packet debit stores fixed shares and duplicate send does not debit again', () => {
  setWalletBalance(50);
  assert.equal(walletSendRedPacket(10, '祝福', 'packet-1', [200, 300, 500]), true);
  assert.equal(walletSendRedPacket(10, '祝福', 'packet-1', [200, 300, 500]), true);
  assert.equal(getWalletBalance(), 40);
  assert.equal(getWalletTransactions().length, 1);
  assert.equal(walletSendRedPacket(10, '祝福', 'packet-invalid', [200, 300]), false);
  assert.equal(getWalletBalance(), 40);
});

test('NPC reservations are unique on sent packets; incoming claims credit once at the fixed share value', () => {
  setWalletBalance(3);
  assert.equal(walletSendRedPacket(3, '红包', 'sent-1', [100, 200]), true);
  assert.equal(walletRegisterRedPacketClaim('sent-1', 'npc:a', 0), true);
  assert.equal(walletRegisterRedPacketClaim('sent-1', 'npc:b', 0), false);
  assert.equal(walletClaimRedPacket('sent-1', 'me', 2, '我', 1, [100, 200]), false);

  assert.equal(walletClaimRedPacket('incoming-1', 'me', 2.5, '朋友', 1, [100, 250]), true);
  assert.equal(walletClaimRedPacket('incoming-1', 'me', 2.5, '朋友', 1, [100, 250]), false);
  assert.equal(walletClaimRedPacket('incoming-2', 'me', 9, '朋友', 0, [100, 250]), false);
  assert.equal(getWalletBalance(), 2.5);
  assert.equal(getWalletTransactions().length, 2);
});

test('sender cannot claim own packet; refund is capped by unclaimed stored shares and idempotent', () => {
  setWalletBalance(20);
  assert.equal(walletSendRedPacket(6, '红包', 'packet-2', [100, 200, 300]), true);
  assert.equal(walletClaimRedPacket('packet-2', 'me', 1, '我', 0), false);
  assert.equal(walletRegisterRedPacketClaim('packet-2', 'npc:a', 0), true);
  assert.equal(walletRefundRedPacket('packet-2', 999, '退回', [999999], []), true);
  assert.equal(walletRefundRedPacket('packet-2', 999, '重复退款'), true);
  assert.equal(getWalletBalance(), 17);
  assert.equal(getWalletTransactions().length, 2);
  assert.equal(getWalletTransactions()[0].amount, 5);
});

test('received packet cannot be refunded by this wallet', () => {
  setWalletBalance(4);
  assert.equal(walletRefundRedPacket('incoming-2', 50), false);
  assert.equal(getWalletBalance(), 4);
  assert.equal(getWalletTransactions().length, 0);
});

test('storage write failure leaves balance and ledger unchanged', () => {
  const values = installStorage();
  setWalletBalance(10);
  const before = getWalletBalance();
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('quota exceeded'); };
  assert.equal(walletSendTransfer(5, '角色', '', 'transfer-storage-fail'), false);
  window.localStorage.setItem = original;
  assert.equal(getWalletBalance(), before);
  assert.equal(getWalletTransactions().length, 0);
  assert.ok(values.has('line:wallet-ledger-v1'));
});
