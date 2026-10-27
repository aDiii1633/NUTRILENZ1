import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,scryptSync } from 'node:crypto';
import { adminIdentity,verifyAdminPassword } from '../server/admin-auth.js';
import handler from '../api/admin-login.js';
test('server admin credentials reject incorrect passwords and malformed hashes',async()=>{
  const salt=randomBytes(16),hash=`scrypt:${salt.toString('hex')}:${scryptSync('test-only-password',salt,64).toString('hex')}`;
  assert.equal(await verifyAdminPassword('test-only-password',hash),true);
  assert.equal(await verifyAdminPassword('wrong-password',hash),false);
  assert.equal(await verifyAdminPassword('test-only-password','broken'),false);
  assert.equal(adminIdentity('test-admin'),'test-admin@admin.nutrilenz.in');
  assert.throws(()=>adminIdentity('attacker@example.com'));
});
test('admin login cannot bypass missing backend configuration',async()=>{
  const old=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try{let status,body;const res={setHeader(){},status(n){status=n;return this;},json(value){body=value;}};
    await handler({method:'POST',headers:{},body:{username:'somebody',password:'test-only-password'}},res);
    assert.equal(status,503);assert.match(body.error,/incomplete/);
  }finally{if(old!==undefined)process.env.SUPABASE_SERVICE_ROLE_KEY=old;}
});
test('admin login rejects requests originating from another website',async()=>{
  let status;const res={setHeader(){},status(n){status=n;return this;},json(){}};
  await handler({method:'POST',headers:{host:'www.nutrilenz.in',origin:'https://unrelated.example'},body:{}},res);
  assert.equal(status,403);
});
