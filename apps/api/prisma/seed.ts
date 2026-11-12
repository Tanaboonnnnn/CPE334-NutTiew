import 'dotenv/config';
import argon2 from 'argon2';
import { createPool } from '../src/config.js';
const pool=createPool();
const email=process.env.SEED_EMAIL, password=process.env.SEED_PASSWORD, role=process.env.SEED_ROLE;
if(!email || !password || !['Customer','Tutor'].includes(role??''))throw new Error('Set SEED_EMAIL, SEED_PASSWORD and SEED_ROLE=Customer|Tutor in environment; never commit seed credentials');
if(Buffer.byteLength(password,'utf8')<12)throw new Error('Seed password must be at least 12 bytes');
try {await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) ON CONFLICT("email") DO NOTHING',[email.trim().toLowerCase(),await argon2.hash(password,{type:argon2.argon2id}),role]);console.log('Seed user ensured');}finally{await pool.end();}
