'use strict';
// Optional static file server. Application data never leaves the browser.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/store.js':'store.js','/style.css':'style.css','/salesdesk.html':'../salesdesk.html'};
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const server = http.createServer((request,response)=>{
  const file=files[new URL(request.url,'http://localhost').pathname];
  if (!file || !['GET','HEAD'].includes(request.method)) {response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('Nie znaleziono.');return;}
  fs.readFile(path.join(__dirname,'web',file),(error,content)=>{
    if(error){response.writeHead(500);response.end('Nie można odczytać pliku.');return;}
    response.writeHead(200,{'Content-Type':types[path.extname(file)]+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"+(file==='../salesdesk.html'?" 'unsafe-inline'":'')+"; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'"});
    response.end(request.method==='HEAD'?undefined:content);
  });
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(`SalesDesk — statyczny serwer na porcie ${port}`));
