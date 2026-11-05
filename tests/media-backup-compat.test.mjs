import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackupMediaSection } from '../src/store/mediaVault.ts';

test('legacy backups without a media field preserve the current media vault', () => {
  assert.equal(validateBackupMediaSection(undefined, false), null);
});

test('an explicit empty media section means replace the vault with an empty vault', () => {
  assert.deepEqual(validateBackupMediaSection({}, true), {});
});

test('backup media section validates every media record before restore', () => {
  assert.deepEqual(
    validateBackupMediaSection({ avatar: 'data:image/png;base64,AAAA' }, true),
    { avatar: 'data:image/png;base64,AAAA' },
  );
  assert.throws(() => validateBackupMediaSection({ avatar: 'not-a-data-url' }, true), /媒体文件格式无效/);
  assert.throws(() => validateBackupMediaSection([], true), /备份媒体区格式错误/);
});
