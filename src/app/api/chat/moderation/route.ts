import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity";

const schema = z.object({
  action: z.enum(["delete", "pin", "unpin", "mute", "unmute"]),
  messageId: z.string().optional(),
  userId: z.string().optional(),
  minutes: z.number().int().min(1).max(52560000).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Yönetici yetkisi gerekir." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz moderasyon işlemi." }, { status: 400 });
  }
  const data = parsed.data;

  if (data.action === "mute" || data.action === "unmute") {
    if (!data.userId) return NextResponse.json({ error: "Kullanıcı seçilmeli." }, { status: 400 });
    if (data.userId === session.user.id) return NextResponse.json({ error: "Kendinizi susturamazsınız." }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, name: true, username: true } });
    if (!target) return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });

    const until = data.action === "unmute"
      ? null
      : new Date(Date.now() + (data.minutes ?? 60) * 60_000);

    await prisma.user.update({
      where: { id: target.id },
      data: { mutedUntil: until },
    });

    await logActivity({
      action: "CHAT_KULLANICI_SUSTURULDU",
      message: data.action === "unmute"
        ? `${target.name ?? target.username ?? "Aktör"} sohbet susturması kaldırıldı`
        : `${target.name ?? target.username ?? "Aktör"} sohbetten susturuldu`,
      detail: until ? `Bitiş: ${until.toLocaleString("tr-TR")}` : "Susturma kaldırıldı.",
      actorId: session.user.id,
      targetUserId: target.id,
    });

    return NextResponse.json({ ok: true, mutedUntil: until });
  }

  if (!data.messageId) return NextResponse.json({ error: "Mesaj seçilmeli." }, { status: 400 });
  const message = await prisma.chatMessage.findUnique({ where: { id: data.messageId } });
  if (!message) return NextResponse.json({ error: "Mesaj bulunamadı." }, { status: 404 });

  if (data.action === "delete") {
    await prisma.chatMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), pinnedAt: null } });
  } else if (data.action === "pin") {
    await prisma.chatMessage.update({ where: { id: message.id }, data: { pinnedAt: new Date(), pinnedById: session.user.id } });
  } else {
    await prisma.chatMessage.update({ where: { id: message.id }, data: { pinnedAt: null, pinnedById: null } });
  }

  await logActivity({
    action:
      data.action === "delete"
        ? "CHAT_MESAJ_SILINDI"
        : data.action === "pin"
          ? "CHAT_MESAJ_SABITLENDI"
          : "CHAT_MESAJ_SABITLEME_KALDIRILDI",
    message: `Sohbet mesajı için ${data.action} işlemi yapıldı`,
    detail: message.content,
    actorId: session.user.id,
    targetUserId: message.authorId,
  });

  return NextResponse.json({ ok: true });
}
