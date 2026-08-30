import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const pythonAvailable = spawnSync(python, ["--version"], { encoding:"utf8" }).status === 0;
const patcher = fileURLToPath(new URL("../deploy/vaprizziobot/patch_dynamic_catalog.py", import.meta.url));
const validatorPath = fileURLToPath(new URL("../deploy/vaprizziobot/validar_catalogo_venta.py", import.meta.url));
const installer = readFileSync(new URL("../deploy/install-vaprizziobot-dynamic-catalog-fix.sh", import.meta.url), "utf8");
const validator = readFileSync(validatorPath, "utf8");
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive:true, force:true });
});

function fixtureWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "vaprizziobot-dynamic-"));
  temporary.push(root);
  mkdirSync(join(root, "scripts"), { recursive:true });
  writeFileSync(join(root, "AGENTS.md"), "# agente\n", "utf8");
  writeFileSync(join(root, "TOOLS.md"), "# tools\n", "utf8");
  writeFileSync(join(root, "scripts", "agente_vaprizzio.py"), `
from typing import Any

def limpiar_texto_modelo(value: Any) -> str:
    return str(value or "").strip().lower()

def normalizar_modelo(value: Any) -> Any:
    text = limpiar_texto_modelo(value)
    if "lost mary" in text:
        return "Lost Mary Mixer 30k"
    if "ice king" in text:
        return "Elfbar Ice King 40k"
    return value

def validar_familia_modelo(value: Any) -> None:
    return None
`, "utf8");
  return root;
}

describe.skipIf(!pythonAvailable)("catalogo dinamico del agente administrativo", () => {
  it("no convierte modelos nuevos de Lost Mary al antiguo Mixer", () => {
    const root = fixtureWorkspace();
    execFileSync(python, [patcher, root], { encoding:"utf8" });
    const agent = join(root, "scripts", "agente_vaprizzio.py");
    const output = execFileSync(python, ["-c", `
import importlib.util, json
spec = importlib.util.spec_from_file_location("agent", r"${agent.replaceAll("\\", "\\\\")}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps({name: module.normalizar_modelo(name) for name in [
  "Lost Mary Dura", "Lost Mary Mixer 30k", "Lost Mary Galaxy 50k",
  "Nuevo Modelo 100k", "Ice King"
]}))
`], { encoding:"utf8" });
    expect(JSON.parse(output)).toEqual({
      "Lost Mary Dura":"Lost Mary Dura",
      "Lost Mary Mixer 30k":"Lost Mary Mixer 30k",
      "Lost Mary Galaxy 50k":"Lost Mary Galaxy 50k",
      "Nuevo Modelo 100k":"Nuevo Modelo 100k",
      "Ice King":"Elfbar Ice King 40k",
    });
  });

  it("es idempotente y agrega reglas contra contexto viejo y consultas repetidas", () => {
    const root = fixtureWorkspace();
    execFileSync(python, [patcher, root], { encoding:"utf8" });
    execFileSync(python, [patcher, root], { encoding:"utf8" });
    const agent = readFileSync(join(root, "scripts", "agente_vaprizzio.py"), "utf8");
    const rules = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agent.match(/FIX CATALOGO DINAMICO VENTA 20260830/g)).toHaveLength(1);
    expect(rules.match(/FIN FIX CATALOGO DINAMICO VENTA 20260830/g)).toHaveLength(1);
    expect(rules).toContain("mensaje actual");
    expect(rules).toContain("No consultar stock antes");
    expect(rules).toContain("Lost Mary Dura");
  });

  it("revisa en un solo lote modelos y sabores actuales y futuros", () => {
    const root = fixtureWorkspace();
    execFileSync(python, [patcher, root], { encoding:"utf8" });
    const business = join(root, "tiendanube", "app", "business");
    mkdirSync(business, { recursive:true });
    for (const path of [
      join(root, "tiendanube", "__init__.py"),
      join(root, "tiendanube", "app", "__init__.py"),
      join(business, "__init__.py"),
    ]) writeFileSync(path, "", "utf8");
    writeFileSync(join(business, "products.py"), `
def consultar_stock(marca=None, sabor=None, solo_disponibles=False):
    return {"productos": [
        {"marca":"Lost Mary Dura", "sabor":"Blueberry Watermelon"},
        {"marca":"Lost Mary Dura", "sabor":"Nuevo Sabor Futuro"},
        {"marca":"Modelo Recien Ingresado 80k", "sabor":"Cherry Galaxy"},
    ]}
`, "utf8");
    const deployedValidator = join(root, "scripts", "validar_catalogo_venta.py");
    copyFileSync(validatorPath, deployedValidator);
    const output = execFileSync(python, [deployedValidator], { encoding:"utf8" });
    expect(JSON.parse(output)).toMatchObject({
      ok:true,
      solo_lectura:true,
      filas_revisadas:3,
      modelos_revisados:2,
      sabores_revisados:3,
      modelos_alterados_por_alias:[],
      combinaciones_duplicadas:[],
    });
  });
});

describe("aislamiento y validacion del parche administrativo", () => {
  it("solo instala archivos dentro del workspace vaprizziobot", () => {
    expect(installer).toContain("VAPRIZZIOBOT_TARGET");
    expect(installer).toContain("scripts/agente_vaprizzio.py");
    expect(installer).not.toContain("chat-vaprizzio-test.service");
    expect(installer).not.toContain("extensions/vaprizzio-tools");
    expect(installer).not.toContain("skills/ventas");
  });

  it("la auditoria del catalogo hace una sola consulta general y no escribe", () => {
    expect(validator.match(/consultar_stock\(/g)).toHaveLength(1);
    expect(validator).toContain("marca=None");
    expect(validator).toContain("solo_disponibles=False");
    expect(validator).not.toMatch(/registrar_venta|restar_stock|sumar_stock|update_cell|append_row/);
  });
});
