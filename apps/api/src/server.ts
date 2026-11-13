import 'dotenv/config';
import { createPool,readKey } from './config.js';
import { createApp } from './app.js';
import { reapExpired } from './security.js';
const pool=createPool();const origin=process.env.AUTH_CANONICAL_ORIGIN;if(!origin)throw new Error('AUTH_CANONICAL_ORIGIN required');
const app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),csrfKeyVersion:process.env.AUTH_CSRF_KEY_VERSION??'v1',previousCsrfKeys:process.env.AUTH_CSRF_PREVIOUS_KEY_VERSION?{[process.env.AUTH_CSRF_PREVIOUS_KEY_VERSION]:readKey('AUTH_CSRF_PREVIOUS_HMAC_KEY')}:undefined,rateKey:readKey('AUTH_RATE_KEY'),production:process.env.NODE_ENV==='production',trustedProxies:(process.env.AUTH_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
// Cloud-ready runtime: bind 0.0.0.0 so a container/load balancer can reach the
// listener while local development still works; PORT comes from the environment.
const port=Number(process.env.PORT??3001);const server=app.listen(port,'0.0.0.0',()=>console.log('NutTiew API listening on 0.0.0.0:'+port));
const reaper=setInterval(()=>{void reapExpired(pool).catch(()=>console.error('reservation cleanup failed'));},10000);reaper.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(reaper);server.close(()=>void pool.end().then(()=>process.exit(0)));});
