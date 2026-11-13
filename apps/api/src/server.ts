import 'dotenv/config';
import express from 'express';
import { join, resolve } from 'node:path';
import { createPool,readKey } from './config.js';
import { createApp } from './app.js';
import { reapExpired } from './security.js';
const pool=createPool();const origin=process.env.AUTH_CANONICAL_ORIGIN;if(!origin)throw new Error('AUTH_CANONICAL_ORIGIN required');
// The pg Pool emits an 'error' event when an idle client connection drops (e.g.
// during a temporary database outage). Without a listener Node exits on the
// unhandled event. Listen so the process survives; /api/ready already returns
// 503 while the DB is unreachable and 200 once connectivity returns. Only the
// error code is logged - never credentials or the full connection/driver state.
pool.on('error',(err:unknown)=>{const code=typeof err==='object'&&err!==null&&(err as {code?:string}).code?String((err as {code?:string}).code):'unknown';console.error('DB idle-connection error; /api/ready stays 503 until the database is reachable (code='+code+')');});
const app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),csrfKeyVersion:process.env.AUTH_CSRF_KEY_VERSION??'v1',previousCsrfKeys:process.env.AUTH_CSRF_PREVIOUS_KEY_VERSION?{[process.env.AUTH_CSRF_PREVIOUS_KEY_VERSION]:readKey('AUTH_CSRF_PREVIOUS_HMAC_KEY')}:undefined,rateKey:readKey('AUTH_RATE_KEY'),production:process.env.NODE_ENV==='production',trustedProxies:(process.env.AUTH_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
// Optional single-origin serving of the built React UI (GH-02 Docker). When
// WEB_DIST points at the compiled web/static directory, the same Express app
// serves the SPA at / while /api/v1/... and /api/ready keep their handlers.
// Unknown /api paths are never rewritten to index.html. Off (unset) in local
// development, where Vite serves the UI and proxies /api to this server.
const webDist=process.env.WEB_DIST;
if(webDist){
 const webRoot=resolve(webDist);
 app.use(express.static(webRoot));
 app.use((req,res,next)=>{if(req.method==='GET'&&!req.path.startsWith('/api')){res.sendFile(join(webRoot,'index.html'));return;}next();});
}
// Cloud-ready runtime: bind 0.0.0.0 so a container/load balancer can reach the
// listener while local development still works; PORT comes from the environment.
const port=Number(process.env.PORT??3001);const server=app.listen(port,'0.0.0.0',()=>console.log('NutTiew API listening on 0.0.0.0:'+port));
const reaper=setInterval(()=>{void reapExpired(pool).catch(()=>console.error('reservation cleanup failed'));},10000);reaper.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(reaper);server.close(()=>void pool.end().then(()=>process.exit(0)));});
