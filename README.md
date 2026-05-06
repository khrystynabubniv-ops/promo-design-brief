# Vacancy Brief Generator

Internal Universe Group tool for generating promo vacancy design briefs with OpenRouter and creating designer tasks in Notion.

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
- `OPENROUTER_MAX_TOKENS` defaults to `8000`
- `OPENROUTER_TIMEOUT_MS` defaults to `240000`
- `OPENROUTER_SITE_URL` identifies the app in OpenRouter analytics

The vacancies field accepts plain vacancy text or public Ashby vacancy links.
Ashby links are resolved on the server before the brief is sent to OpenRouter.

## Scripts

- `npm run dev` starts the local Next.js server.
- `npm run build` creates a production build.
- `npm run start` starts the production server.
- `npm run typecheck` runs TypeScript checks.
