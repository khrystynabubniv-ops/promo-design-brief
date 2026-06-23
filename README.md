# PR Comms Tools

Internal Universe Group workspace for PR and communications tools.

Current tools:

- `Promo Brief Generator`: вакансії або Ashby-лінки → промо-брифи для дизайнерів → задачі в Notion.
- `SMM Universe Generator`: матеріал / тема / інтервʼю → варіанти тексту поста та/або структура каруселі в TOV Universe.

## Stakeholder Guide

- [Інструкція для стейкхолдера](docs/stakeholder-instruction.md)

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

- `OPENROUTER_API_KEY`
- `NOTION_TOKEN`
- `NEXT_PUBLIC_APP_TITLE`

Optional environment variables:

- `OPENROUTER_MODEL` defaults to `anthropic/claude-sonnet-4.6`
- `OPENROUTER_TEMPERATURE` defaults to `0.8`
- `OPENROUTER_MAX_TOKENS` defaults to `8000`
- `OPENROUTER_TIMEOUT_MS` defaults to `240000`
- `OPENROUTER_SITE_URL` identifies the app in OpenRouter analytics

The vacancies field accepts plain vacancy text or public Ashby vacancy links.
Ashby links are resolved on the server before the brief is sent to OpenRouter.

## SMM Universe Generator

The SMM tool uses the same server-side OpenRouter key. It returns validated JSON for:

- `caption`: variants with angle, text, CTA, and hashtags.
- `carousel`: idea, audience, slides, caption, CTA options, and alternative first-slide headlines.
- `both`: two separate OpenRouter calls, one for caption and one for carousel.

Generated SMM results are stored in the browser history panel for the current user/device.

Before production use, fill the reference post texts in `lib/referenceExamples.ts`. URLs are already included, but Instagram blocks automated reads, so the `text` fields must be pasted manually.

## Scripts

- `npm run dev` starts the local Next.js server.
- `npm run build` creates a production build.
- `npm run start` starts the production server.
- `npm run typecheck` runs TypeScript checks.
