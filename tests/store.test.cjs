'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createStore,parseCSV,cents,DATA_KEY}=require('../web/store.js');

function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
function fixture(){const storage=memory(),session=memory();return {storage,session,store:createStore({storage,session,today:()=> '2026-10-11'})};}
async function login(store,role='admin'){return store.request('/api/login',{email:role+'@demo.pl',password:'Demo2026!'});}
function csv(values={}){const row={id:'NEW-001',date:'2026-10-01',rep_id:'r1',client:'Test',amount:'1000.50',currency:'PLN',status:'approved',kind:'sale',category:'Usługi',...values};const keys=Object.keys(row);return keys.join(',')+'\n'+keys.map(k=>'"'+String(row[k]).replace(/"/g,'""')+'"').join(',')+'\n';}

test('CSV parser handles BOM, semicolons, multiline fields and escaped quotes',()=>{
 const parsed=parseCSV('\ufeffid;client;amount\r\n1;"Firma; \"\"Nova\"\"\nRetail";"10,50"\r\n2;Test;1\r\n');
 assert.deepEqual(parsed.headers,['id','client','amount']);
 assert.equal(parsed.records[0].values[1],'Firma; "Nova"\nRetail');
 assert.equal(parsed.records[1].line,4);
 assert.throws(()=>parseCSV('a,b\n"broken,1'),/Niezamknięty/);
 assert.throws(()=>parseCSV('a,a\n1,2'),/unikalne/);
});

test('Amounts use exact integer cents, reject excess precision and invalid numbers',()=>{
 assert.equal(cents('1000.50'),100050);assert.equal(cents('-0,29'),-29);
 for(const value of ['NaN','Infinity','0.001','1e6','1000000001','abc'])assert.throws(()=>cents(value));
});

test('Local demo sessions and data filtering survive reload without network',async()=>{
 const {store,storage,session}=fixture();
 await assert.rejects(store.request('/api/data'),e=>e.status===401);
 await assert.rejects(store.request('/api/login',{email:'admin@demo.pl',password:'wrong'}),e=>e.status===401);
 await login(store,'anna');
 const data=await store.request('/api/data');
 assert.deepEqual(data.reps.map(r=>r.id),['r1']);assert(data.sales.length>0);
 assert(data.sales.every(s=>s.rep_id==='r1'));
 assert(data.goals.every(g=>g.rep_id==='r1'));
 const reloaded=createStore({storage,session,today:()=> '2026-10-11'});
 assert.equal((await reloaded.request('/api/me')).email,'anna@demo.pl');
 assert(!storage.getItem(DATA_KEY).includes('Demo2026!'));
 await reloaded.request('/api/logout');await assert.rejects(reloaded.request('/api/me'),e=>e.status===401);
});

test('Goals persist after reconstruction and manager scope is respected in demo',async()=>{
 const {store,storage,session}=fixture();await login(store,'kierownik');
 await assert.rejects(store.request('/api/goals',{rep_id:'r4',month:'2026-10',amount:'100'}),e=>e.status===403);
 await store.request('/api/goals',{rep_id:'r1',month:'2026-10',amount:'12345.67'});
 await assert.rejects(store.request('/api/goals',{rep_id:'r1',month:'2026-10',amount:'0.001'}));
 const reload=createStore({storage,session,today:()=> '2026-10-11'});
 assert.equal((await reload.request('/api/data')).goals.find(g=>g.rep_id==='r1'&&g.month==='2026-10').amount,1234567);
 assert((await reload.request('/api/audit')).some(a=>a.action==='goal'&&JSON.parse(a.detail).after===1234567));
});

test('Import preview is read-only; commit deduplicates and requires update confirmation',async()=>{
 const {store}=fixture();await login(store);
 const before=(await store.request('/api/data')).sales.length;
 const preview=await store.request('/api/import/preview',{csv:csv()});
 assert.equal(preview.valid,1);assert.deepEqual(preview.errors,[]);
 assert.equal((await store.request('/api/data')).sales.length,before);
 assert.equal((await store.request('/api/import/commit',{csv:csv()})).imported,1);
 assert.equal((await store.request('/api/import/commit',{csv:csv()})).duplicates,1);
 await assert.rejects(store.request('/api/import/commit',{csv:csv({amount:'2000'})}),e=>e.status===409);
 await store.request('/api/import/commit',{csv:csv({amount:'2000'}),confirm_updates:true});
 assert.equal((await store.request('/api/data')).sales.find(s=>s.id==='NEW-001').amount,200000);
});

test('Invalid imports stay atomic; mapping, corrections and returned amounts work',async()=>{
 const {store}=fixture();await login(store);
 for(const values of [{rep_id:'bad'},{date:'2026-02-30'},{amount:'NaN'},{amount:'1.001'},{currency:'EUR'},{status:'bad'},{kind:'return',amount:'1'},{kind:'sale',amount:'-1'}]){
  const text=csv({id:'INVALID',...values});
  assert.equal((await store.request('/api/import/preview',{csv:text})).errors.length,1);
  await assert.rejects(store.request('/api/import/commit',{csv:text}));
 }
 assert(!(await store.request('/api/data')).sales.some(s=>s.id==='INVALID'));
 const text=csv({id:'RETURN',kind:'return',amount:'-250'}).replace('rep_id','sprzedawca');
 const mapping=Object.fromEntries(parseCSV(csv()).headers.map(k=>[k,k]));mapping.rep_id='sprzedawca';
 await store.request('/api/import/commit',{csv:text,mapping});
 assert.equal((await store.request('/api/data')).sales.find(s=>s.id==='RETURN').amount,-25000);
 const duplicate=csv()+csv().split('\n')[1]+'\n';
 assert((await store.request('/api/import/preview',{csv:duplicate})).errors.some(e=>e.error.includes('Powtórzony')));
});

test('CSV export applies filters, quotes fields and escapes spreadsheet formula text',async()=>{
 const {store}=fixture();await login(store);
 await store.request('/api/import/commit',{csv:csv({client:'=1+1'})});
 const exported=await store.request('/api/export?from=2026-10-01&to=2026-10-01&rep=r1');
 const {headers,records}=parseCSV(exported);
 assert(records.length>0);assert(records.every(r=>r.values[headers.indexOf('rep_id')]==='r1'));
 assert.equal(records.find(r=>r.values[0]==='NEW-001').values[headers.indexOf('client')],"'=1+1");
 await store.request('/api/logout');await login(store,'anna');
 assert.equal(parseCSV(await store.request('/api/export?rep=r4')).records.length,0);
});

test('Local accounts can be created and disabled without exposing password fields',async()=>{
 const {store,storage}=fixture();await login(store);
 const result=await store.request('/api/users',{name:'Test',email:'test@example.pl',role:'rep',rep_id:'r2',password:'TestPassword123'});
 assert((await store.request('/api/users')).every(u=>!('password' in u)&&!('salt' in u)));
 const other=createStore({storage,session:memory(),today:()=> '2026-10-11'});
 await other.request('/api/login',{email:'test@example.pl',password:'TestPassword123'});
 assert((await other.request('/api/data')).sales.every(s=>s.rep_id==='r2'));
 await assert.rejects(other.request('/api/users'),e=>e.status===403);
 await store.request('/api/users/status',{id:result.id,active:false});
 await assert.rejects(other.request('/api/me'),e=>e.status===401);
 const own=await store.request('/api/me');await assert.rejects(store.request('/api/users/status',{id:own.id,active:false}));
});

test('Backup restore validates data, is atomic on errors and restores previous goals',async()=>{
 const {store,storage}=fixture();await login(store);
 const backup=await store.request('/api/backup');
 await store.request('/api/goals',{rep_id:'r1',month:'2026-10',amount:'99999'});
 const invalid=JSON.parse(backup);invalid.sales[0].amount=0.001;
 const before=storage.getItem(DATA_KEY);
 await assert.rejects(store.request('/api/restore',{json:JSON.stringify(invalid),confirm:true}));
 assert.equal(storage.getItem(DATA_KEY),before);
 await store.request('/api/restore',{json:backup,confirm:true});
 await assert.rejects(store.request('/api/me'),e=>e.status===401);
 await login(store);
 assert.equal((await store.request('/api/data')).goals.find(g=>g.rep_id==='r1'&&g.month==='2026-10').amount,9500000);
});

test('Storage failure is reported without claiming a goal was saved',async()=>{
 const {store,storage}=fixture();await login(store);
 const before=storage.getItem(DATA_KEY);storage.setItem=()=>{throw Error('Quota exceeded');};
 await assert.rejects(store.request('/api/goals',{rep_id:'r1',month:'2026-10',amount:'99999'}),e=>e.status===507);
 assert.equal(storage.getItem(DATA_KEY),before);
});

test('Corrupted stored data is preserved rather than replaced by demo data',async()=>{
 const storage=memory();storage.setItem(DATA_KEY,'broken-json');
 const store=createStore({storage,session:memory()});
 await assert.rejects(store.request('/api/me'),/Nie można odczytać/);
 assert.equal(storage.getItem(DATA_KEY),'broken-json');
});
