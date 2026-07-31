# smmkings 2차 문의 — 리필 미이행 (2026-07-26)

1차 문의(7/25) 답변: "Orders added for a refill task" — 리필 등록했다고 함.
**24시간 뒤 실측: 한 명도 안 들어옴. 오히려 229명 더 빠짐.**

톤: 공격적이지 않게. 계속 쓰고 싶은 서비스라는 점을 분명히.
아래 **영문 본문만** 복사해서 같은 티켓에 이어 붙이세요.

---

## 📋 붙여넣을 영문 본문

Hello,

Thank you for the earlier reply saying the orders were added for a refill task. I waited a day and checked again, but unfortunately nothing has come back yet. I run automated follower scans daily, so these are measured numbers:

| Order ID | Account | Expected | Yesterday | Today |
|---|---|---|---|---|
| 21845912 | k_n_m07 | 1,112 | 630 | 630 |
| 21851851 | mizuki.kjmt | 1,137 | 779 | 777 |
| 21925729 | riaaa.2013 | 1,085 | 926 | 924 |
| 21931634 | soma.nitta | 1,133 | 287 | 288 |
| 21934935 | coco.coco.bee | 1,110 | 689 | 463 |

Net change over 24 hours: **-229 followers**. Order 21934935 alone lost 226 in a single day, just two days after delivery.

My honest concern is the drop speed itself. Most of the followers I ordered this week are already gone. I understand that some attrition is normal and I am not expecting the full 30 days — **but if a service is sold with a "30 Days Guarantee", I would hope they last at least two weeks.** Losing them in two or three days, with the refill not working either, makes the purchase hard to justify. If the price were very low I could accept it as a short-term boost, but at several tens of dollars per order it becomes difficult.

I want to be clear that I am not upset with you — I use your panel regularly, it has worked well for me overall, and I would like to keep using it going forward. I would just appreciate some action on this.

So, simply:

- **If the refill is queued and just needs more time, please tell me and I will wait.**
- **If it cannot be processed, please let me know and refund the affected orders.** I will re-order right away on whichever service you recommend.

Either answer works for me. I just need to know which one it is.

Thank you for your help.

---

## 참고 — 우리 쪽 사실관계 (보내지 마세요)

**실측 근거**
- 7/25 07:43 스캔 vs 7/26 02:43 스캔 (자동, 같은 방식)
- 우리 시스템이 7/25 02:14 리필 API 호출 → "Refill이 비활성화" 로 거부
- 1차 문의 후 그쪽이 "리필 등록했다"고 답변 → 24시간 무변화

**손실 규모**
- 이번 주 주문분 3,300명 중 2,556명 소멸(77%)
- 오늘 기준 총 부족분 2,787명

**뺀 내용(대표님 지시)**
- #3776 리필 버튼 작동 확인 요구 → 뺌
- #6816 이 카탈로그에 없다는 지적 → 뺌
  (환불 승인되면 그때 추천받아 재주문하겠다고만)

**답변 오면 할 일**
- 리필 실행 → 다음 스캔에서 자동 검증(어제/오늘 비교가 이미 돌아감)
- 환불 → 추천 서비스로 serviceIds.tk 교체 후 재주문
- 무응답 2~3일 → 서비스 교체, 3693 손절
