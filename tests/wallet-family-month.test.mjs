import test from 'node:test';
import assert from 'node:assert/strict';
import { currentFamilyCardMonth, normalizeFamilyCardsForMonth } from '../src/store/lineWallet.ts';

test('family card monthly spend resets when the calendar month changes', () => {
  const cards = [{
    id: 'fc-1',
    holderName: '角色',
    monthlyLimit: 1000,
    spentThisMonth: 320,
    createdAt: '2026-10-01T00:00:00.000Z',
    monthKey: '2026-10',
  }];
  assert.deepEqual(normalizeFamilyCardsForMonth(cards, '2026-11'), [{
    ...cards[0],
    spentThisMonth: 0,
    monthKey: '2026-11',
  }]);
});

test('legacy family cards preserve their existing spend on first month migration', () => {
  const cards = [{
    id: 'fc-legacy',
    holderName: '角色',
    monthlyLimit: 1000,
    spentThisMonth: 320,
    createdAt: '2026-10-01T00:00:00.000Z',
  }];
  assert.deepEqual(normalizeFamilyCardsForMonth(cards, '2026-11'), [{
    ...cards[0],
    monthKey: '2026-11',
  }]);
});

test('family card month key uses the local calendar month', () => {
  assert.equal(currentFamilyCardMonth(new Date(2026, 10, 5, 12)), '2026-11');
});
