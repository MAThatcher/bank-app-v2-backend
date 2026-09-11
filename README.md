# Bank App v2 — Backend

The API behind **Imperial Bank of Terra**, a Warhammer 40,000-themed banking application with shared vaults, transaction ledgers, notifications, security controls, and administrator tools.

Built with Node.js, Express 4, PostgreSQL, Prisma 6, JWT, and Nodemailer. See the companion [frontend repository](https://github.com/MAThatcher/bank-app-v2-frontend) for the React interface.

## Features

| Area | Capabilities |
| --- | --- |
| Identity | Registration, email verification, login, token refresh, logout, password recovery, and password changes |
| Vaults | Account creation, membership, ownership transfers, overdraft settings, renaming, and zero-balance closure |
| Transactions | Ledger entries, atomic transfers, search, filters, category spending summaries, and CSV exports |
| Personal labels | Custom categories and colored tags, archive/restore, and bulk assignment to up to 100 entries |
| Notifications | In-app inbox, unread counts, dismissal, persisted email delivery with retries, and independent channel preferences |
| Dashboard preferences | Vault ordering, hidden balances, default account, and shortcuts |
| Security | Database-backed login sessions, session revocation, and security alerts |
| Disputes | Transaction reports, case history, withdrawal, and independent administrator review |
| Administration | User and vault directories, role management, session revocation, audit history, and read-only impersonation |

Transfers use exact monetary values, linked ledger entries, database transactions, and idempotency checks. Account operations recheck membership under locks. Personal labels do not change another member's organization or transaction amounts. Dispute decisions do not automatically move money.

## Local setup

Run commands from this repository's root. You need Node.js and npm, a running PostgreSQL instance, and `psql` for the initial schema import.

```sh
npm ci
```

Install development dependencies too: Prisma Client and Nodemailer currently live in `devDependencies`, although the application needs them at runtime.

### 1. Configure the environment

Create **`src/config/.env`**, the file explicitly loaded by the server and database helper scripts:

```dotenv
DATABASE_URL=postgresql://bankapp_user:replace_me@localhost:5432/bankappv2?schema=public
JWT_SECRET=replace_with_a_long_random_access_secret
JWT_REFRESH_SECRET=replace_with_a_different_long_random_refresh_secret
CLIENT_URL=http://localhost:3000
PORT=5000
EMAIL_USER=your_sender@gmail.com
EMAIL_PASS=your_mail_app_password
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=24h
NOTIFICATION_EMAIL_ENABLED=true
NODE_ENV=development
LOG_LEVEL=info
```

Use your own credentials and secrets; do not commit the environment file. `CLIENT_URL` controls the allowed browser origin and links in emails. Match it to the frontend address.

The current transport uses Gmail on port 465 in [NodeMailer.js](src/services/NodeMailer.js). Another provider requires changing that transport. `NOTIFICATION_EMAIL_ENABLED=false` pauses queued notification delivery; it does **not** disable registration verification or password-reset emails.

Access tokens default to 15 minutes and refresh sessions to 24 hours. Refresh does not extend a session's absolute lifetime. Production mode enables secure refresh cookies, so production traffic needs HTTPS.

### 2. Initialize an empty database

Create a PostgreSQL database owned by your application database user. Import the base schema using your actual host, user, and database name:

```sh
psql -h localhost -U bankapp_user -d bankappv2 -v ON_ERROR_STOP=1 -f src/config/DataBase_init.sql
```

**Use this initializer only for an empty database. It contains `DROP TABLE` statements and can destroy existing data.** Existing installations should skip this step and use the additive upgrades below.

### 3. Apply feature upgrades

Stop the backend before upgrading. Run these commands for a fresh base schema or an existing installation:

```sh
npm run db:enable-transfers
npm run db:enable-notification-email
npm run db:enable-security-sessions
npm run db:enable-preferences-disputes
npm run db:enable-impersonation
npm run db:enable-ledger-labels
npm run prisma:generate
```

These upgrades are additive and repeatable; existing application records are preserved. Their SQL lives in [prisma/sql](prisma/sql). The scripts load `DATABASE_URL` from `src/config/.env`.

Use the provided Prisma scripts so configuration loads consistently. `prisma:introspect` rewrites the local schema from the database; `prisma:migrate` invokes the Prisma development migration workflow. Neither replaces the documented feature upgrades.

### 4. Start the API

```sh
npm start
```

The default address is [http://localhost:5000](http://localhost:5000). `GET /` returns `API is running...`. Start the frontend separately on port 3000. There is no `dev` script or automatic backend reload; restart after backend changes.

Starting the server also starts the notification email worker. It checks the persisted queue every 10 seconds and retries temporary failures up to five attempts. Missing mail credentials or an invalid `CLIENT_URL` pause delivery while retaining queued mail. Importing the exported Express app does not start the worker automatically.

## First administrator

Register and verify an account, then run:

```sh
node scripts/bootstrap-admin.js user@example.com
```

This local operator command grants the first administrator role, records an audit event, and invalidates the account's sessions. Sign in again and open `/admin` in the frontend. It refuses to run if an active verified administrator already exists; manage additional roles in the panel.

Impersonation requires a reason and provides read-only support access bound to the original administrator session. It expires after 15 minutes or at parent-session expiry, whichever comes first. No target-user tokens are issued.

## API map

Prefixes are exact: account, transaction, and notification use singular names. Protected requests use `Authorization: Bearer <access-token>`. Browser clients must include credentials for the HTTP-only refresh cookie.

| Prefix | Main operations |
| --- | --- |
| `/api/auth` | `POST /login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` |
| `/api/users` | Registration at `POST /`, current user at `GET /`, email verification, passwords, sessions, and preferences |
| `/api/dashboard` | Authenticated dashboard data |
| `/api/account` | Vaults, balances, settings, members, ownership, and overdrafts |
| `/api/transaction` | Transaction creation, account ledger, `/transfer`, `/transfer-accounts`, `/search`, `/summary`, `/export` |
| `/api/transaction/categories` and `/api/transaction/tags` | Personal label catalogs and item management |
| `/api/transaction/bulk/labels` | `PATCH` atomic personal label assignment |
| `/api/transaction/disputes` | Case listing, details, and updates; creation uses `POST /api/transaction/dispute/:transactionId` |
| `/api/notification` | Inbox, unread count, filters, and dismissal |
| `/api/admin` | Directories, roles, audit history, dispute review, and impersonation start |
| `/api/impersonation/:id` | `DELETE` ends the original administrator's support context |

The registered routes in [src/views](src/views) are the source of truth. Commented-out routes are planning notes, not available endpoints. Read the corresponding controllers and services for payload validation and permission rules.

## Tests

Run the backend suite serially:

```sh
node node_modules/jest/bin/jest.js --runInBand
```

For coverage and open-handle diagnostics:

```sh
node node_modules/jest/bin/jest.js --runInBand --coverage --detectOpenHandles
```

`npm test` also enables coverage and open-handle diagnostics. Reports are written to `coverage/`.

Run real PostgreSQL regression checks:

```sh
npm run test:transfers:db
```

Despite its historical name, this command covers transfers, notifications, security, preferences, disputes, administration, impersonation, and labels. It uses `DATABASE_URL`, creates and removes an isolated schema, and requires permission to create schemas. It does not change application records or send real emails.

## Repository layout

```text
prisma/
  schema.prisma       Prisma data model
  sql/                Additive feature upgrades
scripts/              Schema helpers, Prisma wrapper, admin bootstrap
src/
  index.js            Express entry point and worker startup
  config/             Runtime environment location and base initializer
  controllers/        HTTP handlers
  middleware/         Request IDs, errors, impersonation guard
  models/             Data access helpers
  prisma/             Shared database adapter
  services/           Business rules, authentication, mail, reporting
  utilities/          Logging utilities
  views/              Express routers
test/                Backend suites and PostgreSQL regression harness
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing tables or columns | Apply all feature upgrades, regenerate Prisma, and restart |
| Prisma generation reports a Windows file lock | Stop backend processes using Prisma Client, then retry |
| Browser requests fail | Match frontend `REACT_APP_API_BASE` to the API origin and backend `CLIENT_URL` to the frontend origin |
| Notification mail stays queued | Check credentials, `CLIENT_URL`, worker startup logs, and user notification preferences |
| Login is required after a role or password change | Session invalidation is expected; sign in again |
| A commented route returns 404 | Use the registered routes in `src/views` |
