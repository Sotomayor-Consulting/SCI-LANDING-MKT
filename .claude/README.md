# `.claude/` — Configuración de Claude Code (compartida)

Configuración de agentes y comandos **versionada en git**, para que todo el equipo (y las varias
landings del proyecto) comparta el mismo tooling. Complementa a `CLAUDE.md` (raíz), que contiene las
instrucciones globales del proyecto.

## Estructura

```
.claude/
├── README.md
├── agents/            # subagentes especializados (delegables)
│   ├── frontend-astro.md
│   ├── pages-functions.md
│   ├── leads-integration.md
│   └── code-reviewer.md
└── commands/          # skills / slash-commands del proyecto
    ├── pages-dev.md
    └── capi-test.md
```

## Subagentes (`agents/`)

Cada archivo define un subagente con frontmatter (`name`, `description`, `tools`) y un system
prompt. Claude Code puede delegarles automáticamente según la `description`, o los invocas por
nombre.

| Agente | Cuándo usarlo |
| --- | --- |
| `frontend-astro` | Páginas/componentes Astro, bloques Starwind, Tailwind, scripts de cliente. |
| `pages-functions` | Backend: Pages Functions (`functions/api/*`) e infraestructura (`functions/_infrastructure/*`). |
| `leads-integration` | Pipeline de leads: Supabase, n8n, Odoo, estrategia CAPI. |
| `code-reviewer` | Revisión de diffs (seguridad, PII, convenciones). Solo lectura. |

## Comandos (`commands/`)

Slash-commands reutilizables. Se invocan como `/nombre` (p. ej. `/pages-dev`, `/capi-test`).

| Comando | Qué hace |
| --- | --- |
| `/pages-dev` | Levanta el sitio + Functions con wrangler (`pnpm run pages:dev`). |
| `/capi-test [evento]` | Dispara un evento CAPI de prueba contra `/api/tiktok-capi`. |

## Convenciones para añadir más

- **Agente nuevo** → `agents/<nombre>.md` con `name`, `description` (redáctala para autodelegación:
  "Use this agent when…"), y `tools` acotadas al mínimo necesario.
- **Comando nuevo** → `commands/<nombre>.md` con `description` y `allowed-tools`; usa `$ARGUMENTS`
  para parámetros.
- Mantén los agentes **alineados con la arquitectura real** (sitio estático + Pages Functions, sin
  Astro Actions) y enlaza a `docs/` cuando aplique.
