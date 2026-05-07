const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = '1REQ4hd4vz5fV24ttNAkyy7BQ4xYZ7dVPdO_OKW5TAd4';
const TARGET_GID = 591344173;
const CREDENTIALS_PATH = path.resolve(__dirname, '../google-credentials.json');

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function getSheetNameByGid(sheets, gid) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets.find(s => s.properties.sheetId === gid);
  if (!sheet) throw new Error(`GID ${gid} 에 해당하는 시트를 찾을 수 없습니다.`);
  return sheet.properties.title;
}

async function fetchMasterList() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const sheetName = await getSheetNameByGid(sheets, TARGET_GID);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) {
    console.warn('시트 데이터가 없거나 헤더만 있습니다.');
    return [];
  }

  const [headers, ...dataRows] = rows;

  const records = dataRows.map((row, i) => {
    const obj = {};
    headers.forEach((header, j) => {
      obj[header] = row[j] ?? '';
    });
    return obj;
  });

  return records;
}

// 직접 실행 시: 결과 출력 + data/master-snapshot.json 저장
if (require.main === module) {
  (async () => {
    try {
      console.log('시트에서 마스터 리스트 가져오는 중...');
      const records = await fetchMasterList();
      console.log(`총 ${records.length}명 로드 완료`);

      if (records.length > 0) {
        console.log('\n[컬럼 목록]');
        console.log(Object.keys(records[0]).join(', '));
        console.log('\n[첫 번째 행 샘플]');
        console.log(JSON.stringify(records[0], null, 2));
      }

      const outPath = path.resolve(__dirname, '../data/master-snapshot.json');
      fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');
      console.log(`\n스냅샷 저장: ${outPath}`);
    } catch (err) {
      console.error('오류:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { fetchMasterList };
