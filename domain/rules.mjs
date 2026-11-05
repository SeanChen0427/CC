import { createHash } from 'node:crypto';
export * from './validation.mjs';

export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
