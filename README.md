# Flip 7 online (P2P, PeerJS)
Statisk side: index.html + game.js (ren spillogik) + vendor/ (peerjs 1.5.5, qrcode-generator 2.0.4, MIT).
- Unit tests: `node --test test/`
- E2E: serve mappen på :8080 (`python3 -m http.server 8080`), så
  `NODE_PATH=/workspace/flip7-dev/node_modules node e2e/e2e.js` (offentlig PeerJS-broker) eller `... --local`
  (kræver `npx peer --port 9000 --path /myapp`).
- Lokal broker i appen: `?peerhost=localhost&peerport=9000&peerpath=/myapp[&peersecure=1]` (videregives i join-link/QR).
