import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * A header is authoritative only if it was appended by the last trusted reverse proxy.
 * Traverse from the socket peer towards the left, stopping at the first untrusted IP.
 * Ignore every client-supplied address to the left of that boundary.
 * Invalid chain components fail closed to the socket peer (no attacker-chosen bucket).
 */
export function canonicalIp(input: string): string | null {
 const raw=input.trim();
 if (!raw || raw.length>64 || raw.includes('%') || raw.includes('[') || raw.includes(']'))return null;
 if(isIP(raw)===4)return raw.split('.').map(x=>String(Number(x))).join('.');
 if(isIP(raw)===6){const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(raw);if(mapped&&isIP(mapped[1])===4)return mapped[1];return raw.toLowerCase();}
 return null;
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
