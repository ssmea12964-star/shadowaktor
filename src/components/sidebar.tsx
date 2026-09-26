"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FilePlus2, FileStack, ShieldPlus, ClipboardList, ScrollText,
  Radio, MessagesSquare, ListTodo
} from "lucide-react";
import type { ActorRole } from "@prisma/client";
import { isAdminRole } from "@/lib/roles";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard, admin: false },
  { href: "/dashboard/tasks", label: "Görevlerim", icon: ListTodo, admin: false },
  { href: "/dashboard/chat", label: "Aktör Sohbeti", icon: MessagesSquare, admin: false },
  { href: "/dashboard/reports", label: "Raporlarım", icon: FileStack, admin: false },
  { href: "/dashboard/reports/new", label: "Yeni Rapor", icon: FilePlus2, admin: false },
  { href: "/dashboard/admin/reports", label: "Raporları İncele", icon: ClipboardList, admin: true },
  { href: "/dashboard/admin/assign-scp", label: "Görev Ataması", icon: ShieldPlus, admin: true },
  { href: "/dashboard/admin/activity", label: "İşlem Geçmişi", icon: ScrollText, admin: true },
  { href: "/dashboard/admin/chat", label: "Sohbet Denetimi", icon: MessagesSquare, admin: true },
];

export function Sidebar({ role }: { role: ActorRole }) {
  const pathname = usePathname();
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/chat/unread", { cache: "no-store" });
        const data = await response.json();
        setChatUnread(data.unread ?? 0);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const admin = isAdminRole(role);

  return (
    <aside className="shadow-sidebar hidden w-64 shrink-0 border-r border-steel-800/70 bg-void-950/70 lg:flex lg:flex-col">
      <div className="sidebar-brand flex h-16 items-center gap-2 border-b border-steel-800/70 px-6">
        <Radio className="h-5 w-5 text-breach animate-pulse-glow" />
        <span className="font-display text-sm font-bold tracking-[0.15em] text-steel-100">SHADOW // PERSONEL</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.filter((item) => !item.admin || admin).map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "sidebar-nav-item group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                active
                  ? "sidebar-nav-active border border-secure/30 bg-secure/10 text-secure-glow"
                  : "border border-transparent text-steel-300 hover:bg-void-800/70 hover:text-steel-100",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-secure-glow" : "text-steel-400 group-hover:text-steel-100")} />
              {item.label}
              {item.href === "/dashboard/chat" && chatUnread > 0 && (
                <span className="ml-auto rounded-full bg-breach/20 px-1.5 py-0.5 text-[9px] font-bold text-breach-glow">
                  {chatUnread > 9 ? "9+" : chatUnread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer border-t border-steel-800/70 p-4">
        <p className="terminal-label uppercase">Erişim Seviyesi</p>
        <p className="mt-1 font-mono text-xs text-steel-400">{admin ? "SEVİYE 3 - YÖNETİM" : "SEVİYE 1 - SAHA"}</p>
      </div>
    </aside>
  );
}
