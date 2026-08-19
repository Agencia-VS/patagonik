import { mkdirSync, writeFileSync } from 'node:fs';

const url = (process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY.');
const headers = { apikey:key, Accept:'application/json' };
if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
const response = await fetch(`${url}/rest/v1/landing_published_manifest?select=*`, { headers });
if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
const manifest = await response.json();
mkdirSync('backups', { recursive:true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = `backups/landing-manifest-${stamp}.json`;
writeFileSync(path, JSON.stringify({ exportedAt:new Date().toISOString(), manifest }, null, 2) + '\n');
console.log(path);
