"use server";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isTestCode, lookupCompany, normalizeCode } from "./codes";
import { getSegmentForCompany } from "./segments";
import { recordEntry } from "./access-log";

export interface VerifyResult {
  ok: boolean;
  code?: string;
  brand?: string;
  segmentLabel?: string;
  message?: string;
}

/** Validates an invite code without exposing the full registry to the client. */
export async function verifyCode(raw: string): Promise<VerifyResult> {
  const code = normalizeCode(raw ?? "");
  if (!code) return { ok: false, message: "코드를 입력해 주세요." };

  const company = lookupCompany(code);
  const ts = new Date().toISOString();

  if (!company) {
    // 오타/미등록 코드도 남긴다 — 부스에서 어떤 코드가 실패했는지 추적 가능
    await recordEntry({ ts, code, brand: "", segment: "", gubun: "", ok: false });
    return { ok: false, message: "확인되지 않는 코드입니다. 메일의 코드를 다시 확인해 주세요." };
  }

  const segment = getSegmentForCompany(company);
  await recordEntry({
    ts,
    code: company.code,
    brand: company.brand,
    segment: company.segment,
    gubun: company.gubun,
    ok: true,
    test: isTestCode(company.code),
  });

  return {
    ok: true,
    code: company.code,
    brand: company.brand,
    segmentLabel: segment.label,
  };
}

export interface InquiryResult {
  ok: boolean;
  message: string;
}

/** Captures an inquiry. Mock-persists to a local JSONL file; wire to Supabase/email for prod. */
export async function submitInquiry(formData: FormData): Promise<InquiryResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!name || !email) {
    return { ok: false, message: "이름과 이메일은 필수입니다." };
  }

  const record = {
    ts: new Date().toISOString(),
    code,
    company,
    name,
    email,
    message,
  };

  try {
    const dir = path.join(process.cwd(), ".leads");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "inquiries.jsonl"), JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Non-fatal: serverless filesystems are ephemeral. Replace with Supabase insert / email send.
  }

  // eslint-disable-next-line no-console
  console.log("[inquiry]", record);

  return { ok: true, message: "접수되었습니다. 영업일 기준 1일 내 회신드리겠습니다." };
}
