import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { SystemStatus } from "@/components/system-status";
import { formatDateTR } from "@/lib/utils";
import { FileStack, ShieldCheck, Clock3, ArrowUpRight, MessageSquare, Users, ShieldPlus } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!session.user.role) redirect("/");

  const userId = session.user.id;
  const admin = isAdminRole(session.user.role);
  const scopeWhere = admin ? {} : { authorId: userId };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recentReports, pendingCount, totalReports, approvedCount, upcomingAssignments, recentActivities, activeActors, unreadNotifications] = await Promise.all([
    prisma.report.findMany({ where: scopeWhere, orderBy: { createdAt: "desc" }, take: 5, include: { author: true } }),
    prisma.report.count({ where: { ...scopeWhere, status: "BEKLEMEDE" } }),
    prisma.report.count({ where: scopeWhere }),
    prisma.report.count({ where: { ...scopeWhere, status: "ONAYLANDI" } }),
    prisma.scpAssignment.findMany({
      where: { scheduledAt: { gte: new Date() }, ...(admin ? {} : { actorId: userId }) },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { actor: true },
    }),
    admin
      ? prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: true, targetUser: true } })
      : Promise.resolve([]),
    prisma.user.count({ where: { role: { not: null }, lastSeenAt: { gte: since } } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const dbConfigured = Boolean(process.env.DATABASE_URL);
  const webhookConfigured = Boolean(process.env.DISCORD_LOG_WEBHOOK_URL);

  return (
    <div className="space-y-7">
      <section className="dashboard-hero">
        <div>
          <p className="section-eyebrow">PERSONEL PANELİ</p>
          <h1 className="font-display text-2xl font-bold tracking-wide text-steel-100 sm:text-3xl">GENEL BAKIŞ</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-steel-300">
            Hoş geldin, {session.user.name ?? "Aktör"}. Raporlarını, sana atanan SCP görevlerini ve ekip içi iletişimi buradan takip et.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Link href="/dashboard/reports/new" className="product-primary-button">Yeni Rapor <ArrowUpRight className="h-4 w-4" /></Link>
          <Link href="/dashboard/chat" className="product-secondary-button"><MessageSquare className="h-4 w-4" /> Sohbete Git</Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileStack} label={admin ? "Toplam Rapor" : "Raporlarım"} value={totalReports} accent="secure" />
        <StatCard icon={Clock3} label="Beklemede" value={pendingCount} accent="amber" />
        <StatCard icon={ShieldCheck} label="Onaylanan" value={approvedCount} accent="secure" />
        <StatCard icon={Users} label="Aktif Personel" value={activeActors} accent="breach" />
      </div>

      {admin && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_.65fr]">
          <Card className="dashboard-feature-card">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><p className="section-eyebrow">YÖNETİM DENETİMİ</p><CardTitle className="mt-2">Son İşlemler</CardTitle></div>
              <Link href="/dashboard/admin/activity" className="terminal-label text-secure-glow hover:underline">İŞLEM GEÇMİŞİ</Link>
            </CardHeader>
            <CardContent>
              <div className="activity-timeline">
                {recentActivities.length
                  ? recentActivities.map((log) => (
                    <div className="activity-timeline-item" key={log.id}>
                      <span className="activity-timeline-dot" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-steel-100">{log.message}</span>
                          <span className="font-mono text-[10px] text-steel-500">{formatDateTR(log.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-steel-400">{log.actor.username ?? log.actor.name ?? "Bilinmeyen"}{log.targetUser ? ` · ${log.targetUser.username ?? log.targetUser.name ?? "Bilinmeyen"}` : ""}</p>
                      </div>
                    </div>
                  ))
                  : <p className="py-8 text-center text-sm text-steel-400">Henüz işlem kaydı bulunmuyor.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><p className="section-eyebrow">SİSTEM</p><CardTitle className="mt-2">Sistem Durumu</CardTitle></CardHeader>
            <CardContent>
              <SystemStatus databaseConfigured={dbConfigured} webhookConfigured={webhookConfigured} />
              <div className="mt-4 rounded-lg border border-steel-800/70 bg-void-900/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-steel-300">Okunmamış bildirim</span>
                  <span className="font-display text-lg font-bold text-steel-100">{unreadNotifications}</span>
                </div>
                <Link href="/dashboard/chat" className="mt-3 flex items-center gap-2 text-xs text-secure-glow hover:underline"><MessageSquare className="h-3.5 w-3.5" /> Sohbete git</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{admin ? "Son Raporlar" : "Son Raporlarım"}</CardTitle>
            <Link href="/dashboard/reports" className="terminal-label text-secure-glow hover:underline">TÜM RAPORLAR</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReports.length
              ? recentReports.map((report) => (
                <div key={report.id} className="dashboard-list-row flex items-center justify-between rounded-md border border-steel-800/70 bg-void-900/50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-steel-100">{report.scpOrRoleName}</p>
                    <p className="font-mono text-[11px] text-steel-400">{admin ? `${report.author.username ?? "Bilinmeyen"} · ` : ""}{formatDateTR(report.createdAt)}</p>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
              ))
              : <p className="text-sm text-steel-400">Henüz kayıtlı rapor bulunmuyor.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{admin ? "Yaklaşan Görevler" : "Bana Atanan Görevler"}</CardTitle>
            <Link href="/dashboard/tasks" className="terminal-label text-secure-glow hover:underline">TÜM GÖREVLER</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingAssignments.length
              ? upcomingAssignments.map((assignment) => (
                <div key={assignment.id} className="dashboard-list-row flex items-center justify-between rounded-md border border-steel-800/70 bg-void-900/50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-steel-100">{assignment.scpName}</p>
                    <p className="font-mono text-[11px] text-steel-400">{admin ? (assignment.actor.username ?? "Bilinmeyen") : "Size atandı"}</p>
                  </div>
                  <p className="shrink-0 font-mono text-xs text-secure-glow">{formatDateTR(assignment.scheduledAt)}</p>
                </div>
              ))
              : <p className="text-sm text-steel-400">Planlanmış bir görev bulunmuyor.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: "secure" | "breach" | "amber" }) {
  const accentClasses = accent === "secure"
    ? "text-secure-glow border-secure/30 bg-secure/5"
    : accent === "breach"
      ? "text-breach-glow border-breach/30 bg-breach/5"
      : "text-amber border-amber/30 bg-amber/5";
  return <div className={`dashboard-stat-card glass-panel flex items-center gap-4 border p-5 ${accentClasses}`}><div className={`rounded-md border p-2.5 ${accentClasses}`}><Icon className="h-5 w-5" /></div><div><p className="font-display text-2xl font-bold text-steel-100">{value}</p><p className="terminal-label">{label}</p></div></div>;
}
