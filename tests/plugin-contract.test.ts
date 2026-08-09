import { describe, expect, it } from "vitest";
import manifest from "../extensions/vaprizzio-tools/openclaw.plugin.json" with { type: "json" };

describe("contrato del plugin OpenClaw", () => {
  it("declara todas las herramientas comerciales instaladas", () => {
    expect(manifest.contracts.tools).toEqual(expect.arrayContaining([
      "listar_catalogo",
      "listar_mayorista",
      "consultar_entrega",
      "solicitar_envio_app"
      ,"reportar_cambio_envio",
      "reportar_llegada_cambio"
      ,"coordinar_visita_local"
      ,"evaluar_producto_fallado"
      ,"cerrar_conversacion"
      ,"reportar_comprobante_web"
      ,"reportar_solicitud_media"
      ,"reportar_llegada_sin_producto"
      ,"reportar_llegada_sin_horario"
      ,"reportar_pedido_inmediato_app"
      ,"reportar_condicion_pago"
      ,"preparar_venta_mayorista"
      ,"reportar_comprobante_mayorista"
    ]));
    for (const tool of manifest.contracts.tools) expect(manifest.toolMetadata).toHaveProperty(tool);
  });
});
