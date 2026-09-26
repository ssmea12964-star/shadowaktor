"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, roleRank } from "@/lib/roles";
import type { ActorRole } from "@prisma/client";
import { cn, formatDateTR } from "@/lib/utils";
import { DirectMessages } from "@/components/direct-messages";
import { playNotificationSound } from "@/lib/notification-sound";
import {
  ArrowDown, ChevronDown, FileImage, Film, ImagePlus, Laugh, Link2, Megaphone,
  MessageCircle, Moon, Pin, PinOff, Search, Send, Shield, Smile, Sun, Trash2,
  UserRound, Users, VolumeX, Volume2, Wifi, X
} from "lucide-react";

type Member = {
  id: string;
  discordId: string;
  name: string | null;
  username: string | null;
  image: string | null;
  role: ActorRole | null;
  lastSeenAt: string | Date | null;
  createdAt: string | Date;
  mutedUntil?: string | Date | null;
  online?: boolean;
};

type Message = {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  author: Member;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdBy: { name: string | null; username: string | null; role: ActorRole | null };
};

type Emoji = { id: string; name: string; animated: boolean; url: string };
type Gif = { id: string; title: string; preview: string | null; url: string };

const QUICK_EMOJIS = ["😀","😂","😍","😎","🥳","😅","🤝","👏","🔥","❤️","💀","👀","✅","❌","⚠️","🛡️","🔒","📌","🎯","🧪","☕","🚨","🫡","👍"];

function displayName(member: Member) {
  return member.name || member.username || "Bilinmeyen Aktör";
}
function initials(member: Member) {
  return displayName(member).slice(0, 2).toUpperCase();
}
function activeMute(member: Member | null) {
  if (!member?.mutedUntil) return false;
  return new Date(member.mutedUntil).getTime() > Date.now();
}

function renderRichText(content: string, emojis: Emoji[]) {
  const parts = content.split(/(<a?:[A-Za-z0-9_]+:\d+>)/g);
  return parts.map((part, index) => {
    const match = part.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
    if (!match) return <span key={index}>{part}</span>;
    const emoji = emojis.find((item) => item.id === match[2]);
    return emoji
      ? <img key={index} src={emoji.url} alt={`:${match[1]}:`} title={`:${match[1]}:`} className="inline-block h-5 w-5 align-text-bottom" />
      : <span key={index}>{part}</span>;
  });
}

export function ActorChat({ currentUserId, isAdmin }: { currentUserId: string; isAdmin: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [directUnread, setDirectUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Member | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string; size: number } | null>(null);
  const [muteMinutes, setMuteMinutes] = useState("60");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [discordEmojis, setDiscordEmojis] = useState<Emoji[]>([]);
  const [light, setLight] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [directTarget, setDirectTarget] = useState<Member | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);
  const previousMessageCount = useRef(0);
  const cloudinaryConfig = useRef<{ cloudName: string; uploadPreset: string } | null>(null);

  useEffect(() => {
    try {
      setLight(localStorage.getItem("shadow-chat-theme") === "light");
      setSoundEnabled(localStorage.getItem("shadow-chat-sounds") !== "off");
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("shadow-chat-sounds", soundEnabled ? "on" : "off"); } catch {}
  }, [soundEnabled]);
  useEffect(() => {
    try { localStorage.setItem("shadow-chat-theme", light ? "light" : "dark"); } catch {}
  }, [light]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sohbet verileri alınamadı.");
      setMessages(data.messages ?? []);
      setMembers(data.members ?? []);
      setAnnouncements(data.announcements ?? []);
      setSelected((current) => current ? (data.members ?? []).find((m: Member) => m.id === current.id) ?? null : null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet bağlantısı kurulamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/chat/read", { method: "POST" }).catch(() => {});
    fetch("/api/chat/emojis", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setDiscordEmojis(d.emojis ?? [])).catch(() => {});
    fetch("/api/chat/direct/unread", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setDirectUnread(d.unread ?? {})).catch(() => {});
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const count = messages.length;
    if (firstLoad.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      firstLoad.current = false;
      previousMessageCount.current = count;
      return;
    }
    if (count > previousMessageCount.current && soundEnabled) {
      const latest = messages[messages.length - 1];
      if (latest && latest.authorId !== currentUserId) playNotificationSound(latest.content.includes("@") ? "mention" : "message");
    }
    if (count > previousMessageCount.current && !nearBottom) {
      setNewMessageCount((value) => value + (count - previousMessageCount.current));
    }
    if (count > previousMessageCount.current && nearBottom) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
    previousMessageCount.current = count;
  }, [messages, nearBottom, soundEnabled, currentUserId]);

  const handleScroll = () => {
    const node = messageScrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
    setNearBottom(atBottom);
    if (atBottom) setNewMessageCount(0);
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLocaleLowerCase("tr-TR");
    return [...members]
      .filter((member) =>
        !q ||
        `${displayName(member)} ${member.username ?? ""} ${member.role ? ROLE_LABELS[member.role] : ""}`
          .toLocaleLowerCase("tr-TR").includes(q),
      )
      .sort((a, b) =>
        Number(b.online) - Number(a.online) ||
        roleRank(b.role) - roleRank(a.role) ||
        displayName(a).localeCompare(displayName(b), "tr"),
      );
  }, [members, memberSearch]);

  const filteredMessages = useMemo(() => {
    const q = messageSearch.trim().toLocaleLowerCase("tr-TR");
    if (!q) return messages;
    return messages.filter((message) =>
      `${message.content} ${displayName(message.author)} ${message.author.username ?? ""}`
        .toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [messages, messageSearch]);

  const pinnedMessages = useMemo(
    () => messages.filter((message) => message.pinnedAt && !message.deletedAt).reverse(),
    [messages],
  );

  async function uploadFile(file: File) {
    const maxBytes = 100 * 1024 * 1024;
    const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || file.type === "application/pdf" || file.type === "text/plain";
    if (!allowed) {
      setError("Bu dosya türü desteklenmiyor. Görsel, GIF, video, ses, PDF veya TXT seçebilirsin.");
      return;
    }
    if (file.size > maxBytes) {
      setError("Dosya en fazla 100 MB olabilir.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      if (!cloudinaryConfig.current) {
        const configResponse = await fetch("/api/chat/upload", { cache: "no-store" });
        const config = await configResponse.json();
        if (!configResponse.ok) throw new Error(config.error || "Dosya servisi yapılandırılamadı.");
        cloudinaryConfig.current = config;
      }

      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", cloudinaryConfig.current.uploadPreset);
      form.append("folder", "shadow-roleplay/chat");
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.current.cloudName}/auto/upload`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok || !data.secure_url) throw new Error(data.error?.message || "Dosya yüklenemedi.");
      setAttachment({ url: data.secure_url, name: file.name, type: file.type, size: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya yüklenemedi.");
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage() {
    const value = content.trim();
    if ((!value && !attachment) || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: value,
          ...(attachment
            ? {
                attachmentUrl: attachment.url,
                attachmentName: attachment.name,
                attachmentType: attachment.type,
                attachmentSize: attachment.size || undefined,
              }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mesaj gönderilemedi.");
      setMessages((current) => [...current, data.message]);
      setContent("");
      setAttachment(null);
      setShowEmoji(false);
      setShowGifs(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  async function moderate(message: Message, action: "pin" | "unpin" | "delete") {
    const response = await fetch("/api/chat/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, messageId: message.id }),
    });
    if (response.ok) await load();
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) return;
    const response = await fetch(`/api/chat/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Duyuru silinemedi.");
      return;
    }
    setAnnouncements((current) => current.filter((announcement) => announcement.id !== id));
  }

  async function muteSelected() {
    if (!selected || selected.id === currentUserId || moderating) return;
    const minutes = Number(muteMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 52560000) {
      setError("Susturma süresi 1 ile 52.560.000 dakika arasında olmalı.");
      return;
    }
    setModerating(true);
    setError("");
    try {
      const response = await fetch("/api/chat/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mute", userId: selected.id, minutes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kullanıcı susturulamadı.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Susturma işlemi başarısız.");
    } finally {
      setModerating(false);
    }
  }

  async function unmuteSelected() {
    if (!selected || selected.id === currentUserId || moderating) return;
    setModerating(true);
    setError("");
    try {
      const response = await fetch("/api/chat/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unmute", userId: selected.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Susturma kaldırılamadı.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Susturma kaldırma işlemi başarısız.");
    } finally {
      setModerating(false);
    }
  }

  async function searchGifs() {
    if (!gifQuery.trim()) return;
    try {
      const response = await fetch(`/api/chat/gifs?q=${encodeURIComponent(gifQuery.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "GIF araması başarısız.");
      setGifs(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GIF araması başarısız.");
    }
  }

  function insertText(value: string) {
    setContent((current) => `${current}${value}`.slice(0, 1000));
  }

  function selectGif(gif: Gif) {
    setAttachment({
      url: gif.url,
      name: gif.title || "GIF",
      type: "image/gif",
      size: 0,
    });
    setShowGifs(false);
  }

  return (
    <div className={cn("actor-chat-shell space-y-5", light && "actor-chat-light")}>
      <div className="chat-page-heading flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-secure-glow" />
            <p className="terminal-label text-secure-glow">SHADOW // İLETİŞİM</p>
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-wide text-steel-100">Aktör Sohbeti</h1>
          <p className="mt-1 text-sm text-steel-400">Genel iletişim, duyurular ve personel arası özel mesajlaşma.</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="chat-secure-status"><span className="status-dot bg-secure animate-pulse-glow" /> Güvenli iletişim</span>
        </div>
      </div>

      <div className="chat-frame grid min-h-[720px] overflow-hidden rounded-2xl border border-steel-800/80 bg-void-950/80 shadow-glass-edge lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="chat-roster border-b border-steel-800/70 bg-void-950/90 lg:border-b-0 lg:border-r">
          <div className="border-b border-steel-800/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-sm font-semibold text-steel-100">Aktör Kadrosu</p>
                <p className="mt-0.5 font-mono text-[10px] text-steel-500">{members.length} PERSONEL · ÖZEL MESAJ AÇIK</p>
              </div>
              <div className="rounded-lg border border-secure/30 bg-secure/5 p-2 text-secure-glow"><Users className="h-4 w-4" /></div>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-steel-500" />
              <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Personel ara..." className="pl-9" />
            </div>
          </div>
          <div className="max-h-[580px] overflow-y-auto p-2">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelected(member)}
                className="chat-member-row group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all"
              >
                <div className="relative shrink-0">
                  {member.image
                    ? <img src={member.image} alt="" className="h-10 w-10 rounded-lg border border-steel-700 object-cover" />
                    : <div className="grid h-10 w-10 place-items-center rounded-lg border border-steel-700 bg-void-800 font-mono text-xs text-steel-300">{initials(member)}</div>}
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-void-950",
                    member.online ? "bg-secure" : "bg-steel-600",
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-steel-100">{displayName(member)}</p>
                  <p className="truncate text-[11px] text-steel-500">
                    {member.role ? ROLE_LABELS[member.role] : "Personel"}{activeMute(member) ? " · Susturuldu" : ""}
                  </p>
                </div>
                {directUnread[member.id] ? (
                  <span className="min-w-5 rounded-full bg-secure/15 px-1.5 py-0.5 text-center text-[9px] font-bold text-secure-glow">
                    {directUnread[member.id] > 9 ? "9+" : directUnread[member.id]}
                  </span>
                ) : <MessageCircle className="h-3.5 w-3.5 shrink-0 text-steel-700 transition group-hover:text-secure-glow" />}
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-main flex min-w-0 flex-col bg-[#080b0d]/90">
          <header className="chat-header relative flex min-h-[72px] items-center justify-between border-b border-steel-800/70 px-4 sm:px-5">
            <div className="sr-only" aria-live="polite">{soundEnabled ? "Bildirim sesleri açık" : "Bildirim sesleri kapalı"}</div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.22em] text-steel-500">GENEL İLETİŞİM KANALI</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="font-display text-base font-semibold text-steel-100"># aktör-sohbet</h2>
                <span className="chat-channel-dot" />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {searchOpen && <div className="hidden w-52 sm:block chat-search-pop">
                <Input autoFocus value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Sohbette ara..." className="h-9" />
              </div>}
              <IconButton label="Sohbette ara" onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setMessageSearch(""); }} active={searchOpen}><Search className="h-4 w-4" /></IconButton>
              <IconButton label="Sabitlenmiş mesajlar" onClick={() => setShowPinned(true)} active={pinnedMessages.length > 0}><Pin className="h-4 w-4" /></IconButton>
              <IconButton label={soundEnabled ? "Bildirim sesini kapat" : "Bildirim sesini aç"} onClick={() => setSoundEnabled((v) => !v)}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</IconButton>
              <IconButton label={light ? "Koyu temaya geç" : "Açık temaya geç"} onClick={() => setLight((v) => !v)}>{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</IconButton>
            </div>
          </header>

          {messageSearch.trim() && (
            <div className="chat-search-banner flex items-center justify-between border-b border-steel-800/70 px-5 py-2.5 text-[11px] text-steel-400">
              <span><strong className="text-steel-200">{filteredMessages.length}</strong> mesaj bulundu</span>
              <button onClick={() => { setMessageSearch(""); setSearchOpen(false); }} className="text-steel-500 transition hover:text-steel-100"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {announcements.length > 0 && (
            <div className="chat-announcement border-b border-amber-900/40 bg-amber-950/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-300">
                  <Megaphone className="h-4 w-4" />
                  <span className="terminal-label text-amber-300">YÖNETİM DUYURULARI</span>
                </div>
                <span className="text-[10px] text-steel-600">{announcements.length} aktif</span>
              </div>
              <div className="mt-3 space-y-2">
                {announcements.slice(0, 5).map((announcement) => (
                  <div key={announcement.id} className="rounded-xl border border-amber-900/40 bg-void-950/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-steel-100">{announcement.title}</p>
                        <p className="mt-1 text-[10px] text-steel-600">
                          {announcement.createdBy.username ?? announcement.createdBy.name ?? "Yönetim"} · {formatDateTR(announcement.createdAt)}
                        </p>
                      </div>
                      {isAdmin && (
                        <button onClick={() => deleteAnnouncement(announcement.id)} className="chat-action-btn chat-danger shrink-0">
                          <Trash2 className="inline h-3 w-3" /> Sil
                        </button>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-steel-400">{announcement.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={messageScrollRef} onScroll={handleScroll} className="chat-message-list relative flex-1 space-y-1 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="chat-loading py-16 text-center"><div className="chat-loader mx-auto" /><p className="mt-4 text-sm text-steel-500">Sohbet yükleniyor...</p></div>
            ) : filteredMessages.length === 0 ? (
              <div className="grid h-full min-h-[450px] place-items-center text-center">
                <div>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-steel-800 bg-void-900 text-steel-600"><MessageCircle className="h-6 w-6" /></div>
                  <p className="mt-4 font-medium text-steel-300">{messageSearch ? "Eşleşen mesaj bulunamadı." : "Henüz mesaj yok."}</p>
                  <p className="mt-1 text-xs text-steel-500">{messageSearch ? "Arama ifadesini değiştirerek tekrar deneyebilirsin." : "Aktör kadrosu için ilk mesajı sen bırak."}</p>
                </div>
              </div>
            ) : filteredMessages.map((message, index) => {
              const sameAuthor = index > 0 && filteredMessages[index - 1]?.authorId === message.author.id;
              return (
                <div key={message.id} className={cn("chat-message-enter group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.018]", sameAuthor && "pt-0")}>
                  {!sameAuthor
                    ? message.author.image
                      ? <img src={message.author.image} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-steel-700 object-cover" />
                      : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-steel-700 bg-void-800 font-mono text-[10px] text-steel-300">{initials(message.author)}</div>
                    : <div className="w-9 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    {!sameAuthor && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setSelected(message.author)} className="font-medium text-steel-100 transition-colors hover:text-secure-glow">{displayName(message.author)}</button>
                        {message.author.role && <RoleBadge role={message.author.role} />}
                        <span className="font-mono text-[10px] text-steel-600">{formatDateTR(message.createdAt)}</span>
                      </div>
                    )}
                    <div className="flex flex-col items-start gap-2">
                      {message.content && <p className={cn("whitespace-pre-wrap break-words text-sm leading-6", message.deletedAt ? "italic text-steel-600" : "text-steel-300")}>{renderRichText(message.content, discordEmojis)}</p>}
                      {message.attachmentUrl && !message.deletedAt && (
                        <div className="max-w-xl overflow-hidden rounded-xl border border-steel-800 bg-void-900">
                          {message.attachmentType?.startsWith("image/")
                            ? <img src={message.attachmentUrl} alt={message.attachmentName ?? "Ek dosya"} className="max-h-96 w-full object-contain" />
                            : message.attachmentType?.startsWith("video/")
                              ? <video src={message.attachmentUrl} controls preload="metadata" className="max-h-96 w-full bg-black" />
                              : message.attachmentType?.startsWith("audio/")
                                ? <div className="p-3"><p className="mb-2 truncate text-xs text-steel-300">{message.attachmentName ?? "Ses dosyası"}</p><audio src={message.attachmentUrl} controls className="w-full" /></div>
                                : <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 text-xs text-steel-300 hover:text-secure-glow"><FileImage className="h-5 w-5" />{message.attachmentName ?? "Dosyayı aç"}</a>}
                          <div className="border-t border-steel-800 px-3 py-1.5 text-[9px] text-steel-600">{message.attachmentName ?? "Medya"}{message.attachmentSize ? ` · ${(message.attachmentSize / 1024 / 1024).toFixed(1)} MB` : ""}</div>
                        </div>
                      )}
                      {message.pinnedAt && <Pin className="h-3.5 w-3.5 text-amber-400" />}
                    </div>
                    {isAdmin && !message.deletedAt && (
                      <div className="mt-1 hidden gap-1 group-hover:flex">
                        <button onClick={() => moderate(message, message.pinnedAt ? "unpin" : "pin")} className="chat-action-btn">
                          {message.pinnedAt ? <PinOff className="inline h-3 w-3" /> : <Pin className="inline h-3 w-3" />} {message.pinnedAt ? "Sabitlemeyi kaldır" : "Sabitle"}
                        </button>
                        <button onClick={() => moderate(message, "delete")} className="chat-action-btn chat-danger"><Trash2 className="inline h-3 w-3" /> Sil</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
            {!nearBottom && (
              <button onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); setNewMessageCount(0); }} className="chat-jump-button" aria-label="En yeni mesaja git">
                <ArrowDown className="h-4 w-4" />{newMessageCount > 0 && <span>{newMessageCount > 9 ? "9+" : newMessageCount} yeni</span>}<ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            )}
          </div>

          <div className="chat-composer-wrap border-t border-steel-800/70 p-4">
            {error && <p className="mb-2 text-xs text-breach-glow">{error}</p>}
            {attachment && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-secure/20 bg-secure/[0.04] p-2">
                <img src={attachment.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate text-xs text-steel-200">{attachment.name}</p><p className="text-[10px] text-steel-600">Gönderilmeye hazır</p></div>
                <button onClick={() => setAttachment(null)} className="chat-icon-button"><X className="h-4 w-4" /></button>
              </div>
            )}

            <div className="relative">
              {(showEmoji || showGifs) && (
                <div className="absolute bottom-14 left-0 z-30 w-full max-w-md rounded-2xl border border-steel-700 bg-void-950 p-3 shadow-2xl">
                  {showEmoji && (
                    <div>
                      <div className="mb-2 flex items-center justify-between"><p className="terminal-label">EMOJİLER</p><button onClick={() => setShowEmoji(false)}><X className="h-4 w-4 text-steel-500" /></button></div>
                      <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
                        {QUICK_EMOJIS.map((emoji) => <button key={emoji} onClick={() => insertText(emoji)} className="rounded-lg p-2 text-lg hover:bg-white/5">{emoji}</button>)}
                        {discordEmojis.map((emoji) => <button key={emoji.id} title={`:${emoji.name}:`} onClick={() => insertText(`<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`)} className="rounded-lg p-1 hover:bg-white/5"><img src={emoji.url} alt={emoji.name} className="mx-auto h-6 w-6" /></button>)}
                      </div>
                    </div>
                  )}
                  {showGifs && (
                    <div>
                      <div className="flex items-center gap-2">
                        <Input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchGifs()} placeholder="GIF ara..." className="h-9" />
                        <Button onClick={searchGifs} size="sm">Ara</Button>
                      </div>
                      <div className="mt-3 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
                        {gifs.map((gif) => <button key={gif.id} onClick={() => selectGif(gif)} className="overflow-hidden rounded-lg border border-steel-800 hover:border-secure/50"><img src={gif.preview || gif.url} alt={gif.title} className="h-24 w-full object-cover" /></button>)}
                      </div>
                      {gifs.length === 0 && <p className="py-5 text-center text-xs text-steel-600">Arama yaparak GIF seç.</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="chat-composer flex items-end gap-2 rounded-xl border border-steel-700 bg-void-900 p-2 transition-all focus-within:border-secure/50 focus-within:shadow-[0_0_0_3px_rgba(81,191,124,0.06)]">
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-matroska,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,application/pdf,text/plain" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadFile(file); e.currentTarget.value = ""; }} />
                <div className="flex items-center gap-1">
                  <IconButton label="Medya / dosya yükle" onClick={() => fileInputRef.current?.click()}>{uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-steel-600 border-t-secure" /> : <ImagePlus className="h-4 w-4" />}</IconButton>
                  <IconButton label="Emoji" active={showEmoji} onClick={() => { setShowEmoji((v) => !v); setShowGifs(false); }}><Smile className="h-4 w-4" /></IconButton>
                  <IconButton label="GIF ara" active={showGifs} onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); }}><Film className="h-4 w-4" /></IconButton>
                </div>
                <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 1000))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder="Mesajını yaz..." rows={2} className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-steel-100 outline-none placeholder:text-steel-600" />
                <Button onClick={() => void sendMessage()} disabled={sending || uploading || (!content.trim() && !attachment)} size="icon" className="h-10 w-10 rounded-lg"><Send className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-steel-600">Enter gönderir · Shift + Enter yeni satır · Resim / GIF / emoji desteklenir</p>
              <p className={cn("font-mono text-[10px]", content.length > 900 ? "text-amber-400" : "text-steel-600")}>{content.length}/1000</p>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={showPinned} onOpenChange={setShowPinned}>
        <DialogContent className="chat-dialog max-w-2xl border-steel-700 bg-void-950/95">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pin className="h-4 w-4 text-amber-400" /> Sabitlenen Mesajlar</DialogTitle><DialogDescription>Yönetim tarafından öne çıkarılan önemli mesajlar.</DialogDescription></DialogHeader>
          <div className="mt-2 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {pinnedMessages.length === 0
              ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-steel-800 bg-void-900/50 text-center"><div><Pin className="mx-auto h-6 w-6 text-steel-600" /><p className="mt-3 text-sm text-steel-400">Henüz sabitlenmiş mesaj yok.</p></div></div>
              : pinnedMessages.map((message) => (
                <div key={message.id} className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-4">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-steel-100">{displayName(message.author)}</p><p className="text-[10px] text-steel-600">{formatDateTR(message.createdAt)}</p></div><Pin className="h-4 w-4 text-amber-400" /></div>
                  {message.content && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-steel-300">{renderRichText(message.content, discordEmojis)}</p>}
                  {message.attachmentUrl && <img src={message.attachmentUrl} alt="" className="mt-3 max-h-52 rounded-lg object-contain" />}
                  <div className="mt-3 flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-amber-400/70">Önemli mesaj</span>{isAdmin && <button onClick={() => void moderate(message, "unpin")} className="chat-action-btn"><PinOff className="inline h-3 w-3" /> Kaldır</button>}</div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="chat-dialog max-w-lg border-steel-700 bg-void-950/95">
          {selected && <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selected.image ? <img src={selected.image} alt="" className="h-14 w-14 rounded-xl border border-steel-700 object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-xl border border-steel-700 bg-void-800 text-sm font-mono">{initials(selected)}</div>}
                <span>{displayName(selected)}</span>
              </DialogTitle>
              <DialogDescription>Shadow Roleplay aktörlük personel profili</DialogDescription>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-steel-800 bg-void-900/70 p-4">
                <div><p className="terminal-label">RÜTBE</p><div className="mt-2">{selected.role ? <RoleBadge role={selected.role} /> : <span className="text-sm text-steel-500">Tanımsız</span>}</div></div>
                <div className="text-right"><p className="terminal-label">DURUM</p><p className={cn("mt-2 text-xs font-medium", selected.online ? "text-secure-glow" : "text-steel-500")}>{selected.online ? "ÇEVRİMİÇİ" : "ÇEVRİMDIŞI"}</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info icon={UserRound} label="Kullanıcı" value={selected.username ? `@${selected.username}` : "—"} />
                <Info icon={Shield} label="Discord ID" value={selected.discordId} />
                <Info icon={Users} label="Kadro" value={selected.role ? ROLE_LABELS[selected.role] : "Tanımsız"} />
                <Info icon={Wifi} label="Kayıt Tarihi" value={formatDateTR(selected.createdAt)} />
              </div>
              {selected.role && <div className="rounded-xl border border-steel-800 bg-void-900/70 p-4"><p className="terminal-label">GÖREV TANIMI</p><p className="mt-2 text-sm leading-6 text-steel-300">{ROLE_DESCRIPTIONS[selected.role]}</p></div>}

              {selected.id !== currentUserId && (
                <Button className="w-full gap-2" onClick={() => { setDirectTarget(selected); setSelected(null); setDirectUnread((current) => ({ ...current, [selected.id]: 0 })); }}>
                  <MessageCircle className="h-4 w-4" /> Özel Mesaj Gönder
                </Button>
              )}

              {isAdmin && selected.id !== currentUserId && (
                <div className="space-y-3 rounded-xl border border-red-950/60 bg-red-950/10 p-4">
                  <div className="flex items-center gap-2"><VolumeX className="h-4 w-4 text-breach-glow" /><p className="terminal-label text-breach-glow">SOHBET SUSTURMA</p></div>
                  {activeMute(selected) ? <>
                    <p className="text-xs text-steel-400">Aktif susturma: <span className="text-steel-200">{formatDateTR(selected.mutedUntil!)}</span> tarihine kadar.</p>
                    <Button variant="outline" className="w-full border-secure/30 text-secure-glow" onClick={() => void unmuteSelected()} disabled={moderating}><Volume2 className="h-4 w-4" /> {moderating ? "İşleniyor..." : "Susturmayı Kaldır"}</Button>
                  </> : <>
                    <div className="grid grid-cols-3 gap-2">
                      {[10, 30, 60, 180, 360, 1440].map((minutes) => (
                        <button key={minutes} type="button" onClick={() => setMuteMinutes(String(minutes))} className={cn("rounded-lg border px-2 py-2 text-[11px] transition", muteMinutes === String(minutes) ? "border-breach/70 bg-breach/10 text-breach-glow" : "border-steel-800 bg-void-900 text-steel-400 hover:border-steel-600 hover:text-steel-200")}>
                          {minutes < 60 ? `${minutes} dk` : minutes < 1440 ? `${minutes / 60} saat` : "1 gün"}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2"><Input type="number" min={1} max={52560000} value={muteMinutes} onChange={(e) => setMuteMinutes(e.target.value)} placeholder="Dakika" /><Button onClick={() => void muteSelected()} disabled={moderating || !muteMinutes}>{moderating ? "İşleniyor..." : "Sustur"}</Button></div>
                    <p className="text-[10px] text-steel-600">Özel süre için dakika gir. En fazla 52.560.000 dakika kullanılabilir.</p>
                  </>}
                </div>
              )}
            </div>
          </>}
        </DialogContent>
      </Dialog>

      <DirectMessages
        currentUserId={currentUserId}
        target={directTarget}
        open={!!directTarget}
        onOpenChange={(open) => { if (!open) setDirectTarget(null); }}
      />
    </div>
  );
}

function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return <button title={label} aria-label={label} onClick={onClick} className={cn("chat-icon-button", active && "chat-icon-active")}>{children}</button>;
}
function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="rounded-xl border border-steel-800 bg-void-900/50 p-3"><div className="flex items-center gap-2 text-steel-500"><Icon className="h-3.5 w-3.5" /><span className="terminal-label">{label}</span></div><p className="mt-2 truncate text-sm text-steel-200">{value}</p></div>;
}
