import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lookupCompany } from "@/lib/codes";
import { getSegmentForCompany } from "@/lib/segments";
import ExperienceShell from "@/components/ExperienceShell";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const company = lookupCompany(decodeURIComponent(code));
  if (!company) return { title: "SiriAI" };
  return {
    title: `${company.brand} · SiriAI Creator Intelligence`,
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: Params) {
  const { code } = await params;
  const company = lookupCompany(decodeURIComponent(code));
  if (!company) notFound();

  const segment = getSegmentForCompany(company);
  // 클라이언트 컴포넌트로는 연락처(email 등)를 넘기지 않는다 — 개인화 화면이 쓰는 필드만.
  const publicCompany = {
    code: company.code,
    brand: company.brand,
    segment: company.segment,
    gubun: company.gubun,
  };
  return <ExperienceShell segment={segment} company={publicCompany} />;
}
