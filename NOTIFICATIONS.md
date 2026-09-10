# Notifications

Open `/notifications` after signing in. The Astropathic Inbox supports unread and type filters, newest-first cursor pagination, individual dismissal, and dismiss-all. Dismissed records remain visible under All transmissions. Dismiss-all applies to the entire user's unread inbox, regardless of the selected filter.

The navigation badge refreshes every 30 seconds while the page is visible, on focus, and immediately after a successful transfer or dismissal. Failed badge requests display no count instead of claiming there are zero unread messages.

## Automatic events

- A new completed transfer creates one `transfer` notification for the initiating user, with the amount, vault IDs, and shared transfer reference. Retries reuse the existing transfer and do not create another alert.
- Adding a member creates `membership` notifications for that member and the vault owner.
- Transferring ownership notifies the new and previous owners.

Notifications are written inside the originating database transaction. A notification insertion failure rolls back that operation. Historical activity is not backfilled.

## Email delivery

New automatic transfer and membership notifications also queue an email to their recipient's active, verified account address. The existing Gmail transport uses `EMAIL_USER`, `EMAIL_PASS`, and `CLIENT_URL`. Emails include a themed HTML layout, plain text, and a link to the notification inbox. General notes created through the legacy POST endpoint are in-app only.

The backend checks the persisted queue every 10 seconds. Mail sends happen after the originating transaction commits; SMTP failure cannot roll back or delay a completed transfer. Temporary delivery failures retry with exponential delays (1, 2, 4, and 8 minutes), up to five attempts. Permanent SMTP rejections stop immediately. Deleted, unverified, or otherwise ineligible recipients are skipped. In-app dismissal does not cancel queued email.

Multiple backend processes coordinate using database row locks and five-minute leases. Expired leases can be reclaimed after a process restart. Successful SMTP acceptance marks an alert sent. SMTP cannot guarantee exactly-once delivery: if a connection or process fails after the provider accepts mail but before the database records success, a retry can duplicate the message. A stable Message-ID is reused, but inbox deduplication is not guaranteed.

Queue state is stored in `notifications.email_status` (`disabled`, `pending`, `processing`, `retry`, `sent`, `failed`, `skipped`), with attempt count, next attempt, lease, acceptance time, and a sanitized error code. These internal fields are excluded from notification API responses. Failed items remain recorded for investigation; no public retry endpoint is exposed.

Set `NOTIFICATION_EMAIL_ENABLED=false` to pause the worker while retaining queued mail. Missing SMTP credentials or an invalid CLIENT_URL also pause delivery and produce a server warning. The worker runs with `node src/index.js` / `npm start`; applications embedding the exported Express app must explicitly start it.

## API

All endpoints are under `/api/notification` and require authentication. Read and dismissal queries always use the authenticated user ID.

- `GET /`: array of notifications; optional `limit` (1–100, default 50), `before` (notification ID), `unread=true`, and `type`.
- `GET /unread`, `GET /unread/count`, `GET /type/:type`, `GET /:notificationId`.
- `PATCH /:notificationId`: dismiss an owned notification; returns 404 for missing or other users' records.
- `PATCH /`: dismiss all unread notifications; returns `{ "dismissed": number }`.
- Legacy `POST /`: creates a general note only for the authenticated user. Caller-supplied recipients and system event types are ignored.

Empty lists return HTTP 200 with `[]`. New lists are bounded and sorted by descending ID. Legacy null `dismissed` values count as unread.

For upgrades, stop the backend, run `npm run db:enable-notification-email`, regenerate Prisma with `npm run prisma:generate`, and restart it. The additive SQL upgrade is safe to repeat. Existing notifications default to `disabled`, so they are never emailed retroactively.

## Verification

Backend: `npm test -- --runInBand`

PostgreSQL checks: `npm run test:transfers:db` (creates and removes an isolated test schema; includes notification rollback, replay, and recipient-isolation checks).

Frontend: `npm run test:notifications`, `npm run test:transfers`, and `npm run build`.
