"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActorRole } from "@prisma/client";
import { playNotificationSound } from "@/lib/notification-sound";
import { FileImage, Film, ImagePlus, MessageCircle, Send, Smile, X, Volume2, VolumeX } from "lucide-react";

type Target = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  role: ActorRole | null;
};

type DirectMessage = {
  id: string;
  content: string;
  createdAt: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  senderId: string;
  sender: Target;
};

type Emoji = { id: string; name: string; animated: boolean; url: string };
type Gif = { id: string; title: string; preview: string | null; url: string };

const QUICK_EMOJIS = ["😀","😂","😍","😎","🥳","😅","🤝","👏","🔥","❤️","💀","👀","✅","❌","⚠️","🛡️","🔒","🎯","🧪","🫡","👍"];

function nameOf(user: Target) {
  return user.name || user.username || "Personel";
}

function renderRichText(content: string, emojis: Emoji[]) {
  const parts = content.split(/(<a?:[A-Za-z0-9_]+:\d+>)/g);
  return parts.map((part, index) => {
    const match = part.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
    if (!match) return <span key={index}>{part}</span>;
    const emoji = emojis.find((item) => item.id === match[2]);
    return emoji
      ? <img key={index} src={emoji.url} alt={`:${match[1]}:`} className="inline-block h-5 w-5 align-text-bottom" />
      : <span key={index}>{part}</span>;
  });
}

export function DirectMessages({
  currentUserId,
  target,
  open,
  onOpenChange,
}: {
  currentUserId: string;
  target: Target | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string; size: number } | null>(null);
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [gifQuery, setGifQuery] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGifs, setShowGifs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousCount = useRef(0);
  const cloudinaryConfig = useRef<{ cloudName: string; uploadPreset: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => messages, [messages]);

  useEffect(() => {
    try { setSoundEnabled(localStorage.getItem("shadow-chat-sounds") !== "off"); } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("shadow-chat-sounds", soundEnabled ? "on" : "off"); } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    if (!open || !target) return;
    setLoading(true);
    setError("");
    previousCount.current = 0;
    fetch(`/api/chat/direct?userId=${encodeURIComponent(target.id)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Özel mesajlar alınamadı.");
        const next = data.messages ?? [];
        previousCount.current = next.length;
        setMessages(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Özel mesajlar alınamadı."))
      .finally(() => setLoading(false));

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/direct?userId=${encodeURIComponent(target.id)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        const next = data.messages ?? [];
        if (next.length > previousCount.current && previousCount.current > 0 && soundEnabled) {
          const incoming = next.slice(previousCount.current).some((message: DirectMessage) => message.senderId !== currentUserId);
          if (incoming) playNotificationSound("direct");
        }
        previousCount.current = next.length;
        setMessages(next);
      } catch {}
    }, 4000);

    return () => window.clearInterval(timer);
  }, [open, target, currentUserId, soundEnabled]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/chat/emojis", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setEmojis(d.emojis ?? [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [messages.length, open]);

  async function uploadFile(file: File) {
    const maxBytes = 100 * 1024 * 1024;
    const allowed = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/") || file.type === "application/pdf" || file.type === "text/plain";
    if (!allowed) return setError("Görsel, GIF, video, ses, PDF veya TXT gönderebilirsin.");
    if (file.size > maxBytes) return setError("Dosya en fazla 100 MB olabilir.");
    setUploading(true);
    setError("");
    try {
      if (!cloudinaryConfig.current) {
        const configRes = await fetch("/api/chat/upload", { cache: "no-store" });
        const config = await configRes.json();
        if (!configRes.ok) throw new Error(config.error || "Dosya servisi yapılandırılamadı.");
        cloudinaryConfig.current = config;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", cloudinaryConfig.current.uploadPreset);
      form.append("folder", "shadow-roleplay/chat");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.current.cloudName}/auto/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.secure_url) throw new Error(data.error?.message || "Dosya yüklenemedi.");
      setAttachment({ url: data.secure_url, name: file.name, type: file.type, size: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dosya yüklenemedi.");
    } finally {
      setUploading(false);
    }
  }

  async function searchGifs() {
    if (!gifQuery.trim()) return;
    const res = await fetch(`/api/chat/gifs?q=${encodeURIComponent(gifQuery.trim())}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error || "GIF araması başarısız.");
    setGifs(data.results ?? []);
  }

  async function send() {
    if (!target || sending || uploading || (!content.trim() && !attachment)) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/chat/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: target.id,
          content: content.trim(),
          ...(attachment ? {
            attachmentUrl: attachment.url,
            attachmentName: attachment.name,
            attachmentType: attachment.type,
            attachmentSize: attachment.size || undefined,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Özel mesaj gönderilemedi.");
      setMessages((current) => [...current, data.message]);
      setContent("");
      setAttachment(null);
      setShowEmoji(false);
      setShowGifs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Özel mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  function add(value: string) {
    setContent((current) => `${current}${value}`.slice(0, 2000));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-steel-700 bg-void-950/95 p-0">
        {target && (
          <>
            <DialogHeader className="border-b border-steel-800/70 px-5 py-4">
              <DialogTitle className="flex items-center gap-3">
                {target.image
                  ? <img src={target.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  : <div className="grid h-10 w-10 place-items-center rounded-lg bg-void-800 text-xs">{nameOf(target).slice(0, 2).toUpperCase()}</div>}
                <div>
                  <span>{nameOf(target)}</span>
                  <p className="mt-0.5 text-[10px] font-normal text-steel-500">ÖZEL İLETİŞİM · SADECE SİZ VE {nameOf(target).toUpperCase()}</p>
                </div>
              </DialogTitle>
              <DialogDescription className="flex items-center justify-between gap-3">Özel iletişim · görsel, GIF, video, ses, PDF, TXT ve emoji desteği.<button type="button" onClick={() => setSoundEnabled((v) => !v)} className="rounded-lg border border-steel-800 p-2 text-steel-400 hover:text-steel-100" title={soundEnabled ? "Bildirim sesini kapat" : "Bildirim sesini aç"}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button></DialogDescription>
            </DialogHeader>

            <div className="flex h-[560px] flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {loading ? (
                  <div className="grid h-full place-items-center text-sm text-steel-500">Özel mesajlar yükleniyor...</div>
                ) : sorted.length === 0 ? (
                  <div className="grid h-full place-items-center text-center">
                    <div><MessageCircle className="mx-auto h-8 w-8 text-steel-700" /><p className="mt-3 text-sm text-steel-400">Henüz özel mesaj yok.</p><p className="mt-1 text-xs text-steel-600">İlk mesajı göndererek konuşmayı başlat.</p></div>
                  </div>
                ) : sorted.map((message) => {
                  const mine = message.senderId === currentUserId;
                  return (
                    <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[78%] rounded-2xl border px-3 py-2", mine ? "border-secure/20 bg-secure/[0.06]" : "border-steel-800 bg-void-900/70")}>
                        <p className="mb-1 text-[9px] text-steel-600">{mine ? "Siz" : nameOf(message.sender)} · {new Date(message.createdAt).toLocaleString("tr-TR")}</p>
                        {message.content && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-steel-200">{renderRichText(message.content, emojis)}</p>}
                        {message.attachmentUrl && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-steel-800">
                            {message.attachmentType?.startsWith("image/")
                              ? <img src={message.attachmentUrl} alt={message.attachmentName ?? "Ek"} className="max-h-72 w-full object-contain" />
                              : message.attachmentType?.startsWith("video/")
                                ? <video src={message.attachmentUrl} controls preload="metadata" className="max-h-72 w-full bg-black" />
                                : message.attachmentType?.startsWith("audio/")
                                  ? <div className="p-3"><p className="mb-2 truncate text-xs text-steel-300">{message.attachmentName ?? "Ses dosyası"}</p><audio src={message.attachmentUrl} controls className="w-full" /></div>
                                  : <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 text-xs text-steel-300"><FileImage className="h-4 w-4" />{message.attachmentName ?? "Dosyayı aç"}</a>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="relative border-t border-steel-800/70 p-4">
                {error && <p className="mb-2 text-xs text-breach-glow">{error}</p>}
                {attachment && <div className="mb-2 flex items-center gap-2 rounded-xl border border-steel-800 bg-void-900 p-2"><img src={attachment.url} alt="" className="h-10 w-10 rounded object-cover" /><span className="flex-1 truncate text-xs text-steel-300">{attachment.name}</span><button onClick={() => setAttachment(null)}><X className="h-4 w-4 text-steel-500" /></button></div>}

                {(showEmoji || showGifs) && (
                  <div className="absolute bottom-20 left-4 z-20 w-[calc(100%-2rem)] max-w-md rounded-2xl border border-steel-700 bg-void-950 p-3 shadow-2xl">
                    {showEmoji && <div><div className="mb-2 flex items-center justify-between"><p className="terminal-label">EMOJİLER</p><button onClick={() => setShowEmoji(false)}><X className="h-4 w-4" /></button></div><div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">{QUICK_EMOJIS.map((emoji) => <button key={emoji} onClick={() => add(emoji)} className="rounded p-2 text-lg hover:bg-white/5">{emoji}</button>)}{emojis.map((emoji) => <button key={emoji.id} onClick={() => add(`<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`)} className="rounded p-1 hover:bg-white/5"><img src={emoji.url} alt={emoji.name} className="mx-auto h-6 w-6" /></button>)}</div></div>}
                    {showGifs && <div><div className="flex gap-2"><Input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchGifs()} placeholder="GIF ara..." className="h-9" /><Button onClick={() => void searchGifs()} size="sm">Ara</Button></div><div className="mt-3 grid max-h-56 grid-cols-3 gap-2 overflow-y-auto">{gifs.map((gif) => <button key={gif.id} onClick={() => { setAttachment({ url: gif.url, name: gif.title || "GIF", type: "image/gif", size: 0 }); setShowGifs(false); }} className="overflow-hidden rounded-lg border border-steel-800"><img src={gif.preview || gif.url} alt={gif.title} className="h-20 w-full object-cover" /></button>)}</div></div>}
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,video/x-matroska,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,application/pdf,text/plain" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadFile(file); e.currentTarget.value = ""; }} />
                <div className="flex items-end gap-2 rounded-xl border border-steel-700 bg-void-900 p-2 focus-within:border-secure/50">
                  <div className="flex gap-1">
                    <button title="Resim / GIF yükle" onClick={() => fileRef.current?.click()} className="chat-icon-button">{uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-steel-600 border-t-secure" /> : <ImagePlus className="h-4 w-4" />}</button>
                    <button title="Emoji" onClick={() => { setShowEmoji((v) => !v); setShowGifs(false); }} className={cn("chat-icon-button", showEmoji && "chat-icon-active")}><Smile className="h-4 w-4" /></button>
                    <button title="GIF" onClick={() => { setShowGifs((v) => !v); setShowEmoji(false); }} className={cn("chat-icon-button", showGifs && "chat-icon-active")}><Film className="h-4 w-4" /></button>
                  </div>
                  <textarea value={content} onChange={(e) => setContent(e.target.value.slice(0, 2000))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={2} placeholder="Özel mesaj yaz..." className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-steel-100 outline-none placeholder:text-steel-600" />
                  <Button onClick={() => void send()} disabled={sending || uploading || (!content.trim() && !attachment)} size="icon" className="h-10 w-10 rounded-lg"><Send className="h-4 w-4" /></Button>
                </div>
                <p className="mt-2 text-[10px] text-steel-600">Özel mesajlar genel sohbetten bağımsızdır · Maksimum 100 MB</p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
