# NetForge Academy

An interactive networking learning platform. It combines a guided curriculum with a deterministic network simulation engine and server-validated hands-on labs.

Learners **see** a concept, **simulate** it, **build** it, **break** it, **debug** it and **prove** it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design: product, system, ERD, simulation engine, learning engine, API, security, roadmap, infrastructure and risks.

## Repository layout

| Path | What it is |
|---|---|
| `packages/sim-engine` | Pure TypeScript simulator. It covers devices, interfaces, links, ARP, MAC learning, VLANs and 802.1Q trunks, routing (connected, static and default), router-on-a-stick, TTL, ping and traceroute. It also has an IOS-style CLI, a host shell, diagnostics, lab validation and a seeded subnetting generator. |
| `packages/content` | Zod content schemas plus the seed curriculum: 14 modules, 64 lessons, 21 quizzes, 12 labs, 9 challenges and 3 projects. It also holds the skills, certification-domain mapping and achievements. |
| `apps/api` | Fastify, Prisma and PostgreSQL. Covers auth (scrypt, HttpOnly sessions, CSRF header), learning, assessment (server-side quiz grading and lab re-validation), progress, gamification and admin. |
| `apps/web` | Next.js 16, React 19, Tailwind 4 and React Flow. Contains the public site, the student app, the simulator UI and the admin content builder. |
| `tools/local-db` | A real PostgreSQL 16 server from npm binaries, for development when Docker is unavailable. |

## Run it locally

Requirements: Node 22+ and pnpm 10+.

```bash
pnpm install

# 1) Database — choose one
pnpm db:up            # Docker: postgres:16 on localhost:5433
pnpm db:local         # No Docker: embedded PostgreSQL 16 on localhost:5433 (keep running)

# 2) Configure (defaults already work locally)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3) Schema + seed
pnpm db:migrate
pnpm db:seed

# 4) API (:4000) and web (:3000)
pnpm dev
```

Open http://localhost:3000.

Seeded accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@netforge.local` | `ChangeMe-Admin-2026` (set `SEED_ADMIN_PASSWORD` to change) |
| Student | `student@netforge.local` | `Student-Demo-2026` |

No learner progress is seeded; all progress comes from real activity.

## Tests

```bash
pnpm test        # engine (27) + curriculum (48: every lab is proven solvable and initially unsolved) + API integration (14, needs the DB)
pnpm typecheck
pnpm e2e         # Playwright: needs `pnpm dev` running (first time: pnpm --filter @netforge/web exec playwright install chromium)
```

## Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

The API image runs `prisma migrate deploy` on start. CI is defined in `.github/workflows/ci.yml` and runs typecheck, unit and integration tests, builds, and E2E.

## What is deliberately not built yet

The following are roadmap items, and the UI shows no placeholder buttons for them:
- DHCP, DNS, NAT, STP, OSPF and IPv6 simulators. These topics are taught conceptually today.
- A RouterOS CLI. The MikroTik track is lessons and quizzes for now.
- Multilayer-switch SVIs.
- The AI tutor.
- Payments and community features.

See the roadmap in `docs/ARCHITECTURE.md` §11.
