#!/bin/bash
# Startet die Turbo-Charger-Präsentation auf macOS (lokaler Webserver + Browser).
# Fenster offen lassen, solange präsentiert wird. Beenden mit ctrl+C.
cd "$(dirname "$0")" || exit 1
PORT=8737
URL="http://localhost:$PORT/"
echo "Turbo Charger – lokaler Server auf $URL"

if xcode-select -p >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v node >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec node -e '
    const http=require("http"),fs=require("fs"),path=require("path");
    const T={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".glb":"model/gltf-binary",".woff2":"font/woff2"};
    http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p.endsWith("/"))p+="index.html";
      const f=path.join(process.cwd(),p);if(!f.startsWith(process.cwd())||!fs.existsSync(f)){r.writeHead(404);return r.end();}
      r.writeHead(200,{"Content-Type":T[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r);
    }).listen('"$PORT"',"127.0.0.1");'
elif command -v ruby >/dev/null 2>&1; then
  (sleep 1; open "$URL") &
  exec ruby -run -e httpd . -p "$PORT" -b 127.0.0.1
else
  echo
  echo "Kein Python, Node oder Ruby gefunden."
  echo "Einmalig im Terminal ausführen:  xcode-select --install"
  echo "Danach dieses Skript erneut starten – oder die Browserversion nutzen:"
  echo "https://claude.ai/artifact/MJqaNxJVgCnXtKEeDkaUx3"
  read -r -p "Enter zum Schließen …"
fi
