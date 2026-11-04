import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * A header is authoritative only if it was appended by the last trusted reverse proxy.
 * Traverse from the socket peer towards the left, stopping at the first untrusted IP.
 * Ignore every client-supplied address to the left of that boundary.
 * Invalid chain components fail closed to the socket peer (no attacker-chosen bucket).
 *
 * Canonical output: IPv4 dotted decimal or 32 lower-case hexadecimal characters
 * representing the 128-bit IPv6 address (except IPv4-mapped addresses, which
 * reduce to IPv4). This stable identity is used for HMAC-keyed IP quotas.
 */
export function canonicalIp(input: string): string | null {
 const raw=input.trim();
 if (!raw || raw.length>64 || raw.includes('%') || raw.includes('[') || raw.includes(']'))return null;
 if(isIP(raw)===4)return raw.split('.').map(x=>String(Number(x))).join('.');
 if(isIP(raw)!==6)return null;
 const pieces=raw.toLowerCase().split(':');
 const ipv4Tail=pieces[pieces.length-1];
 let normalized=raw.toLowerCase();
 if(isIP(ipv4Tail)===4){
  const bytes=ipv4Tail.split('.').map(Number);
  const tail=((bytes[0]<<8)|bytes[1]).toString(16)+':'+((bytes[2]<<8)|bytes[3]).toString(16);
  normalized=normalized.slice(0,-ipv4Tail.length)+tail;
 }
 const marker=normalized.indexOf('::');
 if(marker!==-1 && normalized.indexOf('::',marker+2)!==-1)return null;
 const left=marker===-1?normalized.split(':'):normalized.slice(0,marker).split(':').filter(Boolean);
 const right=marker===-1?[]:normalized.slice(marker+2).split(':').filter(Boolean);
 const missing=8-left.length-right.length;
 if((marker===-1&&missing!==0)||(marker!==-1&&missing<1))return null;
 const fields=[...left,...Array(marker===-1?0:missing).fill('0'),...right];
 if(fields.length!==8||fields.some(x=>!/^[0-9a-f]{1,4}$/.test(x)))return null;
 const values=fields.map(x=>parseInt(x,16));
 // IPv4-mapped IPv6 should share the same quota as an IPv4 transport peer.
 if(values.slice(0,5).every(x=>x===0)&&values[5]===0xffff) {
  const v4=[values[6]>>8,values[6]&255,values[7]>>8,values[7]&255].join('.');
  return isIP(v4)===4?v4:null;
 }
 return values.map(x=>x.toString(16).padStart(4,'0')).join('');
}
export function clientIp(req: Request, trustedProxies: readonly string[] = []): string {
 const remote=canonicalIp(req.socket.remoteAddress??'')??'unknown';
 const trusted=new Set(trustedProxies.map(canonicalIp).filter((x):x is string=>x!==null));
 if(!trusted.has(remote))return remote;
 const header=req.headers['x-forwarded-for'];
 if(typeof header!=='string'||header.length>1024)return remote;
 const hops=header.split(',');if(hops.length>32)return remote;
 let last=remote;
 for(let n=hops.length-1;n>=0;n--){
  if(!trusted.has(last))break;
  const ip=canonicalIp(hops[n]);if(!ip)return remote;
  last=ip;
 }
 return last;
}
