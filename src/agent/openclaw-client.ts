export class OpenClawClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly agentId: string) {}
  async dispatch(channel: string, customerId: string, messages: string[]) {
    if (!this.token) throw new Error("OPENCLAW_NOT_CONFIGURED");
    const res = await fetch(`${this.baseUrl}/hooks/agent`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` }, body: JSON.stringify({ agentId: this.agentId, sessionKey: `${channel}:${customerId}`, message: messages.join("\n"), deliver: true }) });
    if (!res.ok) throw new Error(`OPENCLAW_ERROR:${res.status}`);
  }
}
