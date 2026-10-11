'use strict';

/* All data is local to this browser. Roles here model the demo workflow;
   they are not a security boundary or server-side authentication. */
(function (global) {
  const DATA_KEY = 'salesdesk.browser.v1';
  const SESSION_KEY = 'salesdesk.session.v1';
  const CSV_FIELDS = ['id', 'date', 'rep_id', 'client', 'amount', 'currency', 'status', 'kind', 'category'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const publicUser = ({id, email, name, role, team, rep_id, active}) => ({id, email, name, role, team, rep_id, active});

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  }

  function cents(value) {
    const text = String(value).trim().replace(',', '.');
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) fail('Nieprawidłowa kwota (maks. 2 miejsca po przecinku).');
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result > 100_000_000_000) fail('Kwota nie może przekraczać 1 mld PLN.');
    return negative ? -result : result;
  }

  function delimiterFor(text) {
    let quoted = false, commas = 0, semicolons = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted) {
        if (char === '\n' || char === '\r') break;
        if (char === ',') commas++;
        if (char === ';') semicolons++;
      }
    }
    return semicolons > commas ? ';' : ',';
  }

  function parseCSV(input) {
    const text = String(input).replace(/^\ufeff/, '');
    if (!text.trim()) fail('Plik jest pusty.');
    const delimiter = delimiterFor(text);
    const records = [];
    let row = [], field = '', quoted = false, closed = false, line = 1, start = 1;
    function pushField() { row.push(field); field = ''; closed = false; }
    function pushRow() {
      pushField();
      if (row.some(value => value.trim())) records.push({line: start, values: row});
      row = []; start = line + 1;
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closed = true; }
        } else { field += char; if (char === '\n') line++; }
      } else if (char === '"') {
        if (field || closed) fail(`Wiersz ${line}: nieprawidłowy cudzysłów w CSV.`);
        quoted = true;
      } else if (char === delimiter) pushField();
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        pushRow(); line++;
      } else if (closed && !/\s/.test(char)) fail(`Wiersz ${line}: znak po zamknięciu cudzysłowu.`);
      else if (!closed) field += char;
    }
    if (quoted) fail('Niezamknięty cudzysłów w CSV.');
    if (field || row.length || closed) pushRow();
    if (!records.length) fail('Plik jest pusty.');
    const headers = records.shift().values.map(value => value.trim());
    if (headers.some(h => !h) || new Set(headers).size !== headers.length) fail('Nagłówki muszą być niepuste i unikalne.');
    return {headers, records};
  }

  async function hashPassword(password, salt) {
    if (!global.crypto?.subtle) fail('Ta przeglądarka nie obsługuje lokalnych kont. Otwórz aplikację z pliku lub przez localhost/HTTPS.');
    const encoder = new TextEncoder();
    const key = await global.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await global.crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000}, key, 256);
    return Array.from(new Uint8Array(bits), value => value.toString(16).padStart(2, '0')).join('');
  }
  function salt() { return Array.from(global.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join(''); }

  async function seed(today) {
    const reps = [
      {id:'r1',name:'Anna Kowalska',initials:'AK',team:'Północ',region:'Gdańsk',color:'#6155d9'},
      {id:'r2',name:'Michał Nowak',initials:'MN',team:'Północ',region:'Warszawa',color:'#327c9b'},
      {id:'r3',name:'Julia Wiśniewska',initials:'JW',team:'Północ',region:'Poznań',color:'#bc6f8c'},
      {id:'r4',name:'Piotr Wójcik',initials:'PW',team:'Południe',region:'Kraków',color:'#c58b42'},
      {id:'r5',name:'Karolina Zielińska',initials:'KZ',team:'Południe',region:'Wrocław',color:'#527f61'},
      {id:'r6',name:'Tomasz Kamiński',initials:'TK',team:'Południe',region:'Katowice',color:'#67799a'}
    ];
    const accounts = [
      {email:'dyrektor@demo.pl',name:'Aleksandra Mazur',role:'director',team:null,rep_id:null},
      {email:'kierownik@demo.pl',name:'Marta Lewandowska',role:'manager',team:'Północ',rep_id:null},
      {email:'anna@demo.pl',name:'Anna Kowalska',role:'rep',team:'Północ',rep_id:'r1'},
      {email:'admin@demo.pl',name:'Administrator',role:'admin',team:null,rep_id:null}
    ];
    const users = await Promise.all(accounts.map(async (account, i) => {
      const userSalt = salt();
      return {...account,id:i+1,active:1,salt:userSalt,password:await hashPassword('Demo2026!',userSalt)};
    }));
    const sales = [], goals = [];
    const clients = ['Nova Retail','Greenline','Atlas Group','Forma Studio','Baltic Trade','Urban Market','Vertex','Horizon Sp. z o.o.'];
    const categories = ['Oprogramowanie','Usługi','Sprzęt'];
    const [year,month,day] = today.split('-').map(Number);
    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(Date.UTC(year,month-1-offset,1));
      const prefix = d.toISOString().slice(0,7);
      const days = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
      reps.forEach((rep,ri) => {
        goals.push({rep_id:rep.id,month:prefix,amount:(95000+ri*7000)*100});
        for (let n=1; n<=28; n++) {
          const saleDay=1+(n*7+ri*3)%days;
          if (!offset && saleDay>day) continue;
          sales.push({id:`DEMO-${prefix}-${ri}-${n}`,date:`${prefix}-${String(saleDay).padStart(2,'0')}`,rep_id:rep.id,client:clients[(n+ri)%clients.length],amount:(2400+(n*193+ri*613+offset*337)%4800)*100,currency:'PLN',status:'approved',kind:'sale',category:categories[(n+ri)%3],team:rep.team,region:rep.region});
        }
      });
    }
    return {version:1,reps,users,sales,goals,audit:[],updated:'Dane demonstracyjne'};
  }

  function validateDatabase(data) {
    if (!data || data.version !== 1 || !['reps','users','sales','goals','audit'].every(key => Array.isArray(data[key]))) fail('Nieprawidłowa kopia danych SalesDesk.');
    const ids = new Set(data.reps.map(r=>r.id));
    if (!ids.size || ids.size !== data.reps.length || !data.reps.every(r=>typeof r.id==='string' && ['name','initials','team','region','color'].every(k=>typeof r[k]==='string') && /^#[a-f0-9]{6}$/i.test(r.color))) fail('Nieprawidłowe dane przedstawicieli.');
    if (new Set(data.sales.map(s=>s.id)).size !== data.sales.length || !data.sales.every(s=>typeof s.id==='string' && s.id.length>0 && validDate(s.date) && ids.has(s.rep_id) && Number.isSafeInteger(s.amount) && Math.abs(s.amount)<=100_000_000_000 && ['client','category','team','region'].every(k=>typeof s[k]==='string') && s.currency==='PLN' && ['approved','pending','cancelled'].includes(s.status) && ['sale','return','correction'].includes(s.kind) && !(s.kind==='sale'&&s.amount<0) && !(s.kind==='return'&&s.amount>0))) fail('Nieprawidłowe dane sprzedaży.');
    if (!data.goals.every(g=>ids.has(g.rep_id) && /^\d{4}-\d{2}$/.test(g.month) && validDate(g.month+'-01') && Number.isSafeInteger(g.amount) && g.amount>0 && g.amount<=100_000_000_000) || new Set(data.goals.map(g=>g.rep_id+':'+g.month)).size !== data.goals.length) fail('Nieprawidłowe cele.');
    const userIds = new Set(data.users.map(u=>u.id));
    if (userIds.size !== data.users.length || new Set(data.users.map(u=>u.email)).size !== data.users.length || !data.users.every(u=>Number.isSafeInteger(u.id) && u.id>0 && typeof u.name==='string' && typeof u.email==='string' && ['admin','director','manager','rep'].includes(u.role) && [0,1].includes(u.active) && typeof u.salt==='string' && /^[a-f0-9]{64}$/.test(u.password) && (u.role!=='rep'||ids.has(u.rep_id)) && (u.role!=='manager'||data.reps.some(r=>r.team===u.team))) || !data.users.some(u=>u.role==='admin'&&u.active)) fail('Nieprawidłowe konta lub brak aktywnego administratora.');
    if (!data.audit.every(a=>Number.isSafeInteger(a.id) && typeof a.at==='string' && typeof a.action==='string' && typeof a.detail==='string' && userIds.has(a.user_id)) || typeof data.updated!=='string') fail('Nieprawidłowa historia operacji.');
    return data;
  }

  function createStore({storage, session, today=todayISO} = {}) {
    let queue = Promise.resolve();
    const write = data => {
      try { storage.setItem(DATA_KEY,JSON.stringify(data)); }
      catch { fail('Nie udało się zapisać danych. Pamięć przeglądarki jest pełna lub zablokowana. Wyeksportuj kopię danych.',507); }
    };
    const read = () => {
      try {
        const raw=storage.getItem(DATA_KEY);
        if (!raw) return null;
        return validateDatabase(JSON.parse(raw));
      } catch (error) {
        if (error.status) throw error;
        fail('Nie można odczytać danych przeglądarki. Nie zostały nadpisane.',500);
      }
    };
    const ready = (async()=>{if (!read()) write(await seed(today()));})();
    ready.catch(()=>{});
    function audit(data,user,action,detail) {
      data.audit.push({id:(data.audit.at(-1)?.id||0)+1,user_id:user.id,name:user.name,at:new Date().toISOString().replace('T',' ').slice(0,19),action,detail});
    }
    function repsFor(data,user) { return data.reps.filter(r=>user.role==='rep'?r.id===user.rep_id:user.role==='manager'?r.team===user.team:true); }
    function authorize(user, roles) { if (!roles.includes(user.role)) fail('Ta operacja nie jest dostępna dla wybranej roli.',403); }
    function salesFor(data,user,params) {
      const ids=new Set(repsFor(data,user).map(r=>r.id));
      return data.sales.filter(s=>ids.has(s.rep_id) && (!params.get('from')||s.date>=params.get('from')) && (!params.get('to')||s.date<=params.get('to')) && ['rep','team','region','category'].every(key=>!params.get(key)||s[key==='rep'?'rep_id':key]===params.get(key))).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
    }
    function importRows(data,body) {
      if (new TextEncoder().encode(body.csv||'').length>4_000_000) fail('Plik przekracza 4 MB.');
      const {headers,records}=parseCSV(body.csv||'');
      if (records.length>10000) fail('Maksymalnie 10 000 wierszy na import.');
      if (!records.length) fail('Plik nie zawiera transakcji.');
      const mapping=body.mapping||Object.fromEntries(CSV_FIELDS.map(k=>[k,k]));
      if (CSV_FIELDS.slice(0,-1).some(key=>!headers.includes(mapping[key]))) fail('Przypisz wszystkie wymagane kolumny CSV.');
      const reps=new Map(data.reps.map(r=>[r.id,r]));
      const existing=new Map(data.sales.map(s=>[s.id,s]));
      const seen=new Set(),valid=[],errors=[];let duplicates=0,changes=0;
      for (const record of records) {
        try {
          if (record.values.length!==headers.length) fail('Liczba kolumn nie odpowiada nagłówkom.');
          const row=Object.fromEntries(CSV_FIELDS.map(key=>[key,(record.values[headers.indexOf(mapping[key])]||'').trim()]));
          if (!row.id || row.id.length>100) fail('Brak identyfikatora lub identyfikator za długi.');
          if (seen.has(row.id)) fail('Powtórzony identyfikator w pliku.');
          seen.add(row.id);
          if (!validDate(row.date)) fail('Nieprawidłowa data. Użyj RRRR-MM-DD.');
          const rep=reps.get(row.rep_id);if(!rep)fail('Nieznany przedstawiciel.');
          if(!row.client)fail('Brak klienta.');
          if(row.client.length>200||row.category.length>200)fail('Nazwa jest za długa (maks. 200 znaków).');
          row.amount=cents(row.amount);
          if(row.currency!=='PLN')fail('Obsługiwana waluta to PLN.');
          if(!['approved','pending','cancelled'].includes(row.status))fail('Status: approved, pending lub cancelled.');
          if(!['sale','return','correction'].includes(row.kind))fail('Rodzaj: sale, return lub correction.');
          if(row.kind==='sale'&&row.amount<0)fail('Sprzedaż nie może mieć ujemnej wartości.');
          if(row.kind==='return'&&row.amount>0)fail('Zwrot musi mieć kwotę ujemną lub zero.');
          const old=existing.get(row.id);
          row.team=old?.rep_id===row.rep_id?old.team:rep.team;
          row.region=old?.rep_id===row.rep_id?old.region:rep.region;
          if(old){if(CSV_FIELDS.every(key=>old[key]===row[key])){duplicates++;continue;}changes++;}
          valid.push(row);
        }catch(error){errors.push({row:record.line,error:error.message});}
      }
      return {valid,errors,duplicates,changes};
    }

    async function dispatch(path,body={}) {
      await ready;
      const data=read();
      const url=new URL(path,'https://salesdesk.local');
      if (url.pathname==='/api/login') {
        const email=String(body.email||'').trim().toLowerCase();
        const user=data.users.find(u=>u.email===email&&u.active);
        if(!user||await hashPassword(String(body.password||''),user.salt)!==user.password)fail('Nieprawidłowy adres e-mail lub hasło.',401);
        audit(data,user,'login','Logowanie do lokalnej wersji demonstracyjnej');write(data);
        session.setItem(SESSION_KEY,String(user.id));return {ok:true};
      }
      const user=data.users.find(u=>u.id===Number(session.getItem(SESSION_KEY))&&u.active);
      if(!user)fail('Zaloguj się, aby kontynuować.',401);
      switch(url.pathname) {
        case '/api/me': return publicUser(user);
        case '/api/logout': session.removeItem(SESSION_KEY);return {ok:true};
        case '/api/data': {
          const reps=repsFor(data,user);const ids=new Set(reps.map(r=>r.id));
          return clone({reps,sales:salesFor(data,user,url.searchParams),goals:data.goals.filter(g=>ids.has(g.rep_id)),updated:data.updated,today:today()});
        }
        case '/api/audit':
          authorize(user,['admin','director','manager']);
          return clone(data.audit.filter(a=>user.role!=='manager'||a.user_id===user.id).slice(-40).reverse());
        case '/api/goals': {
          authorize(user,['admin','director','manager']);
          if(!repsFor(data,user).some(r=>r.id===body.rep_id))fail('Brak dostępu do przedstawiciela.',403);
          if(!/^\d{4}-\d{2}$/.test(body.month)||!validDate(body.month+'-01'))fail('Nieprawidłowy miesiąc.');
          const amount=cents(body.amount);if(amount<=0)fail('Cel musi być dodatni.');
          const old=data.goals.find(g=>g.rep_id===body.rep_id&&g.month===body.month);
          audit(data,user,'goal',JSON.stringify({rep_id:body.rep_id,month:body.month,before:old?.amount??null,after:amount}));
          if(old)old.amount=amount;else data.goals.push({rep_id:body.rep_id,month:body.month,amount});
          write(data);return {ok:true};
        }
        case '/api/import/preview':
        case '/api/import/commit': {
          authorize(user,['admin']);const result=importRows(data,body);
          if(url.pathname.endsWith('preview'))return {...result,valid:result.valid.length,preview:result.valid.slice(0,5)};
          if(result.errors.length)fail('Popraw błędy przed zatwierdzeniem importu.');
          if(result.changes&&body.confirm_updates!==true)fail('Potwierdź aktualizację istniejących transakcji.',409);
          const rows=new Map(data.sales.map(s=>[s.id,s]));for(const row of result.valid)rows.set(row.id,row);
          data.sales=Array.from(rows.values());
          data.updated=new Date().toISOString().replace('T',' ').slice(0,19)+' UTC';
          audit(data,user,'import',`Zaimportowano ${result.valid.length} rekordów, pominięto ${result.duplicates} duplikatów.`);
          write(data);return {imported:result.valid.length,duplicates:result.duplicates};
        }
        case '/api/export': {
          const quote=value=>'"'+String(value).replace(/"/g,'""')+'"';
          const safe=value=>/^[=+\-@\t\r]/.test(String(value))?"'"+value:value;
          const rows=salesFor(data,user,url.searchParams).map(s=>CSV_FIELDS.map(key=>quote(key==='amount'?(s.amount/100).toFixed(2):['id','client','category'].includes(key)?safe(s[key]):s[key])).join(','));
          return CSV_FIELDS.join(',')+'\r\n'+rows.join('\r\n')+'\r\n';
        }
        case '/api/users': {
          authorize(user,['admin']);if(!Object.keys(body).length)return data.users.map(publicUser);
          const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
          if(!name||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>200)fail('Podaj poprawne imię i adres e-mail.');
          if(!['admin','director','manager','rep'].includes(body.role))fail('Nieprawidłowa rola.');
          if(password.length<10||password.length>200)fail('Hasło musi mieć od 10 do 200 znaków.');
          if(data.users.some(u=>u.email===email))fail('Ten adres e-mail jest już zajęty.');
          let team=null,rep_id=null;
          if(body.role==='manager'){team=body.team;if(!data.reps.some(r=>r.team===team))fail('Wybierz zespół kierownika.');}
          if(body.role==='rep'){const rep=data.reps.find(r=>r.id===body.rep_id);if(!rep)fail('Wybierz przedstawiciela.');rep_id=rep.id;team=rep.team;}
          const userSalt=salt();const id=Math.max(0,...data.users.map(u=>u.id))+1;
          data.users.push({id,name,email,role:body.role,team,rep_id,active:1,salt:userSalt,password:await hashPassword(password,userSalt)});
          audit(data,user,'user',`Utworzono konto ${email} (${body.role})`);write(data);return {id};
        }
        case '/api/users/status': {
          authorize(user,['admin']);const target=data.users.find(u=>u.id===body.id);
          if(!target)fail('Nie znaleziono konta.');if(target.id===user.id)fail('Nie możesz wyłączyć własnego konta.');
          target.active=body.active===true?1:0;
          audit(data,user,'user',`${target.active?'Włączono':'Wyłączono'} konto ${target.email}`);write(data);return {ok:true};
        }
        case '/api/backup': authorize(user,['admin']);return JSON.stringify(data,null,2);
        case '/api/restore': {
          authorize(user,['admin']);if(body.confirm!==true)fail('Potwierdź zastąpienie lokalnych danych.');
          let restored;try{restored=JSON.parse(String(body.json||'').replace(/^\ufeff/,''));}catch{fail('Nieprawidłowy plik JSON.');}
          validateDatabase(restored);write(restored);session.removeItem(SESSION_KEY);return {ok:true};
        }
        default: fail('Nie znaleziono operacji.',404);
      }
    }
    return {
      request(path,body) {
        const result=queue.then(()=>dispatch(path,body));
        queue=result.catch(()=>{});
        return result;
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports={createStore,parseCSV,cents,DATA_KEY,SESSION_KEY};
  else {
    global.SalesCSV={parse:parseCSV};
    global.SalesStore=createStore({
    storage:{getItem:key=>global.localStorage.getItem(key),setItem:(key,value)=>global.localStorage.setItem(key,value)},
    session:{getItem:key=>global.sessionStorage.getItem(key),setItem:(key,value)=>global.sessionStorage.setItem(key,value),removeItem:key=>global.sessionStorage.removeItem(key)}
  });
  }
})(globalThis);
