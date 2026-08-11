export class InstagramClient {
  constructor(private readonly accessToken: string, private readonly graphVersion: string) {}
  async send(recipientId: string, text: string) {
    if (!this.accessToken) throw new Error("INSTAGRAM_NOT_CONFIGURED");
    const blocks = text.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
    for (const block of blocks.length ? blocks : [text]) {
      const res = await fetch(`https://graph.facebook.com/${this.graphVersion}/me/messages?access_token=${encodeURIComponent(this.accessToken)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text:block } }) });
      if (!res.ok) throw new Error(`INSTAGRAM_SEND_ERROR:${res.status}`);
    }
  }
}
