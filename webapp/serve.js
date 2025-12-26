const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.argv[2] ? parseInt(process.argv[2],10) : 8001;
const root = process.cwd();

function contentType(ext){
  const map = {
    '.html':'text/html',
    '.css':'text/css',
    '.js':'application/javascript',
    '.json':'application/json',
    '.png':'image/png',
    '.jpg':'image/jpeg',
    '.jpeg':'image/jpeg',
    '.ico':'image/x-icon',
    '.svg':'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

const server = http.createServer((req,res)=>{
  try{
    const urlPath = decodeURIComponent(new URL(req.url, `http://localhost`).pathname);
    let filePath = path.join(root, urlPath);
    if(!filePath.startsWith(root)){
      res.writeHead(403,{'Content-Type':'text/plain'});
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (err,stat)=>{
      if(err){
        res.writeHead(404,{'Content-Type':'application/json'});
        res.end(JSON.stringify({detail:'Not Found'}));
        return;
      }
      if(stat.isDirectory()){
        filePath = path.join(filePath,'index.html');
        fs.stat(filePath, (er2,st2)=>{
          if(er2){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({detail:'Not Found'})); return; }
          streamFile(filePath,res);
        });
      } else {
        streamFile(filePath,res);
      }
    });
  } catch(e){
    res.writeHead(500,{'Content-Type':'text/plain'});
    res.end('Server error');
  }
});

function streamFile(filePath,res){
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200,{'Content-Type':contentType(ext)});
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', ()=>{ res.writeHead(500); res.end('Server error'); });
}

server.listen(port, '127.0.0.1', ()=>{
  console.log('Static server', root, 'listening on http://127.0.0.1:' + port);
});
