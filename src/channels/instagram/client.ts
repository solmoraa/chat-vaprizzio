export class InstagramClient {
  private readonly profiles = new Map<string, { value:string; expiresAt:number }>();
  private readonly automatedEchoes = new Map<string, number>();
  constructor(
    private readonly pageAccessToken: string,
    private readonly graphVersion: string,
    private readonly instagramAccessToken = "",
    private readonly instagramAccountId = ""
  ) {}
  private credentials(channel: string) {
    if (channel === "instagram" && this.instagramAccessToken) {
      return { token:this.instagramAccessToken, origin:"https://graph.instagram.com" };
    }
    return { token:this.pageAccessToken, origin:"https://graph.facebook.com" };
  }
  private echoKey(channel: string, recipientId: string, text: string) {
    return `${channel}:${recipientId}:${text.trim()}`;
  }
  isAutomatedEcho(channel: string, recipientId: string, text: string) {
    const key = this.echoKey(channel, recipientId, text);
    const expiresAt = this.automatedEchoes.get(key) ?? 0;
    this.automatedEchoes.delete(key);
    return expiresAt > Date.now();
  }
  async customerName(channel: string, customerId: string) {
    if (!["instagram", "messenger"].includes(channel)) return null;
    const { token, origin } = this.credentials(channel);
    if (!token) return null;
    const cacheKey = `${channel}:${customerId}`;
    const cached = this.profiles.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    try {
      const fields = channel === "instagram" ? "username,name" : "name,first_name,last_name";
      const res = await fetch(`${origin}/${this.graphVersion}/${encodeURIComponent(customerId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`);
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
  async diagnostics() {
    const result: {
      messenger: { configured:boolean };
      instagram: {
        configured:boolean;
        configuredAccountId:string | null;
        tokenAccount?: { ok:boolean; id?:string; username?:string; error?:string };
        subscription?: { ok:boolean; messages:boolean; messagingPostbacks:boolean; appIds:string[]; error?:string };
      };
    } = {
      messenger:{ configured:Boolean(this.pageAccessToken) },
      instagram:{ configured:Boolean(this.instagramAccessToken), configuredAccountId:this.instagramAccountId || null },
    };
    if (!this.instagramAccessToken) return result;
    const request = async (path:string) => {
      const response = await fetch(`https://graph.instagram.com/${this.graphVersion}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(this.instagramAccessToken)}`);
      const text = await response.text();
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* respuesta no JSON */ }
      if (!response.ok) {
        const graphError = payload.error as { message?:string; code?:number } | undefined;
        const detail = graphError?.message || `HTTP ${response.status}`;
        throw new Error(`${detail}${graphError?.code == null ? "" : ` (code ${graphError.code})`}`);
      }
      return payload;
    };
    try {
      const account = await request("me?fields=id,username");
      result.instagram.tokenAccount = { ok:true, id:String(account.id ?? ""), username:String(account.username ?? "") };
    } catch (error) {
      result.instagram.tokenAccount = { ok:false, error:error instanceof Error ? error.message : "UNKNOWN_ERROR" };
    }
    try {
      // Instagram Login entrega un identificador propio ligado al token. Usar el
      // ID devuelto por /me evita mezclarlo con el instagram_business_account.id
      // del flujo Facebook Login, que pertenece a otro espacio de identificadores.
      const tokenAccountId = result.instagram.tokenAccount?.id || "me";
      const payload = await request(`${encodeURIComponent(tokenAccountId)}/subscribed_apps`);
      const subscriptions = Array.isArray(payload.data) ? payload.data as Array<{ id?:string; subscribed_fields?:string[] }> : [];
      const fields = new Set(subscriptions.flatMap(item => item.subscribed_fields ?? []));
      result.instagram.subscription = {
        ok:subscriptions.length > 0,
        messages:fields.has("messages"),
        messagingPostbacks:fields.has("messaging_postbacks"),
        appIds:subscriptions.map(item => String(item.id ?? "")).filter(Boolean),
      };
    } catch (error) {
      result.instagram.subscription = { ok:false, messages:false, messagingPostbacks:false, appIds:[], error:error instanceof Error ? error.message : "UNKNOWN_ERROR" };
    }
    return result;
  }
  async send(channel: "instagram" | "messenger", recipientId: string, text: string) {
    const { token, origin } = this.credentials(channel);
    if (!token) throw new Error(`${channel.toUpperCase()}_NOT_CONFIGURED`);
    // Con Instagram Login el token ya identifica a la cuenta profesional. /me es
    // la ruta canónica y elimina los fallos causados por copiar el ID de Facebook.
    // Conservamos INSTAGRAM_ACCOUNT_ID solo para instalaciones antiguas que usen
    // el token de Página y graph.facebook.com.
    const senderId = channel === "instagram" && !this.instagramAccessToken
      ? encodeURIComponent(this.instagramAccountId || "me")
      : "me";
    const blocks = text.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
    for (const block of blocks.length ? blocks : [text]) {
      const res = await fetch(`${origin}/${this.graphVersion}/${senderId}/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text:block } }) });
      if (!res.ok) {
        const detail = (await res.text()).replace(/\s+/g, " ").slice(0, 500);
        throw new Error(`${channel.toUpperCase()}_SEND_ERROR:${res.status}:${detail}`);
      }
      this.automatedEchoes.set(this.echoKey(channel, recipientId, block), Date.now() + 5 * 60_000);
    }
  }
}
