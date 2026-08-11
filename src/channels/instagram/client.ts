export class InstagramClient {
  private readonly profiles = new Map<string, { value:string; expiresAt:number }>();
  constructor(private readonly accessToken: string, private readonly graphVersion: string) {}
  async customerName(channel: string, customerId: string) {
    if (!this.accessToken || !["instagram", "messenger"].includes(channel)) return null;
    const cacheKey = `${channel}:${customerId}`;
    const cached = this.profiles.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const fields = channel === "instagram" ? "username,name" : "name,first_name,last_name";
      const res = await fetch(`https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(customerId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(this.accessToken)}`);
      if (!res.ok) return null;
      const profile = await res.json() as { username?:string; name?:string; first_name?:string; last_name?:string };
      const username = profile.username?.trim();
      const name = profile.name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
      const value = username ? `@${username}` : name || "";
      if (!value) return null;
      this.profiles.set(cacheKey, { value, expiresAt:Date.now() + 6 * 60 * 60 * 1000 });
      return value;
    } catch {
      return null;
    }
  }
  async send(recipientId: string, text: string) {
    if (!this.accessToken) throw new Error("INSTAGRAM_NOT_CONFIGURED");
    const blocks = text.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
    for (const block of blocks.length ? blocks : [text]) {
      const res = await fetch(`https://graph.facebook.com/${this.graphVersion}/me/messages?access_token=${encodeURIComponent(this.accessToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text:block } }) });
      if (!res.ok) throw new Error(`INSTAGRAM_SEND_ERROR:${res.status}`);
    }
  }
}
