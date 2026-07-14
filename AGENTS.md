# Agent Instructions

This repository is the Emniyet Spor Salonu pool and course operations pilot.

## Hard scope

- Vue 3/Vite client, Fastify API, PostgreSQL/Drizzle, single Docker image.
- Light mode only. Customer branding is primary; Zenit is a subtle provider label.
- QR, Supabase, online payment, public/member PWA, messaging delivery, AI, and official police marks are forbidden.
- Real personal data may be imported only from user-provided operational files into this authenticated deployment. Never commit source workbooks, exports, database dumps, credentials, or personal data to Git; do not print personal data in logs or chat.
- Keep `run.log` append-only.
- Never commit `.env`, secrets, generated runtime logs, or database files.

## Verification

## Setup

Run `npm ci`, copy `.env.example` to `.env`, and provide a local PostgreSQL connection before running database commands. Never use a production database URL in `.env`. Run `npm test` before handoff.

Run `npm run lint`, `npm run typecheck`, `npm run build`, database migration/seed checks, `npm run smoke:api`, and `docker build -t emniyet-spor-salonu:local .` before handoff when the local dependencies are available.
