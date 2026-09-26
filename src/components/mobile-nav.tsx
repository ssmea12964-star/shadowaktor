"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Radio } from "lucide-react";
import type { ActorRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/roles";

const ITEMS = [
  ["/dashboard", "Genel Bakış"],
  ["/dashboard/tasks", "Görevlerim"],
  ["/dashboard/chat", "Aktör Sohbeti"],
  ["/dashboard/reports", "Raporlarım"],
  ["/dashboard/reports/new", "Yeni Rapor"],
  ["/dashboard/admin/reports", "Rapor İnceleme", true],
  ["/dashboard/admin/assign-scp", "Görev Ataması", true],
  ["/dashboard/admin/activity", "İşlem Geçmişi", true],
  ["/dashboard/admin/chat", "Sohbet Yönetimi", true],
] as const;

export function MobileNav({ role }: { role: ActorRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const admin = isAdminRole(role);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="lg:hidden">
      <button aria-label="Menüyü aç" onClick={() => setOpen(true)} className="mobile-menu-button"><Menu className="h-5 w-5" /></button>
      {open && (
        <div className="mobile-nav-overlay" onClick={() => setOpen(false)}>
          <aside className="mobile-nav-panel" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-steel-800/70 px-5 py-4">
              <div className="flex items-center gap-2"><Radio className="h-4 w-4 text-secure-glow" /><span className="font-display text-xs font-bold tracking-[.15em]">SHADOW // PERSONEL</span></div>
              <button aria-label="Menüyü kapat" onClick={() => setOpen(false)} className="chat-icon-button"><X className="h-4 w-4" /></button>
            </div>
            <nav className="space-y-1 p-3">
              {ITEMS.filter(([, , adminOnly]) => !adminOnly || admin).map(([href, label]) => (
                <Link key={href} href={href} className={cn("mobile-nav-item", pathname === href && "mobile-nav-item-active")}>{label}</Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
