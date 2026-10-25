import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Postgres permissions restrict publishing and preserve revision history', async () => {
  const db = new PGlite();
  try {
    // Supabase supplies these roles and auth primitives in production.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values
        ('00000000-0000-0000-0000-000000000001','admin@example.test'),
        ('00000000-0000-0000-0000-000000000002','visitor@example.test');
    `);
    await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url),'utf8'));
    await db.exec("insert into public.site_admins values ('00000000-0000-0000-0000-000000000001')");
    await db.exec('set role anon');
    assert.equal((await db.query('select * from public.site_content')).rows.length,1);
    await assert.rejects(db.exec("update public.site_content set revision=2 where id='main'"), /permission denied/);
    await assert.rejects(db.exec('select * from public.content_history'), /permission denied/);
    await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'");
    assert.equal((await db.query('select * from public.site_admins')).rows.length,0);
    assert.equal((await db.query("update public.site_content set revision=2 where id='main' returning revision")).rows.length,0);
    await assert.rejects(db.exec("insert into public.site_admins values ('00000000-0000-0000-0000-000000000002')"), /permission denied/);
    await db.exec("set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
    assert.equal((await db.query('select * from public.site_admins')).rows.length,1);
    const saved=await db.query("update public.site_content set document=jsonb_set(document,'{settings,title}','\"Updated title\"'),revision=2 where id='main' and revision=1 returning revision,updated_by");
    assert.equal(saved.rows[0].revision,2);
    assert.equal(saved.rows[0].updated_by,'00000000-0000-0000-0000-000000000001');
    const history=(await db.query('select * from public.content_history')).rows;
    assert.equal(history.length,1); assert.equal(history[0].revision,1);
    assert.equal((await db.query("update public.site_content set revision=2 where id='main' and revision=1 returning revision")).rows.length,0);
    await assert.rejects(db.exec("update public.site_content set revision=9 where id='main'"), /Revision must increase/);
    await assert.rejects(db.exec("delete from public.site_content where id='main'"), /permission denied/);
    await assert.rejects(db.exec('delete from public.content_history'), /permission denied/);
  } finally { await db.close(); }
});
