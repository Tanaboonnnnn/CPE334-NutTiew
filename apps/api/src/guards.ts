import type { Request,Response,NextFunction,RequestHandler } from 'express';
import type { Pool } from 'pg';
import { digest } from './security.js';

export type Role='Customer'|'Tutor';
export type AuthPrincipal={userId:string;role:Role;sessionId:string;csrfNonce:Buffer;csrfKeyVersion:string};
export type AuthenticationError='UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'|'SERVICE_UNAVAILABLE';
export type AuthGuardErrorHandler=(res:Response,status:number,code:AuthenticationError)=>void;
const authorized=new WeakMap<Request,AuthPrincipal>();
export function getPrincipal(req:Request):AuthPrincipal|undefined{return authorized.get(req);}

/** Every request verifies the current DB user and session; headers/body are never a principal. */
export function requireSession(pool:Pool,cookieName:string,fail:AuthGuardErrorHandler):RequestHandler {
 return async(req,res,next)=>{const raw=req.cookies?.[cookieName];if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw))return fail(res,401,'UNAUTHENTICATED');
 try{const q=await pool.query('SELECT s."id",s."userId",s."csrfNonce",s."csrfKeyVersion",u."role" FROM "Session" s JOIN "User" u ON u."id"=s."userId" WHERE s."tokenDigest"=$1 AND s."revokedAt" IS NULL AND s."expiresAt">now() AND u."isActive"=true',[digest(raw)]);
  if(q.rowCount!==1)return fail(res,401,'UNAUTHENTICATED');const row=q.rows[0];if(row.role!=='Tutor'&&row.role!=='Customer')return fail(res,403,'FORBIDDEN');authorized.set(req,{userId:row.userId,role:row.role,sessionId:row.id,csrfNonce:row.csrfNonce,csrfKeyVersion:row.csrfKeyVersion});next();
 }catch{fail(res,503,'SERVICE_UNAVAILABLE');}
 };
}
export function requireRole(role:Role,fail:AuthGuardErrorHandler):RequestHandler {
 return (req,res,next)=>{const principal=getPrincipal(req);if(!principal)return fail(res,401,'UNAUTHENTICATED');if(principal.role!==role)return fail(res,403,'FORBIDDEN');next();};
}
/**
 * Only an owner-scoped DB predicate may decide access; missing and foreign rows look identical.
 * loadOwned must query with both resource ID and principal.userId. Do not trust client-supplied owner IDs.
 */
export function requireOwnedResource<T>(loadOwned:(principal:AuthPrincipal,req:Request)=>Promise<T|null|undefined>,fail:AuthGuardErrorHandler,attach:(req:Request,value:T)=>void):RequestHandler {
 return async(req,res,next)=>{const principal=getPrincipal(req);if(!principal)return fail(res,401,'UNAUTHENTICATED');try{const value=await loadOwned(principal,req);if(value==null)return fail(res,404,'NOT_FOUND');attach(req,value);next();}catch{fail(res,503,'SERVICE_UNAVAILABLE');}};
}
