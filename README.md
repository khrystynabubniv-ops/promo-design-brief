# Vacancy Brief Generator

Internal Universe Group tool for generating promo vacancy design briefs with Anthropic and creating designer tasks in Notion.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

- `ANTHROPIC_API_KEY`
- `NOTION_TOKEN`
- `NEXT_PUBLIC_APP_TITLE`

## Scripts

- `npm run dev` starts the local Next.js server.
- `npm run build` creates a production build.
- `npm run start` starts the production server.
- `npm run typecheck` runs TypeScript checks.
