# smmkings 리필 문의 (2026-07-25)

아래 **영문 본문만** 복사해서 티켓에 붙여넣으면 됩니다.
한글 설명은 참고용이니 보내지 마세요.

---

## 📋 붙여넣을 영문 본문

Subject: Refill request for Service 3693 — refill API returns "disabled" despite [30 Days Refill] guarantee

Hello,

I am a regular buyer running influencer campaigns, and I place orders on Service 3693 (TikTok Followers [HQ - Max 1M] [30 Days Refill]) on a recurring basis.

**The problem:** The service is advertised as "[30 Days Refill]", and your API returns `refill: true` for service 3693. However, when I submit a refill request through the API (`action=refill`), it is rejected with:

> "Refill is disabled for this service"

All of the orders below are well within the 30-day refill window.

**Measured drops.** I track follower counts daily with automated scans, so these numbers are measured, not estimated. "Expected" = start count + delivered quantity.

| Order ID | Date | Account | Qty | Start | Expected | Current | Dropped |
|---|---|---|---|---|---|---|---|
| 21845912 | 2026-07-10 | k_n_m07 | 500 | 612 | 1,112 | 630 | **-482** |
| 21851851 | 2026-07-11 | mizuki.kjmt | 600 | 537 | 1,137 | 1,064 | -73 |
| 21925729 | 2026-07-22 | riaaa.2013 | 200 | 885 | 1,085 | 926 | **-159** |
| 21931634 | 2026-07-23 | soma.nitta | 900 | 233 | 1,133 | 1,088 | -45 |
| 21934935 | 2026-07-23 | coco.coco.bee | 800 | 310 | 1,110 | 1,088 | -22 |
| 21931633 | 2026-07-23 | mizuki.kjmt | 300 | 769 | 1,069 | 1,064 | -5 |

These orders are on the same service and also within the window — please include them in the refill:

| Order ID | Date | Account | Qty |
|---|---|---|---|
| 21854029 | 2026-07-12 | san03121 | 400 |
| 21849046 | 2026-07-11 | karinek0_ | 400 |
| 21849045 | 2026-07-11 | hijk_z_az | 600 |
| 21849044 | 2026-07-11 | ruto__39 | 800 |

**Why this matters to my campaign:** these accounts must stay above 1,000 followers to qualify. Two have already fallen below that line (k_n_m07 at 630, riaaa.2013 at 926), which disqualifies them from the campaign I already paid for.

**My request, in order of preference:**

1. **Enable refill for service 3693** and process the refills for the order IDs above. This is what the service page promises.
2. If refill genuinely cannot be enabled for this service, please **refund** the affected orders so I can re-purchase on a service where the refill guarantee actually works.

**One more thing:** I am not looking for a one-time fix. I run these campaigns continuously and I am planning a significantly larger volume of orders in the coming weeks. I would much rather keep sending that volume to you. I just need to know that the refill guarantee on 3693 is real — or, if it is not, which of your services I should be using instead so that drops are actually covered.

Could you also confirm which TikTok follower service you recommend for orders that need to hold above a threshold for 30+ days? I will move my volume there.

Thank you for your help.

---

## 참고 — 이 문의의 근거 (보내지 마세요)

**우리 쪽 사실관계**
- 자동 리필이 오늘 02:14에 3건(riaaa.2013·soma.nitta·coco.coco.bee) 요청 → 전부 거부
- 거부 메시지: "이 서비스에 대한 Refill이 비활성화되어 있습니다"
- 카탈로그 API 는 `refill: true` 반환 · 서비스명에도 `[30 Days Refill] ♻️`
- 즉 **광고와 실제 동작이 다름** → 환불 요구의 정당한 근거

**드랍 수치 출처**
- 시작값(start) = 주문 시점 패널이 기록한 startCount
- 현재값 = 오늘 02:14 자동 스캔 실측
- san03121·karinek0_·hijk_z_az·ruto__39 는 LUN8 캠페인 계정이 아니라
  우리 스캔 데이터에 현재 팔로워가 없음 → 수치 없이 주문번호만 제시(정직하게)

**협상 포인트**
- 1순위: 리필 활성화 (돈 안 나감)
- 2순위: 환불 (다른 서비스로 재구매)
- "앞으로 물량 늘릴 예정" → 진짜다. 캠페인 계속 돌아감
- 추천 서비스 물어보기 → 리필 되는 서비스로 갈아탈 명분 확보

**답변 오면 할 일**
- 리필 승인 시: 며칠 뒤 스캔으로 실제 채워졌는지 검증
- 환불 시: 다른 서비스 번호로 `campaigns.json` serviceIds.tk 교체
- 무응답/거절 시: 서비스 변경 + 리필 못 받는 전제로 여유분 더 사기
