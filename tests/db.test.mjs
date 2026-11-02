// Database smoke test: loads the migration into an in-memory Postgres (PGlite),
// mocks the Supabase auth schema and walks through the admin / teacher / student flows.
// Run: npm run test:db   (each line prints the result or the expected error)
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'fs';
const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on all functions in schema auth to authenticated, anon;
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url),'utf8'));
await db.exec(`grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.profiles from authenticated; grant update (full_name) on public.profiles to authenticated;`);
const U = { admin:'00000000-0000-0000-0000-00000000000a', t1:'00000000-0000-0000-0000-0000000000t1'.replace('t1','01'), t2:'00000000-0000-0000-0000-000000000002', s1:'00000000-0000-0000-0000-000000000003', s2:'00000000-0000-0000-0000-000000000004', x:'00000000-0000-0000-0000-000000000005'};
const E = { admin:'admin@upb.ro', t1:'t1@upb.ro', t2:'t2@upb.ro', s1:'s1@stud.acs.upb.ro', s2:'s2@stud.acs.upb.ro', x:'x@gmail.com'};
for (const k in U) await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)`, [U[k], E[k], JSON.stringify({full_name: k.toUpperCase()})]);
await db.exec(`insert into admin_emails values ('admin@upb.ro')`);
async function as(who, sql, params=[]) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({sub:U[who], email:E[who]})]);
  await db.exec('set role authenticated');
  try { const r = await db.query(sql, params); return r.rows; }
  catch (e) { return 'ERR: ' + e.message; }
  finally { await db.exec('reset role'); }
}
const log = (l, v) => console.log(l.padEnd(42), typeof v === 'string' ? v : JSON.stringify(v).slice(0,200));
log('profiles count', (await db.query('select count(*) from profiles')).rows);
const future = new Date(Date.now()+86400e3*2); const d = future.toISOString().slice(0,10);
const end = new Date(Date.now()+86400e3*10).toISOString().slice(0,10);
const [sess] = await as('admin', `insert into sessions(title,start_date,end_date) values ('SO',$1,$2) returning id`, [d,end]);
log('admin create session', sess);
log('student create session', await as('s1', `insert into sessions(title,start_date,end_date) values ('X',$1,$2)`, [d,end]));
log('add members', await as('admin', `insert into session_members values ($1,'t1@upb.ro','teacher'),($1,'t2@upb.ro','teacher'),($1,'s1@stud.acs.upb.ro','student'),($1,'s2@stud.acs.upb.ro','student')`, [sess.id]));
log('s1 sees draft session?', await as('s1', `select id from sessions`));
const t = `${d}T08:00:00Z`;
log('t1 add slot', await as('t1', `insert into slots(session_id, starts_at) values ($1,$2) returning id, ends_at`, [sess.id, t]));
log('t1 overlap slot', await as('t1', `insert into slots(session_id, starts_at) values ($1,$2)`, [sess.id, `${d}T08:30:00Z`]));
log('t2 add slot same time', await as('t2', `insert into slots(session_id, starts_at) values ($1,$2) returning id`, [sess.id, t]));
log('s1 add slot', await as('s1', `insert into slots(session_id, starts_at) values ($1,$2)`, [sess.id, `${d}T12:00:00Z`]));
log('slot out of range', await as('t1', `insert into slots(session_id, starts_at) values ($1,'2020-01-01T08:00:00Z')`, [sess.id]));
log('subslots count', (await db.query('select count(*) from subslots')).rows);
log('s1 available while draft', await as('s1', `select count(*) from available_subslots($1)`, [sess.id]));
await as('admin', `update sessions set status='open' where id=$1`, [sess.id]);
const av = await as('s1', `select * from available_subslots($1)`, [sess.id]);
log('s1 available open', av.length + ' first ' + JSON.stringify(av[0]));
log('s1 select slots directly', await as('s1', `select * from slots`));
log('s1 select subslots directly', await as('s1', `select * from subslots`));
log('s1 book', await as('s1', `select book_subslot($1)`, [av[0].subslot_id]));
log('s2 book same', await as('s2', `select book_subslot($1)`, [av[0].subslot_id]));
log('s1 change 1', await as('s1', `select book_subslot($1)`, [av[3].subslot_id]));
log('s1 change 2', await as('s1', `select book_subslot($1)`, [av[5].subslot_id]));
log('s1 my_bookings', await as('s1', `select * from my_bookings()`));
log('s1 direct insert booking', await as('s1', `insert into bookings(session_id,student_id,subslot_id) values ($1,$2,$3)`, [sess.id, U.s1, av[7].subslot_id]));
log('s1 direct update booking', await as('s1', `update bookings set change_count=0 returning id`));
log('x (not invited) book', await as('x', `select book_subslot($1)`, [av[8].subslot_id]));
log('t1 book (teacher)', await as('t1', `select book_subslot($1)`, [av[8].subslot_id]));
log('t1 schedule booked', (await as('t1', `select student_email, teacher_email from session_schedule($1) where booking_id is not null`, [sess.id])));
log('t2 schedule booked', (await as('t2', `select student_email from session_schedule($1) where booking_id is not null`, [sess.id])));
log('t1 schedule all', await as('t1', `select count(*) from session_schedule($1, true)`, [sess.id]));
log('admin schedule all', await as('admin', `select count(*) from session_schedule($1, true)`, [sess.id]));
log('s1 profiles visible', await as('s1', `select email from profiles`));
log('s1 update profile email', await as('s1', `update profiles set email='t1@upb.ro'`));
log('s1 update profile name', await as('s1', `update profiles set full_name='Stud One' returning full_name`));
log('s1 make self admin', await as('s1', `insert into admin_emails values ('s1@stud.acs.upb.ro')`));
const s1slot = (await db.query(`select s.id from bookings b join subslots ss on ss.id=b.subslot_id join slots s on s.id=ss.slot_id`)).rows[0].id;
log('teacher delete booked slot', await as('t1', `delete from slots where id=$1`, [s1slot]));
log('t1 unpublish slot', await as('t1', `update slots set published=false where id=$1 returning published`, [s1slot]));
log('t1 move slot', await as('t1', `update slots set starts_at=starts_at+interval '1 day' where id=$1`, [s1slot]));
log('s2 available after unpublish', await as('s2', `select count(*) from available_subslots($1)`, [sess.id]));
await as('admin', `update sessions set student_access='open', allowed_domain='upb.ro' where id=$1`, [sess.id]);
log('x (gmail) open domain', await as('x', `select count(*) from available_subslots($1)`, [sess.id]));

log('admin delete session', await as('admin', `delete from sessions returning id`));
log('remaining subslots', (await db.query('select count(*) from subslots')).rows);
