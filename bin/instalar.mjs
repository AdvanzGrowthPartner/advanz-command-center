#!/usr/bin/env node
// Instalador del Advanz Command Center para Claude Code.
//   npx github:AdvanzGrowthPartner/advanz-command-center               → instala o actualiza las skills en ~/.claude/skills
//   npx github:AdvanzGrowthPartner/advanz-command-center desinstalar   → las quita (los datos del usuario no se tocan)
// Sin dependencias. No toca la carpeta de trabajo del usuario (command-center/<marca>/).
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS = ["actualizar-command-center", "configurar-command-center"];
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
const destino = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "skills");
const marca = join(destino, SKILLS[0], "VERSION");
const cmd = (process.argv[2] ?? "instalar").toLowerCase();

const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`✖ El Command Center necesita Node.js 18 o superior (tienes ${process.versions.node}). Instálalo desde https://nodejs.org`);
  process.exit(1);
}

if (cmd === "desinstalar" || cmd === "uninstall") {
  for (const s of SKILLS) rmSync(join(destino, s), { recursive: true, force: true });
  console.log("✔ Command Center desinstalado. Tus datos (carpetas command-center/) siguen donde estaban.");
  process.exit(0);
}

if (cmd === "version" || cmd === "--version" || cmd === "-v") {
  console.log(existsSync(marca) ? `instalado: ${readFileSync(marca, "utf8").trim()} · disponible: ${pkg.version}` : `no instalado · disponible: ${pkg.version}`);
  process.exit(0);
}

if (cmd !== "instalar" && cmd !== "install" && cmd !== "actualizar") {
  console.log("Uso: npx github:AdvanzGrowthPartner/advanz-command-center [instalar | desinstalar | version]");
  process.exit(1);
}

const anterior = existsSync(marca) ? readFileSync(marca, "utf8").trim() : null;
mkdirSync(destino, { recursive: true });
for (const s of SKILLS) {
  rmSync(join(destino, s), { recursive: true, force: true });
  cpSync(join(here, "..", "skills", s), join(destino, s), { recursive: true });
}
writeFileSync(marca, `${pkg.version}\n`);

console.log(
  anterior
    ? anterior === pkg.version
      ? `✔ Advanz Command Center ${pkg.version} reinstalado.`
      : `✔ Advanz Command Center actualizado: ${anterior} → ${pkg.version}.`
    : `✔ Advanz Command Center ${pkg.version} instalado.`,
);
console.log(`  Skills en ${destino}`);
console.log("");
console.log("Siguiente paso: abre una conversación nueva en Claude Code y escribe:");
console.log(anterior ? '  "Actualiza mi Command Center"' : '  "Configura mi Command Center"');
