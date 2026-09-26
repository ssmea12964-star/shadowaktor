import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity";
import { notifyUser } from "@/lib/notifications";

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  content: z.string().trim().min(3).max(3000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Yönetici yetkisi gerekir." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const announcement = await prisma.announcement.create({
    data: { ...parsed.data, createdById: session.user.id },
  });

  await logActivity({
    action: "CHAT_DUYURU_YAYINLANDI",
    message: `Yeni duyuru yayınlandı: ${announcement.title}`,
    detail: announcement.content,
    actorId: session.user.id,
  });

  const users = await prisma.user.findMany({
    where: { role: { not: null } },
    select: { id: true },
  });

  await Promise.all(users.map((user) =>
    notifyUser({
      userId: user.id,
      title: announcement.title,
      message: announcement.content,
      type: "DUYURU",
    }),
  ));

  return NextResponse.json({ announcement }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Yönetici yetkisi gerekir." }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Duyuru ID gerekli." }, { status: 400 });

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });

  await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
  await logActivity({
    action: "CHAT_DUYURU_SILINDI",
    message: `Duyuru silindi: ${announcement.title}`,
    detail: announcement.content,
    actorId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
