import { describe,expect,it } from 'vitest';
import { clientIp,canonicalIp } from '../src/client-ip.js';
import type { Request } from 'express';
const ip=(remote:string,xff:string|undefined,trusted:string[])=>clientIp({socket:{remoteAddress:remote},headers:xff===undefined?{}:{'x-forwarded-for':xff}} as unknown as Request,trusted);
describe('trusted proxy client IP',()=>{
 it('ignores spoofed XFF from direct clients',()=>expect(ip('203.0.113.4','198.51.100.9',['127.0.0.1'])).toBe('203.0.113.4'));
 it('takes nearest untrusted hop, not forged leftmost hop',()=>expect(ip('127.0.0.1','198.51.100.8, 203.0.113.4',['127.0.0.1'])).toBe('203.0.113.4'));
 it('handles trusted multi-hop with right-to-left trust',()=>expect(ip('127.0.0.1','192.0.2.99, 203.0.113.4, 10.0.0.8',['127.0.0.1','10.0.0.8'])).toBe('203.0.113.4'));
 it('normalizes IPv4-mapped IPv6 and fails closed on malformed components',()=>{expect(canonicalIp('::ffff:127.0.0.1')).toBe('127.0.0.1');expect(ip('::ffff:127.0.0.1','not-an-ip, 203.0.113.4',['127.0.0.1'])).toBe('203.0.113.4');expect(ip('127.0.0.1','evil host',['127.0.0.1'])).toBe('127.0.0.1');});
 it('canonicalizes all equivalent IPv6 spellings to one 128-bit identity',()=>{
  const forms=['2001:db8::1','2001:0db8:0:0:0:0:0:1','2001:DB8::0001'];
  const values=forms.map(canonicalIp);
  expect(new Set(values).size).toBe(1);
  expect(values[0]).toBe('20010db8000000000000000000000001');
  expect(new Set(forms.map(value=>ip('::1',value,['::1']))).size).toBe(1);
 });
 it('canonicalizes IPv4-mapped IPv6 including hex and IPv4 tails',()=>{
  expect(canonicalIp('::ffff:192.0.2.1')).toBe('192.0.2.1');
  expect(canonicalIp('0:0:0:0:0:ffff:c000:201')).toBe('192.0.2.1');
  expect(canonicalIp('::FFFF:C000:0201')).toBe('192.0.2.1');
  expect(ip('::1','2001:0DB8:0:0:0:0:0:1, 2001:DB8::1',['0:0:0:0:0:0:0:1','2001:db8::1'])).toBe('20010db8000000000000000000000001');
 });
 it('does not allow invalid and untrusted IPv6 forwarded hops to choose buckets',()=>{
  expect(ip('2001:db8::10','2001:db8::20',[])).toBe(canonicalIp('2001:db8::10'));
  expect(ip('::1','bad-ip',['::1'])).toBe(canonicalIp('::1'));
  expect(canonicalIp('fe80::1%eth0')).toBe(null);
  expect(canonicalIp('[2001:db8::1]')).toBe(null);
 });

});
