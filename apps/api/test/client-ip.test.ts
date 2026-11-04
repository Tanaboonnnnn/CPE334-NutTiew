import { describe,expect,it } from 'vitest';
import { clientIp,canonicalIp } from '../src/client-ip.js';
import type { Request } from 'express';
const ip=(remote:string,xff:string|undefined,trusted:string[])=>clientIp({socket:{remoteAddress:remote},headers:xff===undefined?{}:{'x-forwarded-for':xff}} as unknown as Request,trusted);
describe('trusted proxy client IP',()=>{
 it('ignores spoofed XFF from direct clients',()=>expect(ip('203.0.113.4','198.51.100.9',['127.0.0.1'])).toBe('203.0.113.4'));
 it('takes nearest untrusted hop, not forged leftmost hop',()=>expect(ip('127.0.0.1','198.51.100.8, 203.0.113.4',['127.0.0.1'])).toBe('203.0.113.4'));
 it('handles trusted multi-hop with right-to-left trust',()=>expect(ip('127.0.0.1','192.0.2.99, 203.0.113.4, 10.0.0.8',['127.0.0.1','10.0.0.8'])).toBe('203.0.113.4'));
 it('normalizes IPv4-mapped IPv6 and fails closed on malformed components',()=>{expect(canonicalIp('::ffff:127.0.0.1')).toBe('127.0.0.1');expect(ip('::ffff:127.0.0.1','not-an-ip, 203.0.113.4',['127.0.0.1'])).toBe('203.0.113.4');expect(ip('127.0.0.1','evil host',['127.0.0.1'])).toBe('127.0.0.1');});
});
