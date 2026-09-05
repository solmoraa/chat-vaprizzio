import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { ConversationRepository } from "../src/database/conversation-repository.js";
import { TakeoverService } from "../src/services/takeover-service.js";
import type { Channel } from "../src/domain/types.js";

const SECRET = "piri-secret-test";

function makeHarness(
  reply = "Respuesta Piri",
) {
  const conversations =
    new ConversationRepository(
      ":memory:",
      720,
    );

  const takeover =
    new TakeoverService(
      conversations,
      {
        notify:
          vi.fn().mockResolvedValue(
            undefined,
          ),
      },
    );

  const openclawReply =
    vi.fn().mockResolvedValue(reply);

  const app = createApp({
    config: loadConfig({
      PIRI_INTERNAL_SECRET: SECRET,
    }),
    tools: {
      catalog: {
        priceList:
          vi.fn().mockResolvedValue([]),
      },
    } as never,
    conversations,
    debounce: {
      cancel: vi.fn(),
    } as never,
    openclaw: {
      reply: openclawReply,
    } as never,
    takeover,
  });

  return {
    app,
    conversations,
    takeover,
    openclawReply,
  };
}

async function listen(
  app: ReturnType<typeof createApp>,
) {
  const server = app.listen(
    0,
    "127.0.0.1",
  );

  await new Promise<void>(
    resolve =>
      server.once(
        "listening",
        resolve,
      ),
  );

  const address = server.address();

  if (
    !address ||
    typeof address === "string"
  ) {
    throw new Error("NO_ADDRESS");
  }

  return {
    server,
    base:
      `http://127.0.0.1:${address.port}`,
  };
}

describe("canal web / Piri", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
  });

  it("web es un Channel válido", () => {
    const channel: Channel = "web";
    expect(channel).toBe("web");
  });

  it("rechaza request sin secreto", async () => {
    const h = makeHarness();
    const started = await listen(h.app);
    server = started.server;

    const response = await fetch(
      `${started.base}/internal/piri/message`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          sessionId: "session-1",
          message: "hola",
        }),
      },
    );

    expect(response.status).toBe(401);
  });

  it(
    "rechaza secreto incorrecto",
    async () => {
      const h = makeHarness();
      const started =
        await listen(h.app);

      server = started.server;

      const response = await fetch(
        `${started.base}/internal/piri/message`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-internal-secret":
              "incorrecto",
          },
          body: JSON.stringify({
            sessionId: "session-1",
            message: "hola",
          }),
        },
      );

      expect(response.status).toBe(
        401,
      );
    },
  );

  it(
    "rechaza mensaje vacío",
    async () => {
      const h = makeHarness();
      const started =
        await listen(h.app);

      server = started.server;

      const response = await fetch(
        `${started.base}/internal/piri/message`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-internal-secret":
              SECRET,
          },
          body: JSON.stringify({
            sessionId: "session-1",
            message: "   ",
          }),
        },
      );

      expect(response.status).toBe(
        400,
      );

      expect(
        h.openclawReply,
      ).not.toHaveBeenCalled();
    },
  );

  it(
    "usa web y sessionId como customerId",
    async () => {
      const h = makeHarness(
        "Tenemos Miami Mint disponible",
      );

      const started =
        await listen(h.app);

      server = started.server;

      const response = await fetch(
        `${started.base}/internal/piri/message`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-internal-secret":
              SECRET,
          },
          body: JSON.stringify({
            sessionId:
              "550e8400-e29b-41d4-a716-446655440000",
            message:
              "Qué sabores de Ice King tienen?",
          }),
        },
      );

      expect(response.status).toBe(
        200,
      );

      await expect(
        response.json(),
      ).resolves.toMatchObject({
        ok: true,
        reply:
          "Tenemos Miami Mint disponible",
        state: "AI_ACTIVE",
      });

      expect(
        h.openclawReply,
      ).toHaveBeenCalledWith(
        "web",
        "550e8400-e29b-41d4-a716-446655440000",
        [
          "Qué sabores de Ice King tienen?",
        ],
      );
    },
  );

  it(
    "separa dos sesiones web",
    async () => {
      const h = makeHarness();
      const started =
        await listen(h.app);

      server = started.server;

      for (
        const sessionId of [
          "cliente-a",
          "cliente-b",
        ]
      ) {
        await fetch(
          `${started.base}/internal/piri/message`,
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
              "x-internal-secret":
                SECRET,
            },
            body: JSON.stringify({
              sessionId,
              message:
                `hola desde ${sessionId}`,
            }),
          },
        );
      }

      expect(
        h.conversations.getOrCreate(
          "web",
          "cliente-a",
        ).id,
      ).toBe("web:cliente-a");

      expect(
        h.conversations.getOrCreate(
          "web",
          "cliente-b",
        ).id,
      ).toBe("web:cliente-b");
    },
  );

  it(
    "respeta takeover humano",
    async () => {
      const h = makeHarness();

      h.conversations.setState(
        "web",
        "pausada",
        "WAITING_HUMAN",
        null,
      );

      const started =
        await listen(h.app);

      server = started.server;

      const response = await fetch(
        `${started.base}/internal/piri/message`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-internal-secret":
              SECRET,
          },
          body: JSON.stringify({
            sessionId: "pausada",
            message: "dale",
          }),
        },
      );

      await expect(
        response.json(),
      ).resolves.toMatchObject({
        ok: true,
        reply: null,
        state: "WAITING_HUMAN",
      });

      expect(
        h.openclawReply,
      ).not.toHaveBeenCalled();
    },
  );

  it(
    "reactiva un tema nuevo",
    async () => {
      const h = makeHarness(
        "Sí, tenemos stock",
      );

      h.conversations.setState(
        "web",
        "nuevo-tema",
        "HUMAN_ACTIVE",
        null,
      );

      const started =
        await listen(h.app);

      server = started.server;

      await fetch(
        `${started.base}/internal/piri/message`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-internal-secret":
              SECRET,
          },
          body: JSON.stringify({
            sessionId: "nuevo-tema",
            message:
              "hola, tienen stock de Lost Mary?",
          }),
        },
      );

      expect(
        h.takeover.canAiReply(
          "web",
          "nuevo-tema",
        ),
      ).toBe(true);
    },
  );
});