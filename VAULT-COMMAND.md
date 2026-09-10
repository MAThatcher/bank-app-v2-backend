# Vault Command

Owners can open a vault ledger and choose **Manage vault**. The protected page is `/account/:accountId/settings`.

- Rename the vault (1–100 trimmed characters).
- View active members and add an existing verified user by email. Members can read the ledger, record deposits/withdrawals, and transfer funds; adding access requires a review in the UI.
- Remove members after confirmation. The owner cannot remove themselves. Removed memberships are archived; historical transaction records are preserved.
- Transfer ownership to an active, verified member after explicit confirmation. The former owner remains a member and loses settings access immediately.
- Enable/disable overdraft. Only a boolean permission is supported, not a configurable credit limit. Negative balances must be cleared before disabling overdraft.
- Close a vault only when the balance is exactly zero, after typing its current name. Memberships, the vault, and ledger entries are archived, never deleted. The UI cannot reopen a closed vault.

Access additions, removals, ownership transfers, and closures create in-app notifications and queued emails within the same transaction. Email transport runs after commit. No real user accounts are changed by the automated tests.

## Backend contract

All management routes require the current owner and an active account. Owner checks run after acquiring the account row lock. The same lock coordinates transfers and ordinary transactions with removals, closure, and overdraft changes.

- `GET /api/account/:accountId/settings`: `{ account, members }`; only owners can see the member roster.
- `PATCH /api/account/:accountId`: `{ accountName }`.
- `PATCH /api/account/:accountId/overdraft`: `{ overdraft: boolean }`.
- `POST /api/account/:accountId/users`: `{ email }`.
- `DELETE /api/account/:accountId/users`: `{ userId }`.
- `PATCH /api/account/:accountId/transfer-ownership`: `{ email, confirm: true }`.
- `DELETE /api/account/:accountId`: `{ confirmName }` matching the current vault name.
- `GET /api/account/:accountId/balance`: balance for an active authorized member.

Invalid requests return 400, inaccessible management resources return 404, and conflicting state returns 409. The UI requires a refresh after a failed or uncertain mutation before issuing another order. Repeated removal does not issue duplicate alerts. Concurrent additions are serialized to prevent duplicate active memberships.

Existing database tables suffice; no migration is needed for this feature. The notification email migration from the previous feature must already be applied.

## Verification

Backend: `npm test -- --runInBand`.

PostgreSQL: `npm run test:transfers:db`. The isolated-schema suite also covers settings permissions, duplicate additions, removal, ownership changes, closure races, history preservation, and revocation during a withdrawal.

Frontend: `npm run test:vault`, followed by `npm run build`.
