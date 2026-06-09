/* =============================================================================
   SIRIAI V3 — 콘텐츠 데이터 (Single Source of Content)
   -----------------------------------------------------------------------------
   ★ 모든 카피·질문·답변·레퍼런스·CTA 문구는 전부 여기에. 코드에 하드코딩 금지.
   ★ 새 분야/레퍼런스 자료가 오면: 해당 객체의 status를 'ready'로 바꾸고
     hero·references·qna·services 만 채우면 화면에 자동으로 붙는다.

   표시 규칙(준수): 단가 비노출 · 미검증 수치 금지 · 해외 '직접 운영' 표현 금지 ·
                    브랜드 실명/로고는 공개동의 후 · 상투어/벤더 언어/이모지 금지.

   visual 타입(답변 비주얼): 'diagram' | 'process' | 'stat' | 'list' | 'compare' | 'note'
   ============================================================================= */

export const content = {
  meta: {
    siteName: 'SIRIAI',
    wordmark: 'SIRIAI',
    jp: '知り合い', // 사명: 아는 사이/지인 (일문 폰트로만 렌더)

    hero: {
      eyebrow: 'SIRIAI · 사업소개',
      title: '시리아이의 다양한 사업분야를 만나보세요',
      sub: '좋은 브랜드가 안 알려지는 건, 도달이 아니라 관계의 문제입니다.\n시리아이는 당신의 브랜드를 시장과 ‘아는 사이’로 만듭니다.',
      enter: '사업분야 보기',
    },

    hub: {
      eyebrow: 'Business Areas',
      title: '무엇을 찾고 계신가요?',
      sub: '필요한 분야를 고르면, 궁금한 질문부터 꺼내 보여드립니다.',
      enterLabel: '들어가기 →',
      comingLabel: 'SOON',    // 카드 상태칩 (상투어 회피)
      soonLabel: ' — 곧 공개', // coming_soon 카드 aria 보조 (스크린리더)
    },

    // 전환 CTA — 모든 답변 말단·분야 하단·챗봇 폴백에서 사용
    cta: {
      en: 'Let’s architect what’s next.',
      kr: '함께 다음을 설계하시죠.',
      button: '협업 제안 보내기',
      sub: '준비물은 없습니다. 막혀 있는 결정 하나만 가져와 주세요.',
    },

    channels: {
      email: 'jysiriai@gmail.com',
      openchat: 'https://open.kakao.com/o/sPb2dMfi',
      openchatNote: '이메일이 부담되면 — 오픈채팅으로 가볍게.',
      meeting: null, // 🔴 구글 캘린더 미팅 예약 링크 미확보 — 확보 후 채우면 버튼 자동 노출
      meetingLabel: '미팅 잡기',
    },

    chatbot: {
      title: '시리아이에게 물어보기',
      subtitle: '큐레이션 챗봇 · 등록된 답변만 드립니다',
      greeting:
        '안녕하세요. 시리아이입니다.\n인플루언서 비즈니스에 대해 궁금한 점을 골라보거나, 편하게 물어보세요.',
      placeholder: '무엇이 궁금하신가요?',
      fallback:
        '아직 제가 정확히 답할 수 있는 질문이 아니에요. 아래에서 골라보시거나, 바로 문의 주시면 사람이 답해 드릴게요.',
      suggestLabel: '이런 걸 물어보실 수 있어요',
    },
  },

  areas: [
    /* ===================================================================== *
     * 01 — 인플루언서 비즈니스 (READY · deck의 심장)
     * ===================================================================== */
    {
      id: 'influencer',
      order: 1,
      title: '인플루언서 비즈니스',
      subtitle: 'Siriai Influencer System',
      cardLine: '가입자 풀이 아니라, 당신께 맞는 사람을.',
      status: 'ready',

      hero: {
        eyebrow: 'Siriai Influencer System',
        headline: '시리아이의 인플루언서 비즈니스는\n본질적으로 다릅니다',
        sub: '가입자 풀이 아니라, 당신께 맞는 사람을.',
        image: '', // 인플루언서 비주얼 — 실사진은 핸드오프/Figma 단계. 지금은 캡션 placeholder
        imageAlt: '인플루언서 이미지',
        imageCaption: '인플루언서 비주얼 — 실사진 합류 예정',
      },

      // 검증된 숫자만 (단가·미검증 수치 제외)
      proof: [
        { value: '100%', label: '콘텐츠 업로드율' },
        { value: '75개국', label: '글로벌 시딩 커버리지' },
        { value: '120,000', label: '글로벌 큐레이터' },
        { value: '17곳+', label: '함께한 거래처' },
      ],

      // 예상 질문 트리 (캐러셀 + 챗봇 공용). entry=true → 캐러셀 우선 노출
      qna: [
        {
          id: 'diff',
          entry: true,
          question: '시리아이는 무엇이 다른가요?',
          keywords: ['다른', '차이', '플랫폼', '차별', '특별'],
          answer: {
            body: '플랫폼은 가입자 안에서 매칭합니다. 시리아이는 인스타그램 전체를 데이터로 보고, 매니저가 직접 핸들링합니다. 플랫폼 유지비와 에이전시 마크업을 걷어낸 비용으로 일합니다.',
            extra:
              '등록된 풀을 돌려쓰지 않습니다. 매번 당신 브랜드에 맞는 사람을 새로 발굴하고, 성과가 난 만큼만 청구합니다 — 후불제, 클라이언트 리스크 0.',
            visuals: [
              {
                type: 'diagram',
                src: '/assets/diagrams/diff-contrast.svg',
                alt: '기존 방식(풀에서 고름) vs 시리아이(결을 읽고 발굴) 비교',
                caption: '풀에서 고르는 게 아니라, 결을 읽고 발굴합니다',
              },
            ],
          },
          followUps: ['ai', 'list', 'reuse'],
        },
        {
          id: 'ai',
          question: 'AI로 사람을 고른다는 게 무슨 뜻인가요?',
          keywords: ['ai', '인공지능', '스코어링', '데이터', '알고리즘', '고른'],
          answer: {
            body: '가입한 인플루언서 풀 안에서 돌려쓰는 게 아닙니다. 인스타그램 전체를 데이터로 두고, 당신 브랜드의 무드·타깃·KPI에 맞는 사람만 매번 새로 골라냅니다.',
            visuals: [
              {
                type: 'list',
                title: '선별 기준',
                items: ['성별 · 연령대', 'ER 등 인게이지먼트 지수', '감도 · 무드', '주 타깃층'],
              },
            ],
          },
          followUps: ['list'],
        },
        {
          id: 'list',
          entry: true,
          question: '인플루언서 리스트는 어떻게 전달되나요?',
          keywords: ['리스트', '명단', '후보', '전달', '리스팅'],
          answer: {
            body: '브랜드 무드·타깃·KPI에 맞춰 데이터 기반으로 후보를 발굴해 리스트로 드립니다. 가입자 풀에서 돌려쓰지 않고, 매번 새로 골라냅니다.',
            extra:
              '브랜드가 직접 하는 일은 리스트 컨펌과 제품 발송까지입니다. 이후 콘텐츠 업로드 관리와 진행 점검은 시리아이가 전담합니다.',
            visuals: [
              {
                type: 'process',
                items: ['상담', '상품 안내', '3~4일 내 리스트 제공', '컨펌'],
              },
            ],
          },
          followUps: ['timeline', 'report'],
        },
        {
          id: 'timeline',
          entry: true,
          question: '캠페인 착수부터 완료까지 얼마나 걸리나요?',
          keywords: ['기간', '얼마나', '시간', '소요', '완료', '착수', '며칠'],
          answer: {
            body: '브랜드 인터뷰와 니즈 진단부터 데이터 기반 리스팅까지, 평균 영업일 14일 내외입니다. 핏이 맞는 사람을 고르는 일이라, 호흡을 서두르지 않습니다.',
            visuals: [
              {
                type: 'process',
                items: ['리스트 1주', '선정 2~3일', '배송 1주', '업로드 1~2주'],
              },
              { type: 'note', text: '러프하게, 대략 한 달입니다.' },
            ],
          },
          followUps: ['onboarding', 'report'],
        },
        {
          id: 'report',
          question: '콘텐츠 보고는 어떻게 하나요?',
          keywords: ['보고', '리포트', '리포팅', '결과', 'kpi', '성과'],
          answer: {
            body: '캠페인이 끝나면 KPI 보고서로 정리해 드립니다. 업로드분만 청구하는 후불제라, 보고서의 숫자가 곧 청구의 근거입니다.',
            extra: '제공·선정·업로드를 끝까지 관리하고, 태그와 제품까지 검수합니다.',
            visuals: [{ type: 'stat', items: [{ value: '100%', label: '콘텐츠 업로드율' }] }],
          },
          followUps: ['price'],
        },
        {
          id: 'price',
          entry: true,
          question: '가격은 어떻게 되나요?',
          keywords: ['가격', '비용', '예산', '단가', '얼마', '견적'],
          answer: {
            body: '규모와 목적에 따라 다릅니다. 단가표를 먼저 들이밀기보다, 목표를 듣고 가장 린(lean)한 구조를 역제안하는 편이 빠릅니다.',
            extra: '동일한 퀄리티를, 거품 없는 비용으로. 목표부터 같이 풀어보시죠.',
            visuals: [],
          },
          followUps: ['onboarding'],
          ctaLeaf: true,
        },
        {
          id: 'reuse',
          question: '콘텐츠 2차 활용은 가능한가요?',
          keywords: ['2차', '재사용', '활용', '저작권', '광고소재', 'ip'],
          answer: {
            body: '가능합니다. 시리아이는 플랫폼이 아니라 직접 핸들링하기 때문에, 2차 활용을 따로 협상해 드릴 수 있는 유연성과 협상력이 있습니다.',
            extra: '미업로드·분실 등 리스크에 대한 단계별 대응 체계도 함께 갖추고 있습니다.',
            visuals: [],
          },
          followUps: ['overseas'],
        },
        {
          id: 'overseas',
          entry: true,
          question: '해외 캠페인도 되나요?',
          keywords: ['해외', '글로벌', '국가', '일본', '미국', '동남아', '틱톡', '현지'],
          answer: {
            body: '됩니다. 인스타그램·틱톡·유튜브, 그리고 한국·일본·미국·동남아. 영어권 계정을 정밀 섭외하고, 핏이 맞지 않는 권역은 필터링으로 제외합니다.',
            extra:
              '글로벌 시딩은 75개국·12개 이상 플랫폼 위에서 나노 인플루언서 중심으로 움직입니다. 현지 실행은 검증된 파트너와 함께하고, 물류는 Amazon MCF로 안정적으로 처리합니다.',
            visuals: [
              {
                type: 'diagram',
                src: '/assets/diagrams/coverage.svg',
                alt: '글로벌 시딩 커버리지 — 75개국, 12+ 플랫폼, 나노 중심',
                caption: '필요한 곳이면, 어디든 — 그곳의 진짜 목소리를 찾습니다',
              },
            ],
          },
          followUps: ['reuse', 'diff'],
        },
        {
          id: 'onboarding',
          question: '착수 조건은 어떻게 되나요?',
          keywords: ['착수', '계약', '시작', '선금', '착수금', '조건'],
          answer: {
            body: '착수금 20%로 시작합니다. 무리한 선결제 없이, 가볍게 출발합니다.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
        {
          id: 'bigbrand',
          question: '큰 브랜드와도 해봤나요?',
          keywords: ['브랜드', '레퍼런스', '사례', '경험', '실적', '큰'],
          answer: {
            body: '무신사·이니스프리·코스알엑스를 비롯한 브랜드들, 그리고 글로벌 K-팝 아티스트(HYBE 계열) 캠페인과 함께했습니다. 규모보다 중요한 건, 그들이 ‘평균’을 거부하는 브랜드라는 점입니다.',
            visuals: [
              {
                type: 'list',
                title: '함께한 브랜드 (일부)',
                items: ['무신사', '카카오페이', '이니스프리', '코스알엑스(COSRX)', '아이디병원', 'HYBE 계열'],
              },
            ],
          },
          followUps: [],
          ctaLeaf: true,
        },
        {
          id: 'ready',
          question: '미팅 전에 준비할 게 있나요?',
          keywords: ['준비', '미팅', '준비물', '상담', '문의'],
          answer: {
            body: '없습니다. 막혀 있는 결정 하나만 가져와 주세요. 그 구조는 시리아이가 짜겠습니다.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
      ],

      // 함께한 브랜드/사례 — 모듈형. 빈 배열이면 섹션 자동 숨김.
      // ⚠️ 해외 케이스는 partner=true (직접 운영 X). 실명/로고는 공개동의 후.
      references: [
        {
          brand: 'ZB1 · 일본 틱톡 챌린지',
          displayBrand: '글로벌 K-팝 · 틱톡 챌린지', // consent!=='ok' 동안 노출되는 익명 표기
          summary: 'K-팝 아티스트 틱톡 댄스 챌린지 시딩',
          metric: '업로드율 100% · 북미 TOP5',
          region: '일본 · 북미',
          partner: true,
          consent: 'pending', // HYBE 계열 실명 공개동의 미확정 → displayBrand로 마스킹
          group: 'HYBE 계열',
        },
        {
          brand: 'NCT WISH · 일본 댄스챌린지',
          displayBrand: '글로벌 K-팝 · 댄스 챌린지',
          summary: '일본 댄스 챌린지 시딩',
          metric: '55건',
          region: '일본',
          partner: true,
          consent: 'pending',
          group: 'HYBE 계열',
        },
        {
          brand: '레이티드그린',
          summary: '글로벌 시딩 캠페인',
          metric: '',
          region: '글로벌',
          partner: true,
          consent: 'ok',
          group: '',
        },
        {
          brand: '틈결 × 에스더버니',
          summary: '플래그십 — 기획부터 실행까지 A to Z',
          metric: '나노 100 · VIP 130 · 매거진 7',
          region: '국내',
          partner: false,
          consent: 'confidential', // 대외비·수위조절
          group: '',
        },
      ],
      referencesNote: '해외 케이스는 검증된 파트너와의 현지 실행입니다. 브랜드 로고·실명은 공개 동의 후 노출됩니다.',

      // 하위 서비스 (인플루언서 비즈니스 안에 nested) — 짧은 소개 모듈
      services: [
        { name: '국내 시딩', en: 'Korea Seeding', blurb: '풀을 돌려쓰지 않고, 캠페인마다 결을 읽어 새로 발굴.' },
        { name: '글로벌 시딩', en: 'Global Seeding', blurb: '75개국·12+ 플랫폼, 나노 인플루언서 중심 숏폼.' },
        { name: '모델 스타일링', en: 'Model Styling', blurb: '섭외·기획·촬영을 1~3단계 모듈로 선택.' },
        { name: '유튜브 캠페인', en: 'YouTube Campaign', blurb: '데이터 기반 크리에이터 선별, 영상으로 깊이 전달.' },
        { name: '라이브 커머스', en: 'Live Commerce', blurb: '검증된 제작 파트너와 함께하는 기획형 라이브.' },
        { name: '브랜드 콘텐츠', en: 'Branded Content', blurb: '제품을 감각적으로 시각화하는 촬영·연출.' },
        { name: '인스타 콘텐츠', en: 'Instagram Content', blurb: '키비주얼·숏폼·AI 이미지로 피드를 정기 운영.' },
      ],
    },

    /* ===================================================================== *
     * 02 — 아키텍팅 (COMING_SOON · 카피만 존재)
     * ===================================================================== */
    {
      id: 'architecting',
      order: 2,
      title: '아키텍팅',
      subtitle: 'Architecting',
      cardLine: '우리가 일하는 방식.',
      status: 'coming_soon',
      hero: {
        eyebrow: 'Architecting',
        headline: '당신이 놓친 건 예산이 아니라,\n비어 있는 ‘자리’입니다',
        sub: '틀 없이 니즈를 해결하는 problem solver 집단.',
      },
      teaser: {
        line: '기초 설계부터 완성, 실행까지 — A to Z를 직접 설계합니다.',
        sub: '진행 이력이 없던 프로젝트도 처음부터 끝까지. 이 자리의 이야기는 곧 펼쳐집니다.',
      },
      references: [],
      qna: [],
    },

    /* ===================================================================== *
     * 03 — sa:ai (COMING_SOON · 외부 figma)
     * ===================================================================== */
    {
      id: 'saai',
      order: 3,
      title: 'sa:ai',
      subtitle: 'Software Engineering',
      cardLine: '우리의 마케팅은, 자체 기술 위에서 돕니다.',
      status: 'coming_soon',
      hero: {
        eyebrow: 'sa:ai · Software',
        headline: '관계에서 시작해 데이터로 확장하고,\n기록으로 증명합니다',
        sub: 'Creators remember us.',
      },
      teaser: {
        line: '모든 SNS·플랫폼 콘텐츠를 아카이빙하는 솔루션. Performance · Creative · Archivo.',
        sub: '우리의 모든 마케팅이 돌아가는 기술을, 외부 브랜드의 솔루션으로도 짓습니다.',
      },
      tech: 'Built on OpenAI · Anthropic · Gemini · Vercel',
      references: [],
      qna: [],
    },

    /* ===================================================================== *
     * 04 — Private Brand (COMING_SOON · 준비중, 암시만 / 상투어 금지)
     * ===================================================================== */
    {
      id: 'pb',
      order: 4,
      title: 'Private Brand',
      subtitle: 'Private Brand',
      cardLine: '우리 브랜드도, 만듭니다.',
      status: 'coming_soon',
      hero: {
        eyebrow: 'Private Brand',
        headline: '우리는 남의 브랜드만 키우지 않습니다.\n우리 브랜드도 만듭니다',
        sub: '',
      },
      teaser: {
        line: '필름과 디스플레이 사이. 실루엣으로 먼저 도착합니다.',
        sub: '2026.',
      },
      references: [],
      qna: [],
    },
  ],
}

// 편의 셀렉터 ----------------------------------------------------------------
export const getArea = (id) => content.areas.find((a) => a.id === id)
export const getQuestion = (area, qid) => (area?.qna || []).find((q) => q.id === qid)
export const readyAreas = () => content.areas.filter((a) => a.status === 'ready')
// 챗봇 검색용: ready 분야의 모든 qna를 평탄화
export const allQuestions = () =>
  content.areas
    .filter((a) => a.status === 'ready')
    .flatMap((a) => (a.qna || []).map((q) => ({ ...q, areaId: a.id })))
