import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTenantContext } from '../lib/tenant-context.ts';

test('preserves the selected company even when it is not the first membership', () => {
  const a = { id: 'A', is_active: false }, b = { id: 'B', is_active: true };
  assert.equal(resolveTenantContext([a, b]), b);
  assert.equal(resolveTenantContext([b, a]), b);
});
test('multiple companies without a selection require an explicit choice', () => {
  assert.equal(resolveTenantContext([{ id: 'A', is_active: null }, { id: 'B', is_active: null }]), null);
});
test('a sole membership can be selected without ambiguity', () => {
  const a = { id: 'A', is_active: false };
  assert.equal(resolveTenantContext([a]), a);
});
test('no membership or inconsistent multiple active companies fails closed', () => {
  assert.equal(resolveTenantContext([]), null);
  assert.equal(resolveTenantContext([{ is_active: true }, { is_active: true }]), null);
});
