# SIRIAI 브랜드 원칙 — 세일즈 자료 생성용 (Claude에 붙여넣어 사용)

> **사용법:** 시리아이(SIRIAI) 제안서·세일즈 PT·문서를 만들 때, 이 파일 전체를 Claude에 컨텍스트로 붙여넣고 "이 원칙을 반드시 지켜서 디자인하라"고 지시하세요. 아래 토큰/규칙을 벗어나지 마세요. **새 색·새 폰트·새 효과를 임의로 추가하지 마세요.**
>
> 출처: 시리아이 웹 히어로(SIRIAI Field.html)에 실제 적용된 디자인 토큰. 폰트·색·간격의 핵심만 발췌.

---

## 0. 한 문단 요약 (Claude가 먼저 내면화할 것)

따뜻한 크림색 종이(Paper) 위에 짙은 잉크(Ink) 텍스트를 올린 **차분하고 미니멀한 에디토리얼** 스타일이다. 영문 제목은 헬베티카 계열(Arimo), 국문은 Pretendard. 작은 라벨만 모노스페이스 대문자로 자간을 넓혀 쓴다. 색은 평평한 색면이 아니라 **은은한 웜 그라데이션 글로우**와 이미지에서 나오며, 베이스는 항상 중립이다. 강조는 잉크 솔리드 알약 버튼 하나로 충분하다. 여백은 넉넉하게, 한 화면에 한 메시지. 순백 배경·검정 텍스트·형광색·무지개 그라데이션·이모지·두꺼운 컬러 박스는 쓰지 않는다.

---

## 1. 폰트 (Typography)

### 폰트 스택 (이 5종만 사용)
```
영문 디스플레이/제목  : 'Helvetica Neue','Helvetica','Arimo','Pretendard',Arial,sans-serif
국문 제목/본문        : 'Pretendard', system-ui, sans-serif
일문(필요 시)         : 'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Noto Sans JP', sans-serif
라벨/메타/시간/태그   : 'JetBrains Mono', ui-monospace, monospace
에디토리얼 악센트(드뭄): 'Bodoni Moda', Georgia, serif
```
웹폰트 로드(필요 시):
- Pretendard: `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css`
- Google Fonts: `Arimo`, `JetBrains Mono`, `Bodoni Moda`

### 역할별 규격
| 역할 | 폰트 | 두께 | 크기(반응형) | 자간 | 줄간 |
|---|---|---|---|---|---|
| 영문 헤드라인 | Helvetica/Arimo | 500 | clamp(38px, 6vw, 82px) | −0.022em | 1.08 |
| 국문 헤드라인 | Pretendard | 600 | clamp(30px, 5.2vw, 74px) | −0.015em | 1.16 |
| 서브/리드 문장 | Helvetica/Arimo | 400 | clamp(15px, 1.4vw, 20px) | −0.005em | 1.5 |
| 본문 | Pretendard | 400 | 16px | −0.005em | 1.6 |
| 라벨/eyebrow/메타 | JetBrains Mono | 400–500 | 9.5–13px, **UPPERCASE** | .16–.22em | — |
| 에디토리얼 악센트 | Bodoni Moda | 500 | 큰 특별 제목에만 | 0 | 1.1 |

### 규칙
- 영문은 헬베티카/Arimo, 국문은 Pretendard. 한 화면에서 섞을 땐 **역할(제목/본문)로 구분**.
- 큰 제목일수록 **자간을 좁게**(−0.015 ~ −0.035em). 작은 라벨은 모노로 **자간을 넓게**(.16em+).
- 국문 제목은 **`word-break: keep-all`** (어절 단위 줄바꿈).
- **금지 폰트:** Inter, Roboto, Arial 단독, 맑은 고딕/굴림. 위 5종만.

---

## 2. 색 (Color)

### 코어 토큰
```
--paper  : #F3EEE2   /* 기본 배경 (따뜻한 크림 종이) */
--ink    : #211A33   /* 기본 텍스트 · CTA 버튼 */
--ink-2  : rgba(33,26,51,.66)   /* 보조 텍스트 */
--ink-3  : rgba(33,26,51,.46)   /* 캡션 · 비활성 */
--line   : rgba(33,26,51,.13)   /* 헤어라인 · 구분선 */
--accent : #2A6FDB   /* 파란 강조 — 텍스트 링크에만, 아주 드물게 */
```

### 분위기 색(웜 워시) — 색감은 여기서 나온다
Paper 위에 옅은 방사형 글로우를 겹친다(평평한 색면 금지):
```
peach : rgba(246,201,168,~.5)
lilac : rgba(221,208,239,~.45)
cream : rgba(255,224,196,~.4)
```
예) `radial-gradient(60% 50% at 16% 6%, rgba(246,201,168,.5), transparent 60%)` 식으로 Paper 위에 1~3겹.

### 규칙
- **중립 베이스(Paper) + 잉크 텍스트**가 기본. 강조색은 이미지/워시에서 나오게 한다.
- 위계는 텍스트 색 **Ink → Ink-2 → Ink-3** 3단계로만.
- 구분선은 얇은 **Line(13%)** 헤어라인.
- 버튼/CTA는 **Ink 솔리드 알약(pill)**. 파란 Accent는 **텍스트 링크에만** 극히 드물게.
- 선택 영역(::selection)은 배경 Ink / 글자 Paper.
- **금지:** 순백(#FFF) 배경 + 순흑(#000) 텍스트, 채도 높은 단색 배경면, 무지개/형광 그라데이션.

---

## 3. 간격 · 형태 (Spacing & Shape)

### 간격
- 화면 가장자리 여백: `6vw` 또는 `clamp(22px, 5vw, 64px)`
- 제목 → 서브 간격: `clamp(22px, 3.4vh, 36px)`
- 요소 묶음(아이콘·칩·버튼) gap: `9–22px`
- 본문 최대 폭: `max-width: 30em`
- 크기는 **`clamp()`** 로 화면에 맞춰 키우고, **여백은 넉넉하게**. 히어로는 항상 **중앙 정렬**.

### 모서리 둥글기 (Radius)
| 값 | 용도 |
|---|---|
| `12px` | 아이콘 버튼 · 작은 카드 |
| `18px` | 패널 · 상단 글래스 바 |
| `100px` | 버튼 · 태그 (알약) |

### 표면(글래스)
유리 바·버튼: 반투명 흰색(`rgba(255,255,255,.55)`) + `backdrop-filter: blur(20px) saturate(1.5)`, 1px 헤어라인 보더, 부드러운 그림자(`0 16px 44px rgba(33,26,51,.13)`).

---

## 4. 세일즈 PT 적용 — Do / Don't

**이렇게 (Do)**
- 슬라이드 마스터 배경을 **Paper `#F3EEE2`** 로 고정.
- 제목 = Helvetica/Pretendard, 본문 = Pretendard. **두 종류로 끝낸다.**
- 텍스트 위계는 **Ink / Ink-2 / Ink-3** 세 단계로만.
- 구분은 얇은 Line(13%), 강조는 **Ink 알약 버튼** 하나.
- 여백 크게, **한 슬라이드 한 메시지.**
- 작은 라벨(섹션 번호·태그)은 모노 대문자 + 넓은 자간.

**이건 피하기 (Don't)**
- 슬라이드마다 다른 폰트·색(Inter·형광색·무지개 그라데이션).
- 순백 배경 + 검정 텍스트.
- 두꺼운 컬러 보더·박스, 진한 드롭섀도.
- 이모지·클립아트·과한 아이콘 남발.
- 채도 높은 단색 배경면.

---

## 5. Claude에게 줄 한 줄 지시 (예시)

> "첨부한 SIRIAI 브랜드 원칙을 **그대로** 지켜서 슬라이드를 만들어줘. 배경은 #F3EEE2, 제목은 Helvetica/Pretendard, 본문은 Pretendard, 텍스트 색은 Ink/Ink-2/Ink-3 3단계만, 강조는 Ink 알약 버튼 하나. 새 색·새 폰트·이모지·진한 그림자·형광색은 쓰지 마. 여백 넉넉하게, 한 장에 한 메시지."
