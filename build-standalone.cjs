'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root=__dirname;
const read=file=>fs.readFileSync(path.join(root,'web',file),'utf8');
const script=source=>'<script>\n'+source.replace(/<\/script/gi,'<\\/script')+'\n</script>';
const html=read('index.html')
 .replace('<link rel="stylesheet" href="./style.css">','<style>\n'+read('style.css')+'\n</style>')
 .replace('<script src="./store.js" defer></script>',()=>script(read('store.js')))
 .replace('<script src="./app.js" defer></script>',()=>script(read('app.js')));
fs.writeFileSync(path.join(root,'salesdesk.html'),html);
fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Zapisano salesdesk.html i stronę startową index.html dla GitHub Pages');
