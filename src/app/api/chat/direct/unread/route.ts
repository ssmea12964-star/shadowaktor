import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActorRole } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) return NextResponse.json({ unread: {} });

  const rows = await prisma.directMessage.groupBy({
    by: ["senderId"],
    where: {
      recipientId: session.user.id,
      readAt: null,
      deletedAt: null,
    },
    _count: { _all: true },
  });

  return NextResponse.json({
    unread: Object.fromEntries(rows.map((row) => [row.senderId, row._count._all])),
  });
}
