import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActorRole } from "@/lib/roles";
import { fetchCurrentActorRoster } from "@/lib/discord";
import { logActivity } from "@/lib/activity";

const messageSchema = z.object({
  content: z.string().trim().max(1000, "Mesaj 1000 karakteri geçemez.").default(""),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().max(180).optional(),
  attachmentType: z.string().max(100).optional(),
  attachmentSize: z.number().int().positive().max(100_000_000).optional(),
}).refine((value) => value.content.length > 0 || !!value.attachmentUrl, {
  message: "Mesaj veya dosya gerekli.",
});

const userSelect = {
  id: true,
  discordId: true,
  name: true,
  username: true,
  image: true,
  role: true,
  lastSeenAt: true,
  createdAt: true,
  mutedUntil: true,
} as const;

async function syncDiscordRoster() {
  const result = await fetchCurrentActorRoster();
  if (!result.ok) return null;

  for (const member of result.roster) {
    await prisma.user.upsert({
      where: { discordId: member.id },
      create: {
        discordId: member.id,
        name: member.username,
        username: member.username,
        image: member.avatarUrl,
        role: member.role,
      },
      update: {
        name: member.username,
        username: member.username,
        image: member.avatarUrl,
        role: member.role,
      },
    });
  }

  const rosterIds = new Set(result.roster.map((member) => member.id));
  const stale = await prisma.user.findMany({
    where: { role: { not: null } },
    select: { id: true, discordId: true },
  });
  const staleIds = stale.filter((member) => !rosterIds.has(member.discordId)).map((member) => member.id);

  if (staleIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: staleIds } },
      data: { role: null },
    });
  }

  return result.roster;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Aktör sohbetine erişim yetkin yok." }, { status: 403 });
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: now },
  });

  const roster = await syncDiscordRoster();
  const rosterIds = roster ? new Set(roster.map((member) => member.id)) : null;

  const [messages, members, announcements] = await Promise.all([
    prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { author: { select: userSelect } },
    }),
    prisma.user.findMany({
      where: {
        role: { not: null },
        ...(rosterIds ? { discordId: { in: [...rosterIds] } } : {}),
      },
      orderBy: { name: "asc" },
      select: userSelect,
    }),
    prisma.announcement.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { createdBy: { select: { name: true, username: true, role: true } } },
    }),
  ]);

  const currentRoles = roster ? new Map(roster.map((member) => [member.id, member.role])) : null;
  const normalizedMessages = messages.reverse().map((message) => ({
    ...message,
    author: {
      ...message.author,
      role: currentRoles?.get(message.author.discordId) ?? (currentRoles ? null : message.author.role),
    },
    content: message.deletedAt ? "[Bu mesaj yönetim tarafından silindi]" : message.content,
  }));

  return NextResponse.json({
    messages: normalizedMessages,
    members: members.map((member) => ({
      ...member,
      online: !!member.lastSeenAt && now.getTime() - member.lastSeenAt.getTime() < 90_000,
    })),
    announcements,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Aktör sohbetine erişim yetkin yok." }, { status: 403 });
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mutedUntil: true },
  });
  if (current?.mutedUntil && current.mutedUntil > new Date()) {
    return NextResponse.json(
      { error: `Sohbette ${current.mutedUntil.toLocaleString("tr-TR")} tarihine kadar susturuldunuz.` },
      { status: 403 },
    );
  }

  const parsed = messageSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz mesaj." }, { status: 400 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      content: parsed.data.content,
      attachmentUrl: parsed.data.attachmentUrl,
      attachmentName: parsed.data.attachmentName,
      attachmentType: parsed.data.attachmentType,
      attachmentSize: parsed.data.attachmentSize,
      authorId: session.user.id,
    },
    include: { author: { select: userSelect } },
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date() },
  });

  await logActivity({
    action: "CHAT_MESAJ_GONDERILDI",
    message: `${message.author.name ?? message.author.username ?? "Aktör"} sohbete mesaj gönderdi`,
    detail: parsed.data.content || parsed.data.attachmentName || "Medya mesajı",
    actorId: session.user.id,
  });

  return NextResponse.json({ message });
}
