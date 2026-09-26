import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActorRole } from "@/lib/roles";

const sendSchema = z.object({
  recipientId: z.string().min(1),
  content: z.string().trim().max(2000).default(""),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().max(180).optional(),
  attachmentType: z.string().max(100).optional(),
  attachmentSize: z.number().int().positive().max(100_000_000).optional(),
}).refine((v) => v.content.length > 0 || !!v.attachmentUrl, {
  message: "Mesaj veya dosya gerekli.",
});

const userSelect = {
  id: true,
  discordId: true,
  name: true,
  username: true,
  image: true,
  role: true,
} as const;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Özel mesajlara erişim yetkin yok." }, { status: 403 });
  }

  const targetId = new URL(req.url).searchParams.get("userId");
  if (!targetId) {
    return NextResponse.json({ error: "Mesajlaşılacak personel seçilmedi." }, { status: 400 });
  }
  if (targetId === session.user.id) {
    return NextResponse.json({ error: "Kendinize özel mesaj gönderemezsiniz." }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: targetId, role: { not: null } },
    select: userSelect,
  });
  if (!target) return NextResponse.json({ error: "Personel bulunamadı." }, { status: 404 });

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: session.user.id, recipientId: targetId },
        { senderId: targetId, recipientId: session.user.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 150,
    include: {
      sender: { select: userSelect },
      recipient: { select: userSelect },
    },
  });

  await prisma.directMessage.updateMany({
    where: { senderId: targetId, recipientId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ target, messages });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Özel mesajlara erişim yetkin yok." }, { status: 403 });
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

  const parsed = sendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz mesaj." }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.recipientId, role: { not: null } },
    select: userSelect,
  });
  if (!target) return NextResponse.json({ error: "Alıcı güncel personel kadrosunda değil." }, { status: 404 });
  if (target.id === session.user.id) return NextResponse.json({ error: "Kendinize mesaj gönderemezsiniz." }, { status: 400 });

  const message = await prisma.directMessage.create({
    data: {
      content: parsed.data.content,
      attachmentUrl: parsed.data.attachmentUrl,
      attachmentName: parsed.data.attachmentName,
      attachmentType: parsed.data.attachmentType,
      attachmentSize: parsed.data.attachmentSize,
      senderId: session.user.id,
      recipientId: target.id,
    },
    include: {
      sender: { select: userSelect },
      recipient: { select: userSelect },
    },
  });

  return NextResponse.json({ message }, { status: 201 });
}
