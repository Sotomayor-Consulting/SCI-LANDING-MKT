# SCI Landing MKT

Landing de captación para servicios de constitución y asesoría de LLC en Estados Unidos.

## Stack

- Astro 7
- Starwind UI 3
- Tailwind CSS 4
- TypeScript

## Desarrollo

```sh
pnpm install
pnpm dev
```

## Compilación

```sh
pnpm build
pnpm preview
```

La página principal está en `src/components/landing.astro`. Los componentes de Starwind instalados localmente están en `src/components/starwind` y su configuración en `starwind.config.json`.

## Documentación

La documentación del proyecto vive en [`docs/`](./docs/README.md):

- [Despliegue en Cloudflare Pages](./docs/deployment/cloudflare.md)
- [Integración de leads (Supabase · n8n · Odoo)](./docs/leads/integration.md)
- [Stack de captación](./docs/leads/stack.md)

Los archivos `CLAUDE.md` y `AGENTS.md` (raíz) contienen instrucciones para agentes/herramientas. La configuración compartida de Claude Code (subagentes y comandos) está en [`.claude/`](./.claude/README.md).
