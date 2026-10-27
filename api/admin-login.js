import { createClient } from '@supabase/supabase-js';
import { verifyAdminPassword, adminIdentity } from '../server/admin-auth.js';

const attempts=new Map();
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'});}
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Invalid request origin.'});}catch{return res.status(403).json({error:'Invalid request origin.'});}}
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
  const now=Date.now();for(const [key,entry]of attempts)if(now-entry.start>600000)attempts.delete(key);
  const entry=attempts.get(ip)||{start:now,count:0};entry.count++;attempts.set(ip,entry);
  if(entry.count>10)return res.status(429).json({error:'Too many attempts. Try again in ten minutes.'});
  const {VITE_SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:secret,ADMIN_USERNAME:username,ADMIN_PASSWORD_HASH:hash}=process.env;
  if(!url||!secret||!username||!hash)return res.status(503).json({error:'Admin login setup is incomplete. Connect the server key and database first.'});
  try {
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(body?.username!==username||!await verifyAdminPassword(body?.password,hash))return res.status(401).json({error:'Invalid username or password.'});
    const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    // No account is created until database setup exists and credentials match.
    const schema=await db.from('site_admins').select('user_id').limit(0);
    if(schema.error)return res.status(503).json({error:'Run the database setup SQL before signing in.'});
    const email=adminIdentity(username);
    const created=await db.auth.admin.createUser({email,password:body.password,email_confirm:true,user_metadata:{username}});
    if(created.error&&!['email_exists','user_already_exists'].includes(created.error.code))throw created.error;
    const auth=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await auth.auth.signInWithPassword({email,password:body.password});
    if(signed.error||!signed.data.session)throw signed.error||Error('Login failed');
    const allowed=await db.from('site_admins').upsert({user_id:signed.data.user.id},{onConflict:'user_id'});
    if(allowed.error)throw allowed.error;
    attempts.delete(ip);
    return res.status(200).json({access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token});
  }catch{return res.status(401).json({error:'Could not sign in. Check the account and database setup.'});}
}
