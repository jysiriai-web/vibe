# 레퍼런스 케이스 이미지 드롭 폴더

크리에이터 콘텐츠 영역의 "레퍼런스" 뷰어에 뜨는 이미지입니다.
아래 **파일명 그대로** 이 폴더(`V3/public/assets/ref/`)에 저장하면 자동으로 노출됩니다.
(파일이 없으면 브랜드명 + "이미지 준비 중" 플레이스홀더가 뜹니다.)

| 파일명             | 브랜드        | 비고                         |
| ------------------ | ------------- | ---------------------------- |
| `oddtype.png`      | ODDTYPE       | 붙여준 reels 그리드 1번째     |
| `29apostrophe.png` | 29apostrophe  | 붙여준 reels 그리드 2번째     |
| `forhz.png`        | forhz         | 붙여준 reels 그리드 3번째     |

- 형식: png/jpg/webp 아무거나 (확장자가 다르면 `content.js`의 `references[].src`만 맞춰주세요)
- 비율: 가로형(대략 16:9~2:1) 권장. 딥잉크 프레임에 `object-fit: contain`이라 잘리지 않습니다.
- 케이스를 더 추가/교체하려면 `src/content.js`의 influencer `references` 배열을 수정하세요.
