# G_server 결함 1건

## i=20 · 워커 콘솔이 공개 URL에서 그대로 열림 — /worker.html/ 와 /worker%2Ehtml 이 redirect를 우회
- 파일: C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\vercel.json:5
- 심각도: high

### 재현/근거
라이브 확인: GET /worker.html → 307 → /lun8.html (막힘). 그러나 GET /worker.html/ → 200, GET /worker%2Ehtml → 200, 둘 다 본문 25,056바이트로 로컬 public/worker.html 과 바이트 수까지 동일한 작업 콘솔 전문(<title>댄스챌린지 작업 콘솔 · LUN8 SNEAKERS</title>)을 준다. vercel.json 의 redirects source 는 '/worker.html' 정확 일치라 두 변형을 안 잡고, 정적 파일은 CDN이 함수보다 먼저 처리하므로 src/server.js:726 의 CLOUD 워커 404 가드가 실행되지 않는다(그 가드는 실제로 살아 있다 — /worker 는 핸들러까지 가서 {"error":"not found"} 를 준다. 다만 정규식 /^\/worker(\.html)?$/i 는 trailing slash 형태를 매칭하지도 못한다). 실제 집행은 /api/execute 가 501 로 막혀 있어 돈은 안 나가지만(확인함), 주소를 아는 누구나 집행 버튼·금액 모달·스캔 제어가 붙은 내부 운영 콘솔을 열게 된다. 코드 주석이 이 redirect 를 '실질 방어선'이라고 부르는데, 그 방어선이 뚫려 있다.

### 제안
정적 CDN이 함수보다 먼저 응답하므로 서버측 가드로는 못 막는다. 파일을 배포 대상에서 빼는 것이 유일한 확실한 수정.

1) 파일 이동 — public/worker.html → local/worker.html
   `git mv public/worker.html local/worker.html` (Garden/local/ 새 폴더). public/ 이 outputDirectory 라 이것만으로 CDN 에서 사라진다.

2) C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\.vercelignore — 목록 끝(15행 `*.log` 다음)에 한 줄 추가:
   local/
   (CLI 배포 시 이중 안전. Git 연동 배포에서는 .vercelignore 가 적용되지 않을 수 있으므로 1)의 이동이 본체이고 이건 보조다.)

3) C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\src\server.js
   - 29행 `const PUB = join(root, 'public');` 아래에 추가:
     `const LOCAL_PUB = join(root, 'local'); // 배포되지 않는 대표님 PC 전용 화면(worker.html)`
   - 804행 가드의 정규식을 trailing slash 까지 덮도록 교체:
     기존: `if (CLOUD && /^\/worker(\.html)?$/i.test(path)) return send(res, 404, { error: 'not found' });`
     변경: `if (CLOUD && /^\/worker(\.html)?\/*$/i.test(path)) return send(res, 404, { error: 'not found' });`
   - 그 바로 아래(806행 '// 정적 파일' 직전)에 로컬 전용 서빙 추가 — 기존 북마크 URL(/worker.html)을 그대로 쓰게:
     `if (!CLOUD && /^\/worker(\.html)?\/*$/i.test(path)) {`
     `  const wp = join(LOCAL_PUB, 'worker.html');`
     `  if (existsSync(wp)) return send(res, 200, readFileSync(wp), 'text/html');`
     `  return send(res, 404, { error: 'worker.html 이 local/ 에 없어요' });`
     `}`
   - 802-803행 주석에서 'vercel.json 의 redirects 가 실질 방어선' 문구를 '워커 화면은 public/ 밖(local/)에 있어 애초에 배포되지 않는다. redirect·이 가드는 보조 방어다.' 로 고친다(주석이 틀린 안전감을 준다).

4) C:\Users\whwns\Desktop\VIBE\SIRIAI\Garden\vercel.json:5 — 남겨두되 변형까지 덮게 넓힌다(과거 배포본 캐시 대비):
   `"redirects": [{ "source": "/worker.html", "destination": "/lun8.html", "permanent": false }, { "source": "/worker.html/:path*", "destination": "/lun8.html", "permanent": false }, { "source": "/worker", "destination": "/lun8.html", "permanent": false }],`

5) 배포 후 검증(둘 다 200 이 아니어야 함):
   curl -sI https://siriai-challenge.vercel.app/worker.html/ ; curl -sI https://siriai-challenge.vercel.app/worker%2Ehtml
   그리고 로컬에서 `node src/server.js` 후 http://localhost:PORT/worker.html 이 정상으로 열리는지 확인.

참고: public/lun8.html 등 어디에도 worker.html 로 가는 링크가 없어(전수 grep) 이동으로 깨지는 참조는 없다.
