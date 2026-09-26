import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isActorRole } from "@/lib/roles";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) return NextResponse.json({ emojis: [] });

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/emojis`, {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ emojis: [] });

    const data = await response.json();
    const emojis = Array.isArray(data)
      ? data.map((emoji: any) => ({
          id: String(emoji.id),
          name: String(emoji.name ?? "emoji"),
          animated: Boolean(emoji.animated),
          url: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=48`,
        }))
      : [];

    return NextResponse.json({ emojis });
  } catch {
    return NextResponse.json({ emojis: [] });
  }
}
