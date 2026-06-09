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
        '안녕하세요. 시리아이입니다.\n궁금한 점을 골라보시거나, 편하게 물어보세요.',
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
      title: '크리에이터 콘텐츠',
      subtitle: 'Creator Content',
      cardLine: '가입자 풀이 아니라, 당신께 맞는 사람을.',
      status: 'ready',

      hero: {
        eyebrow: 'Siriai Influencer System',
        headline: '시리아이의 크리에이터 콘텐츠는\n본질적으로 다릅니다',
        sub: '가입자 풀이 아니라, 당신께 맞는 사람을.',
        image: '/assets/mock/creator.svg', // 목업 — 추후 인플루언서 레퍼런스 영상·이미지(포트폴리오)로 교체
        imageAlt: '크리에이터 콘텐츠 비주얼',
        imageCaption: '인플루언서 레퍼런스 영상·이미지가 들어갈 자리 (예시)',
      },

      // 검증된 숫자만 (단가·미검증 수치 제외)
      proof: [
        { value: '100%', label: '콘텐츠 업로드율' },
        { value: '75개국', label: '글로벌 시딩 커버리지' },
        { value: '120,000', label: '글로벌 큐레이터' },
        { value: '17곳+', label: '함께한 거래처' },
      ],

      // 예상 질문 트리 (캐러셀 + 챗봇 공용). entry=true → 캐러셀 우선 노출
      // 예상 질문 — 잠재고객이 자주 묻는 순(freqRank)으로 정렬. entry=top.
      qna: [
        {
          id: 'c-ai',
          entry: true,
          question: 'AI로 인플루언서를 찾는다는 게 무슨 뜻이죠?',
          keywords: ['ai', '인공지능', '발굴', '찾', '데이터', '고른'],
          answer: {
            body: '가입자 풀에서 고르는 게 아니라, AI가 인스타그램 전체를 매번 새로 훑어 브랜드 결에 맞는 크리에이터를 발굴합니다. 그래서 캠페인마다 모수가 고정되지 않고, 늘 새로운 후보가 올라옵니다.',
            extra: '정형화된 매체 리스트가 아니라 캠페인 목적에 맞춰 매번 새로 짜는 구조라고 보시면 됩니다.',
            visuals: [
              {
                type: 'diagram',
                src: '/assets/diagrams/diff-contrast.svg',
                alt: '풀에서 고르기 vs 결을 읽고 발굴',
                caption: '풀에서 고르는 게 아니라, 결을 읽고 발굴합니다',
              },
            ],
          },
          followUps: ['c-fit', 'c-flow'],
        },
        {
          id: 'c-fit',
          entry: true,
          question: '우리 브랜드에 맞는 인플루언서는 어떻게 고르나요?',
          keywords: ['맞는', '고르', '선별', '기준', '핏'],
          answer: {
            body: '톤, 팔로워 결, 콘텐츠 맥락을 함께 보고 브랜드와 자연스럽게 붙는 크리에이터만 추립니다. 숫자가 큰 계정보다, 제품이 그 피드 안에 어색하지 않게 놓이는지를 우선합니다.',
            extra: '타깃 권역과 카테고리를 먼저 들으면 더 정밀하게 필터링해 드립니다.',
            visuals: [
              {
                type: 'list',
                title: '선별 기준',
                items: ['성별 · 연령대', 'ER 등 인게이지먼트', '감도 · 무드', '주 타깃층'],
              },
            ],
          },
          followUps: ['c-count', 'c-price'],
        },
        {
          id: 'c-flow',
          entry: true,
          question: '전체 진행 절차가 어떻게 되나요?',
          keywords: ['절차', '프로세스', '진행', '순서', '단계'],
          answer: {
            body: '목표를 진단하고, 3~4일 내 후보 리스트를 드린 뒤 섭외와 발송, 업로드, 리포트로 이어집니다. 평균 영업일은 14일 내외로 관리합니다.',
            extra: '단계마다 결과를 공유드리며 진행해, 중간에 방향을 조정할 수 있습니다.',
            visuals: [
              { type: 'process', items: ['목표 진단', '리스트', '섭외·발송', '업로드', '리포트'] },
            ],
          },
          followUps: ['c-report', 'c-onboard'],
        },
        {
          id: 'c-postpay',
          entry: true,
          question: '후불제라는데 정확히 어떤 구조예요?',
          keywords: ['후불', '정산', '구조', '리스크', '청구'],
          answer: {
            body: '착수금 20%로 시작하고, 실제 업로드가 완료된 분만 정산하는 구조입니다. 약속한 콘텐츠가 올라오지 않으면 청구되지 않으니, 리스크를 저희가 함께 집니다.',
            extra: '업로드율 100%를 유지해 온 방식이라 후불 구조가 가능합니다.',
            visuals: [{ type: 'stat', items: [{ value: '100%', label: '콘텐츠 업로드율' }] }],
          },
          followUps: ['c-price', 'c-newbrand'],
        },
        {
          id: 'c-price',
          question: '단가는 어떻게 책정되나요?',
          keywords: ['단가', '가격', '비용', '책정', '견적'],
          answer: {
            body: '단가표를 먼저 들이밀기보다, 목표와 규모를 듣고 가장 린한 구조를 역제안합니다. 같은 예산이라도 어디에 무게를 두느냐에 따라 설계가 달라지기 때문입니다.',
            extra: '원하시는 결과를 먼저 알려주시면, 거기에 맞춰 구조를 짜 드립니다.',
            visuals: [],
          },
          followUps: ['c-postpay'],
          ctaLeaf: true,
        },
        {
          id: 'c-count',
          question: '몇 명 정도 후보를 추려주시나요?',
          keywords: ['몇 명', '인원', '후보', '규모', '수'],
          answer: {
            body: '정해진 인원이 아니라 캠페인 목적과 권역에 맞춰 규모를 잡습니다. 3~4일 내 1차 리스트로 결을 먼저 확인하신 뒤, 함께 폭을 조정합니다.',
            extra: '나노 중심으로 폭넓게 보되, 브랜드 핏이 맞는 후보만 남깁니다.',
            visuals: [],
          },
          followUps: ['c-fit'],
        },
        {
          id: 'c-minbudget',
          question: '최소 집행 예산이 있나요?',
          keywords: ['최소', '예산', '하한', '소액', '작게'],
          answer: {
            body: '고정된 하한선을 못 박기보다, 목표를 먼저 듣고 그 안에서 가장 효율적인 구조를 역제안하는 쪽을 택합니다. 작게 시작해 결과를 보고 키우는 방식도 가능합니다.',
            extra: '단발 테스트로 결을 확인한 뒤 확장하는 흐름을 자주 권합니다.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
        {
          id: 'c-report',
          question: '캠페인 끝나면 어떤 리포트를 받나요?',
          keywords: ['리포트', '보고', '결과', '성과', 'kpi'],
          answer: {
            body: '업로드된 콘텐츠와 반응을 정리해, 무엇이 통했고 다음에 무엇을 키울지까지 담아 드립니다. 숫자 나열이 아니라 다음 의사결정에 쓸 수 있는 형태로 정리합니다.',
            extra: '콘텐츠별 반응도 따로 떼어 볼 수 있게 구성합니다.',
            visuals: [],
          },
          followUps: ['c-price'],
        },
        {
          id: 'c-onboard',
          question: '착수하려면 뭐가 필요한가요?',
          keywords: ['착수', '시작', '준비', '필요', '조건'],
          answer: {
            body: '브랜드와 제품, 이번 캠페인의 목표만 공유해 주시면 시작할 수 있습니다. 착수금 20%로 출발해 3~4일 내 후보 리스트로 첫 결과를 보여 드립니다.',
            extra: '준비물이 많지 않으니, 목표부터 편하게 들려주세요.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
        {
          id: 'c-overseas',
          question: '해외 인플루언서 시딩도 가능한가요?',
          keywords: ['해외', '글로벌', '시딩', '국가', '현지'],
          answer: {
            body: '75개국, 12개 이상 플랫폼에서 나노 중심으로 글로벌 시딩을 진행합니다. 현지 파트너가 권역별로 정밀하게 섭외하고 실행을 맡습니다.',
            extra: '영어권은 더 촘촘하게, 권역 필터링으로 타깃에 맞춰 좁혀 갑니다.',
            visuals: [
              {
                type: 'diagram',
                src: '/assets/diagrams/coverage.svg',
                alt: '글로벌 시딩 커버리지 — 75개국, 12+ 플랫폼, 나노 중심',
                caption: '필요한 곳이면, 어디든 — 그곳의 진짜 목소리를 찾습니다',
              },
            ],
          },
          followUps: ['c-reuse'],
        },
        {
          id: 'c-reuse',
          question: '인플루언서 콘텐츠를 광고에 써도 되나요?',
          keywords: ['2차', '광고', '활용', '저작권', 'ip', '소재'],
          answer: {
            body: '2차 활용은 사전에 권리 범위를 함께 설계해 두는 것을 원칙으로 합니다. 처음부터 광고 전환을 염두에 두면, 소재로 바로 이어 쓸 수 있게 짭니다.',
            extra: '퍼포먼스 소재 전환까지 보고 계시면 미리 알려 주세요. 그 전제로 섭외 구조를 잡습니다.',
            visuals: [],
          },
          followUps: ['c-overseas'],
        },
        {
          id: 'c-newbrand',
          question: '우리처럼 신생 브랜드도 받아주나요?',
          keywords: ['신생', '작은', '스타트업', '소규모', '처음'],
          answer: {
            body: '규모보다 브랜드가 가려는 방향이 분명한지를 봅니다. 무신사, 이니스프리, 코스알엑스 같은 곳과 일해 왔지만, 막 시작하는 브랜드일수록 작게 검증하며 키우는 구조가 잘 맞습니다.',
            extra: '거래처 17곳 이상과 쌓은 방식 그대로, 신생 브랜드에 맞춰 린하게 시작합니다.',
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
      referencesNote: '해외 케이스는 파트너와의 현지 실행 · 로고·실명은 공개 동의 후.',

      // 하위 서비스 (크리에이터 콘텐츠 안에 nested) — 짧은 소개 모듈
      services: [
        { name: '국내 시딩', en: 'Korea Seeding', blurb: '캠페인마다 결을 읽어 새로 발굴.' },
        { name: '글로벌 시딩', en: 'Global Seeding', blurb: '75개국·12+ 플랫폼, 나노 중심.' },
        { name: '모델 스타일링', en: 'Model Styling', blurb: '섭외·기획·촬영 모듈 선택.' },
        { name: '유튜브 캠페인', en: 'YouTube Campaign', blurb: '데이터로 크리에이터를 선별.' },
        { name: '라이브 커머스', en: 'Live Commerce', blurb: '검증된 파트너와 기획형 라이브.' },
        { name: '브랜드 콘텐츠', en: 'Branded Content', blurb: '제품을 감각적으로 시각화.' },
        { name: '인스타 콘텐츠', en: 'Instagram Content', blurb: '키비주얼·숏폼·AI 이미지 정기 운영.' },
      ],
    },

    /* ===================================================================== *
     * 02 — 비즈니스 컨설팅 / Architecting (READY)
     * ===================================================================== */
    {
      id: 'architecting',
      order: 2,
      title: '비즈니스 컨설팅',
      subtitle: 'Architecting',
      cardLine: '예산이 아니라, 비어 있는 자리를 채웁니다.',
      status: 'ready',

      hero: {
        eyebrow: 'Architecting',
        headline: '당신이 놓친 건 예산이 아니라,\n비어 있는 ‘자리’입니다',
        sub: '틀 없이 니즈를 해결하는 problem solver 집단.',
        image: '/assets/mock/consulting.svg',
        imageAlt: '비즈니스 컨설팅 비주얼',
        imageCaption: '넓은 인사이트를, 빠르게 구조로 — 가상 비주얼(목업)',
      },

      // 잠재고객 빈도순. entry=top.
      qna: [
        {
          id: 'ac-what',
          entry: true,
          question: '비즈니스 컨설팅 아키텍팅이 정확히 뭘 하는 건가요?',
          keywords: ['뭘', '무슨', '하는', '아키텍팅', '컨설팅', '역할'],
          answer: {
            body: '정해진 틀에 맞추는 게 아니라, 문제를 다시 정의하고 그 위에 구조를 짓습니다. 문제정의에서 구조 모델링, 실행 설계, 완수까지 한 팀이 처음부터 끝까지 책임집니다.',
            extra: '표면의 숫자가 아니라 본질적인 공백이 어디인지부터 진단합니다.',
            visuals: [],
          },
          followUps: ['ac-problem', 'ac-flow'],
        },
        {
          id: 'ac-problem',
          entry: true,
          question: '어떤 종류의 문제를 주로 다루세요?',
          keywords: ['어떤', '문제', '종류', '다루', '영역'],
          answer: {
            body: '정답이 정해져 있지 않은, 틀 없이 풀어야 하는 문제를 다룹니다. 브랜드 방향, 시장 진입, 실행 구조처럼 진단부터 새로 시작해야 하는 영역이 중심입니다.',
            extra: '업종보다 문제의 결을 봅니다. 본질적인 공백이 있는 곳이면 영역을 가리지 않습니다.',
            visuals: [],
          },
          followUps: ['ac-launch', 'ac-scope'],
        },
        {
          id: 'ac-scope',
          entry: true,
          question: '범위를 어디까지로 잡아야 할지 모르겠는데 도와주나요?',
          keywords: ['범위', '어디까지', '모르', '잡아', '시작점'],
          answer: {
            body: '범위를 못 잡는 것 자체가 첫 번째 진단 대상입니다. 목표를 먼저 듣고, 가장 린한 구조로 어디부터 손대야 하는지 역제안합니다.',
            extra: '넓게 펼치기보다 본질적인 공백 한 곳을 먼저 짚는 방식으로 시작합니다.',
            visuals: [],
          },
          followUps: ['ac-start'],
          ctaLeaf: true,
        },
        {
          id: 'ac-why',
          entry: true,
          question: '왜 굳이 SIRIAI를 선택해야 하나요?',
          keywords: ['왜', '굳이', '선택', '차별', '강점'],
          answer: {
            body: '진단부터 실행, 완수까지 한 팀이 책임지는 곳은 드뭅니다. 전략만 주고 떠나지 않고, 설계한 구조를 직접 실행해 끝까지 짓습니다.',
            extra: 'AI 리터러시로 넓은 인사이트를 빠르게 구조로 옮기는 속도가 차이를 만듭니다.',
            visuals: [],
          },
          followUps: ['ac-cost'],
        },
        {
          id: 'ac-cost',
          question: '비용은 대략 어느 정도 수준인가요?',
          keywords: ['비용', '가격', '예산', '수준', '얼마'],
          answer: {
            body: '규모와 목적에 따라 달라서 단가표부터 꺼내지 않습니다. 목표를 먼저 듣고 가장 린한 구조를 역제안한 뒤, 거기에 맞춰 비용을 잡습니다.',
            extra: '착수금 20%로 시작하는 구조라 부담을 앞단에 몰지 않습니다.',
            visuals: [],
          },
          followUps: ['ac-start'],
          ctaLeaf: true,
        },
        {
          id: 'ac-launch',
          question: '신규 브랜드 론칭 준비 중인데 적합한가요?',
          keywords: ['신규', '론칭', '브랜드', '준비', '적합'],
          answer: {
            body: '기초 설계부터 완성까지 한 팀이 짓는 작업이라 론칭 준비와 잘 맞습니다. 콘셉트 정의부터 실행 구조까지 빈 곳을 채워 세웁니다.',
            extra: '처음부터 함께 시작할수록 본질적인 공백을 더 정확히 잡습니다.',
            visuals: [],
          },
          followUps: ['ac-flow'],
        },
        {
          id: 'ac-flow',
          question: '프로젝트는 어떤 순서로 진행되나요?',
          keywords: ['순서', '프로세스', '진행', '단계', '절차'],
          answer: {
            body: '문제정의에서 시작해 구조 모델링, 실행 설계, 완수 순으로 갑니다. 진단을 끝내기 전에는 실행을 서두르지 않습니다.',
            extra: '각 단계마다 합의된 산출물을 두고 다음으로 넘어갑니다.',
            visuals: [
              { type: 'process', items: ['문제 정의', '구조 모델링', '실행 설계', '완수'] },
            ],
          },
          followUps: ['ac-start'],
        },
        {
          id: 'ac-start',
          question: '처음 시작은 어떻게 하면 되나요?',
          keywords: ['처음', '시작', '착수', '문의', '어떻게'],
          answer: {
            body: '지금 풀고 싶은 문제와 목표를 먼저 들려주시면 됩니다. 거기서부터 본질적인 공백을 진단하고 가장 린한 시작점을 역제안합니다.',
            extra: '착수금 20%로 가볍게 시작해 첫 구조를 함께 그려봅니다.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
      ],

      references: [],

      services: [
        { name: '브랜드 진단', en: 'Diagnosis', blurb: '놓친 자리를 먼저 찾습니다.' },
        { name: '구조 설계', en: 'Architecting', blurb: '인사이트를 실행 구조로.' },
        { name: '실행 동행', en: 'Execution', blurb: '완성·실행까지 한 팀이.' },
      ],
    },

    /* ===================================================================== *
     * 03 — 소프트웨어 엔지니어링 / sa:ai (READY)
     *   지표(3.4×·2주)·하위서비스는 공개 홈페이지 게재분 → 노출 가능
     * ===================================================================== */
    {
      id: 'saai',
      order: 3,
      title: '소프트웨어 엔지니어링',
      subtitle: 'sa:ai',
      cardLine: '우리의 마케팅은, 자체 기술 위에서 돕니다.',
      status: 'ready',

      hero: {
        eyebrow: 'sa:ai · Software Engineering',
        headline: '관계에서 시작해 데이터로 확장하고,\n기록으로 증명합니다',
        sub: 'Creators remember us.',
        image: '/assets/mock/software.svg',
        imageAlt: '소프트웨어 엔지니어링 비주얼',
        imageCaption: 'Performance · Creative · Archivo — 가상 비주얼(목업)',
      },

      proof: [
        { value: '3.4×', label: '개발 생산성 향상' },
        { value: '2주', label: '아이디어 → 작동 프로토타입' },
        { value: '1팀', label: '기획·UX·구현·운영 일괄' },
      ],

      // 잠재고객 빈도순. entry=top.
      qna: [
        {
          id: 'sa-what',
          entry: true,
          question: 'sa:ai가 정확히 어떤 솔루션인가요?',
          keywords: ['뭐', '솔루션', '아카이빙', '서비스', 'saai', '사아이'],
          answer: {
            body: '모든 SNS·플랫폼의 콘텐츠를 한 곳에 아카이빙합니다. 브랜드용은 효과·감도·생존을 추적하고, 개인용은 흩어진 콘텐츠를 라이브러리로 모읍니다.',
            extra: 'Performance·Creative·Archivo 3축으로 12+ 플랫폼·75개국 범위를 한 화면에서 봅니다.',
            visuals: [
              {
                type: 'list',
                title: '세 개의 축',
                items: ['Performance — 효과', 'Creative — 감도', 'Archivo — 기록'],
              },
            ],
          },
          followUps: ['sa-why', 'sa-direct'],
        },
        {
          id: 'sa-why',
          entry: true,
          question: '어떤 문제를 풀려고 만든 건가요?',
          keywords: ['문제', '왜', '만든', '이유', '목적'],
          answer: {
            body: '콘텐츠는 매일 쏟아지는데 어디서 통했고 무엇이 살아남았는지 흩어져 사라집니다. sa:ai는 그 흐름을 아카이빙해 추적 가능한 자산으로 바꿉니다.',
            extra: '우리 마케팅이 이 기술 위에서 돌기 때문에, 먼저 쓰며 검증한 도구를 건넵니다.',
            visuals: [],
          },
          followUps: ['sa-library', 'sa-idea'],
        },
        {
          id: 'sa-direct',
          entry: true,
          question: '마케팅 회사가 왜 직접 개발을 하나요?',
          keywords: ['왜', '직접', '개발', '마케팅', '기술'],
          answer: {
            body: '실행에서 나온 문제는 그 실행을 아는 팀이 가장 빠르게 짓습니다. 한 팀이 기획·UX·구현·운영을 같이 끌고 가, 마케팅과 기술 사이에 번역 손실이 없습니다.',
            extra: 'OpenAI·Anthropic·Gemini·Vercel 위에서 개발 생산성 3.4배로 움직입니다.',
            visuals: [],
          },
          followUps: ['sa-idea', 'sa-cost'],
        },
        {
          id: 'sa-library',
          question: '콘텐츠 라이브러리는 뭘 모아주나요?',
          keywords: ['라이브러리', '모아', '개인', '저장', '아카이브'],
          answer: {
            body: '12+ 플랫폼에 흩어진 게시물·릴스·영상을 한 곳에 모아 검색 가능한 자산으로 정리합니다. 다시 찾고, 재편집하고, 무엇이 통했는지 되짚는 기반이 됩니다.',
            extra: '브랜드용 추적과 같은 엔진 위에서 돌아, 개인 단위에서도 같은 감도로 봅니다.',
            visuals: [],
          },
          followUps: ['sa-what'],
        },
        {
          id: 'sa-idea',
          question: '우리 아이디어만 줘도 개발해 주나요?',
          keywords: ['아이디어', '개발', '기획', '외주', '맡기'],
          answer: {
            body: '아이디어 단계부터 같이 진단해 가장 린한 구조를 역제안합니다. 한 팀이 기획·UX·구현·운영을 끌고 가, 아이디어에서 프로토타입까지 2주 안에 형태를 잡습니다.',
            extra: '완성된 기획서가 없어도 됩니다. 풀려는 문제를 먼저 듣고 구조를 함께 설계합니다.',
            visuals: [
              { type: 'process', items: ['문제 진단', '구조 설계', '프로토타입', '운영'] },
            ],
          },
          followUps: ['sa-other'],
          ctaLeaf: true,
        },
        {
          id: 'sa-other',
          question: 'sa:ai 말고 다른 것도 개발해 주나요?',
          keywords: ['다른', '외주', '앱', '웹', '커머스', '자동화'],
          answer: {
            body: '서비스 기획·프로덕트 개발·UX&UI를 한 팀이 다뤄, sa:ai 외의 제품도 짓습니다. 어떤 문제든 가장 린한 구조부터 진단해 형태를 잡습니다.',
            extra: '아이디어에서 프로토타입까지 2주, 개발 생산성 3.4배 기준으로 움직입니다.',
            visuals: [],
          },
          followUps: ['sa-cost'],
          ctaLeaf: true,
        },
        {
          id: 'sa-cost',
          question: '개발 비용은 어떻게 책정되나요?',
          keywords: ['비용', '가격', '견적', '책정', '계약'],
          answer: {
            body: '단가표를 먼저 꺼내지 않습니다. 규모와 목적에 따라 달라지기에, 목표를 먼저 듣고 가장 린한 구조를 역제안한 뒤 책정합니다.',
            extra: '착수금 20%로 시작하는 구조를 기본으로, 범위는 함께 좁혀 갑니다.',
            visuals: [],
          },
          followUps: [],
          ctaLeaf: true,
        },
      ],

      references: [],

      services: [
        { name: '서비스 기획', en: 'Service Planning', blurb: '페인 포인트부터 정의.' },
        { name: '프로덕트 개발', en: 'Product Dev', blurb: '며칠 만에 프로토타입까지.' },
        { name: 'UX & UI', en: 'Design System', blurb: '디자인 시스템 위에서 구현.' },
      ],
    },

    /* ===================================================================== *
     * 04 — 시그니처 브랜드 / Signature Brand (COMING_SOON · 의도적 절제)
     *   브랜드 원칙: 상투어 없이 실루엣·여백·2026 으로만 암시. 깊이 얕게 유지.
     * ===================================================================== */
    {
      id: 'pb',
      order: 4,
      title: '시그니처 브랜드',
      subtitle: 'Signature Brand',
      cardLine: '우리 브랜드도, 만듭니다.',
      status: 'coming_soon',
      hero: {
        eyebrow: 'Signature Brand',
        headline: '우리는 남의 브랜드만 키우지 않습니다.\n우리 브랜드도 만듭니다',
        sub: '시대의 흐름을, 실제로 쓸 수 있는 자산으로.',
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
