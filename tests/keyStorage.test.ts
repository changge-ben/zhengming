import test from 'node:test';
import assert from 'node:assert/strict';
import { canRememberKeys, KeyStorageError, protectKey, restoreKey } from '../server/keyStorage.ts';

test('Windows DPAPI round trips keys and rejects damaged ciphertext without exposing secrets', { skip: !canRememberKeys }, async () => {
  const secret = 'fixture-only-key-with-punctuation-$()`-你好';
  const protectedKey = await protectKey(secret);
  assert.ok(!protectedKey.includes(secret));
  assert.equal(await restoreKey(protectedKey), secret);
  await assert.rejects(restoreKey('invalid-ciphertext'), error => error instanceof KeyStorageError && !error.message.includes(secret));
});
