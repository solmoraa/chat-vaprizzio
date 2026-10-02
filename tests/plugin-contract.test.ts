import { describe, expect, it } from "vitest";
import manifest from "../extensions/vaprizzio-tools/openclaw.plugin.json" with { type: "json" };
import { readFileSync } from "node:fs";

describe("contrato del plugin OpenClaw", () => {
  it("declara todas las herramientas comerciales instaladas", () => {
    expect(manifest.contracts.tools).toEqual(
      expect.arrayContaining([
        "listar_catalogo",
        "listar_mayorista",
        "consultar_entrega",
        "solicitar_envio_app",
        "reportar_cambio_envio",
        "reportar_llegada_cambio",
        "coordinar_visita_local",
        "evaluar_producto_fallado",
        "cerrar_conversacion",
        "iniciar_nuevo_tema",
        "reportar_comprobante_web",
        "reportar_solicitud_media",
        "reportar_llegada_sin_producto",
        "reportar_llegada_sin_horario",
        "reportar_pedido_inmediato_app",
        "reportar_condicion_pago",
        "preparar_venta_mayorista",
        "reportar_comprobante_mayorista",
      ]),
    );
    for (const tool of manifest.contracts.tools)
      expect(manifest.toolMetadata).toHaveProperty(tool);
  });

  it("acepta web en la identidad de herramientas y reinicios de tema", () => {
    const source = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /enum:\s*\[\s*"whatsapp"\s*,\s*"instagram"\s*,\s*"messenger"\s*,\s*"web"\s*\]/,
    );

    expect(source).toMatch(
      /\[\s*"whatsapp"\s*,\s*"instagram"\s*,\s*"messenger"\s*,\s*"web"\s*\]\.includes\(channel\)/,
    );
  });

  it("impide prometer una consulta sin haber enviado una alerta", () => {
    const source = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('api.on("before_agent_finalize"');
    expect(source).toContain("vaprizzio-missing-alert");
    expect(source).toContain("solicitar_intervencion_humana");
  });

  it("no vuelve a preguntar la antigüedad si el cliente ya la informó", () => {
    const source = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("defectivePurchaseAge");
    expect(source).toContain(
      "Está prohibido volver a preguntar hace cuántos días lo compró",
    );
    expect(source).toContain("daysSincePurchase=${purchaseAge}");
  });

  it("fuerza la respuesta al cliente cuando la alerta ya fue enviada", () => {
    const source = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("requiredCustomerMessages");
    expect(source).toContain("vaprizzio-required-customer-message");
    expect(source).toContain("No ejecutes ninguna herramienta nuevamente");
  });

  it("inyecta en cada turno reglas contextuales para enlaces y productos específicos", () => {
    const source = readFileSync(
      new URL("../extensions/vaprizzio-tools/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("requestsShoppingLink");
    expect(source).toContain("requestsExplicitCatalog");
    expect(source).toContain("PROHIBICION DE CATALOGO COMPLETO");
    expect(source).toContain("no envíes URL: es una consulta de disponibilidad, no una compra");
  });
});
