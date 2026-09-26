import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isActorRole } from "@/lib/roles";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "video/x-matroska",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm",
  "application/pdf", "text/plain",
]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    return NextResponse.json({ error: "Cloudinary ayarları eksik." }, { status: 503 });
  }

  return NextResponse.json({ cloudName, uploadPreset });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isActorRole(session.user.role)) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    return NextResponse.json(
      { error: "Dosya yükleme servisi yapılandırılmamış. Cloudinary ayarlarını ekleyin." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Dosya seçilmedi." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Görsel, GIF, video, ses ve PDF/TXT dosyaları yüklenebilir." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Dosya en fazla 100 MB olabilir." }, { status: 400 });

  const upload = new FormData();
  upload.append("file", file);
  upload.append("upload_preset", uploadPreset);
  upload.append("folder", "shadow-roleplay/chat");

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: "POST",
      body: upload,
    });
    const data = await response.json();
    if (!response.ok || !data.secure_url) {
      return NextResponse.json({ error: "Dosya yüklenemedi." }, { status: 502 });
    }

    return NextResponse.json({
      url: data.secure_url,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch {
    return NextResponse.json({ error: "Dosya yükleme sırasında hata oluştu." }, { status: 500 });
  }
}
