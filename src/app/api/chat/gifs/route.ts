import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isActorRole } from "@/lib/roles";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const key = process.env.TENOR_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "GIF servisi yapılandırılmamış." }, { status: 503 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (!q) return NextResponse.json({ results: [] });

  try {
    const endpoint = new URL("https://tenor.googleapis.com/v2/search");
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("client_key", "shadow-roleplay");
    endpoint.searchParams.set("q", q);
    endpoint.searchParams.set("limit", "12");
    endpoint.searchParams.set("contentfilter", "medium");
    endpoint.searchParams.set("media_filter", "gif,tinygif");

    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "GIF servisi yanıt vermedi." }, { status: 502 });

    const data = await response.json();
    const results = Array.isArray(data.results)
      ? data.results.map((item: any) => ({
          id: String(item.id),
          title: String(item.content_description ?? "GIF"),
          preview:
            item.media_formats?.tinygif?.url ??
            item.media_formats?.gif?.url ??
            null,
          url: item.media_formats?.gif?.url ?? item.media_formats?.mediumgif?.url ?? null,
        })).filter((item: any) => item.url)
      : [];

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "GIF araması sırasında hata oluştu." }, { status: 500 });
  }
}
