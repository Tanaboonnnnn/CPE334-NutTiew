import { describe,expect,it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { csrf,digest,hmac,safeTokenMatch,windowStart } from '../src/security.js';
describe('auth primitives',()=>{
 it('uses fixed UTC 15 minute windows',()=>{expect(windowStart(new Date('2026-11-04T10:14:59Z')).toISOString()).toBe('2026-11-04T10:00:00.000Z');expect(windowStart(new Date('2026-11-04T10:15:00Z')).toISOString()).toBe('2026-11-04T10:15:00.000Z');});
 it('separates account and IP HMAC buckets',()=>{const key=randomBytes(32);expect(hmac(key,'account','x').equals(hmac(key,'ip','x'))).toBe(false);});
 it('generates stable session-bound CSRF MAC',()=>{const key=randomBytes(32),nonce=randomBytes(32),id='6b58c08c-07d9-4939-8a9e-711f43cebe38';const t=csrf(key,id,nonce);expect(csrf(key,id,nonce)).toBe(t);expect(safeTokenMatch(t,t)).toBe(true);expect(safeTokenMatch(t,csrf(key,'5b58c08c-07d9-4939-8a9e-711f43cebe38',nonce))).toBe(false);expect(safeTokenMatch('bad',t)).toBe(false);});
 it('hashes session tokens with SHA-256',()=>{expect(digest('secret')).toHaveLength(32);});
});
