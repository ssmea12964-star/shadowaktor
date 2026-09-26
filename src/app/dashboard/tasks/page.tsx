import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTR } from "@/lib/utils";
import { CalendarDays, ShieldCheck, UserRound } from "lucide-react";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!session.user.role) redirect("/");

  const admin = isAdminRole(session.user.role);
  const assignments = await prisma.scpAssignment.findMany({
    where: admin ? {} : { actorId: session.user.id },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: { actor: true, assignedBy: true },
  });

  return (
    <div className="space-y-7">
      <div>
        <p className="terminal-label">GÖREV MERKEZİ</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-wide text-steel-100">
          {admin ? "SCP / Görev Takibi" : "Bana Atanan SCP Görevleri"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-steel-400">
          {admin
            ? "Tüm aktif görev atamalarını ve sorumlu personeli buradan takip edin."
            : "Yönetim tarafından size atanan görevlerin adı, zamanı ve talimatlarını buradan takip edin."}
        </p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-steel-700" />
            <p className="mt-4 text-sm text-steel-400">Size atanmış planlanmış bir görev bulunmuyor.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <Card key={assignment.id} className="overflow-hidden">
              <CardHeader className="border-b border-steel-800/70 bg-white/[0.015]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="terminal-label text-secure-glow">SCP / GÖREV</p>
                    <CardTitle className="mt-2">{assignment.scpName}</CardTitle>
                  </div>
                  <div className="rounded-lg border border-secure/20 bg-secure/5 p-2"><ShieldCheck className="h-5 w-5 text-secure-glow" /></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-steel-800 bg-void-900/50 p-3">
                    <p className="terminal-label">GÖREV ZAMANI</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-steel-200"><CalendarDays className="h-4 w-4 text-secure-glow" />{formatDateTR(assignment.scheduledAt)}</p>
                  </div>
                  <div className="rounded-xl border border-steel-800 bg-void-900/50 p-3">
                    <p className="terminal-label">PERSONEL</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-steel-200"><UserRound className="h-4 w-4 text-secure-glow" />{assignment.actor.username ?? assignment.actor.name ?? "Bilinmeyen"}</p>
                  </div>
                </div>
                {assignment.roleNote && (
                  <div className="rounded-xl border border-steel-800 bg-void-900/50 p-4">
                    <p className="terminal-label">GÖREV TALİMATI</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-steel-300">{assignment.roleNote}</p>
                  </div>
                )}
                <p className="font-mono text-[10px] text-steel-600">
                  Atayan: {assignment.assignedBy.username ?? assignment.assignedBy.name ?? "Bilinmeyen"} · Kayıt: {formatDateTR(assignment.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
