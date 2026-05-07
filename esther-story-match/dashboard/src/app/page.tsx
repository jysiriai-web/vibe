import { loadDashboardData } from '@/lib/data';
import StatsHeader from '@/components/StatsHeader';
import DayTabs from '@/components/DayTabs';

export default function Page() {
  const data = loadDashboardData();

  const totalConfirmed = data.days.reduce((s, d) => s + d.confirmed.length, 0);
  const byDay = data.days.map(d => ({ label: d.label, count: d.confirmed.length }));

  return (
    <div style={{ minHeight: '100vh' }}>
      <StatsHeader totalConfirmed={totalConfirmed} byDay={byDay} />
      <main className="max-w-6xl mx-auto px-8 py-12">
        <DayTabs days={data.days} />
      </main>
      <footer style={{ textAlign: 'center', paddingBottom: 48, fontSize: 11, color: '#d4cfc9', letterSpacing: '0.08em' }}>
        SIRIAI × 아이코닉무브먼트 · 에스더버니 팝업 2026
      </footer>
    </div>
  );
}
