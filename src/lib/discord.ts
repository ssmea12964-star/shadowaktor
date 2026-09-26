import { resolveHighestRole } from "@/lib/roles";

const DISCORD_API = "https://discord.com/api/v10";

function botHeaders(json = false): Record<string, string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN tanimli degil");
  return {
    Authorization: `Bot ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function fetchMemberRoleIds(discordUserId: string): Promise<string[]> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return [];
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
      headers: botHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.roles) ? data.roles : [];
  } catch (err) {
    console.error("Discord rol kontrolu hatasi:", err);
    return [];
  }
}

export type RosterMember = {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: NonNullable<ReturnType<typeof resolveHighestRole>>;
};

function actorRoleIds() {
  return [
    process.env.ROLE_TRIAL_ACTOR_ID,
    process.env.ROLE_ACTOR_ID,
    process.env.ROLE_SENIOR_ACTOR_ID,
    process.env.ROLE_HEAD_ADMIN_ID,
    process.env.ROLE_CHIEF_ACTOR_ID,
    process.env.ROLE_ACTOR_MANAGER_ID,
  ].filter(Boolean) as string[];
}

export async function fetchCurrentActorRoster(): Promise<
  { ok: true; roster: RosterMember[] } | { ok: false; roster: [] }
> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return { ok: false, roster: [] };

  const configuredRoles = actorRoleIds();
  if (!configuredRoles.length) return { ok: false, roster: [] };

  try {
    const roster: RosterMember[] = [];
    let after = "";

    for (let page = 0; page < 50; page++) {
      const endpoint = new URL(`${DISCORD_API}/guilds/${guildId}/members`);
      endpoint.searchParams.set("limit", "1000");
      if (after) endpoint.searchParams.set("after", after);

      const res = await fetch(endpoint, {
        headers: botHeaders(),
        cache: "no-store",
      });

      if (!res.ok) return { ok: false, roster: [] };

      const members = await res.json();
      if (!Array.isArray(members)) return { ok: false, roster: [] };

      for (const m of members) {
        const roles: string[] = Array.isArray(m?.roles) ? m.roles : [];
        if (!roles.some((id) => configuredRoles.includes(id))) continue;

        const id = m?.user?.id ? String(m.user.id) : "";
        const role = resolveHighestRole(roles);
        if (!id || !role) continue;

        roster.push({
          id,
          username: String(m?.nick ?? m?.user?.global_name ?? m?.user?.username ?? "Bilinmeyen"),
          avatarUrl: m?.user?.avatar
            ? `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=128`
            : null,
          role,
        });
      }

      if (members.length < 1000) break;
      after = String(members[members.length - 1]?.user?.id ?? "");
      if (!after) break;
    }

    return { ok: true, roster };
  } catch (err) {
    console.error("Discord aktör kadrosu alınamadı:", err);
    return { ok: false, roster: [] };
  }
}

export async function fetchActorRoster(): Promise<RosterMember[]> {
  const result = await fetchCurrentActorRoster();
  return result.ok ? result.roster : [];
}

export async function sendDiscordDM(discordUserId: string, content: string, title?: string) {
  try {
    const create = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: botHeaders(true),
      body: JSON.stringify({ recipient_id: discordUserId }),
    });
    if (!create.ok) throw new Error(`DM channel ${create.status}`);

    const channel = await create.json();
    const payload: Record<string, unknown> = {
      content: content.slice(0, 1900),
    };
    if (title) payload.content = `**${title}**\n${payload.content}`;

    const message = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
      method: "POST",
      headers: botHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!message.ok) throw new Error(`DM message ${message.status}`);
    return true;
  } catch (err) {
    console.error("Discord DM gonderilemedi:", err);
    return false;
  }
}

export async function sendDiscordWebhook(input: {
  title: string;
  description: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}) {
  const url = process.env.DISCORD_LOG_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Shadow Roleplay | Sistem Log",
        embeds: [{
          title: input.title,
          description: input.description.slice(0, 4000),
          fields: (input.fields ?? []).slice(0, 25).map((field) => ({
            ...field,
            value: field.value.slice(0, 1024),
          })),
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("Discord webhook log gonderilemedi:", err);
    return false;
  }
}
