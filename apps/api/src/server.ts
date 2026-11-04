import 'dotenv/config';
import { createPool,readKey } from './config.js';
import { createApp } from './app.js';
import { reapExpired } from './security.js';
const pool=createPool();const origin=process.env.AUTH_CANONICAL_ORIGIN;if(!origin)throw new Error('AUTH_CANONICAL_ORIGIN required');
const app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:process.env.NODE_ENV==='production',trustedProxies:(process.env.AUTH_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
const port=Number(process.env.PORT??3001);const server=app.listen(port,'127.0.0.1',()=>console.log('NutTiew API localhost:'+port));
const reaper=setInterval(()=>{void reapExpired(pool).catch(()=>console.error('reservation cleanup failed'));},10000);reaper.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(reaper);server.close(()=>void pool.end().then(()=>process.exit(0)));});
