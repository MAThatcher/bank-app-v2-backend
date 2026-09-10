# Vault transfers

Transfers move funds between two active accounts where the signed-in user has active membership. The source account's overdraft policy applies.

## Existing database upgrade

Run these commands from the backend directory:

1. npm run db:enable-transfers
2. npm run prisma:generate
3. Restart the backend.

The upgrade adds the transfers table and a nullable transactions.transfer_id column. Existing transactions remain ordinary ledger entries. The SQL upgrade is transactional and can be run repeatedly.

On Windows, stop the running backend before regenerating Prisma's client so its library is not locked.

## API

Both endpoints require the existing bearer authentication.

GET /api/transaction/transfer-accounts returns accessible active vaults with id, name, balance, and overdraft.

POST /api/transaction/transfer accepts:

    {
      "sourceAccountId": 1,
      "destinationAccountId": 2,
      "amount": "10.75",
      "description": "Supply reserve",
      "expectedSourceBalance": "100.25",
      "expectedDestinationBalance": "25.10",
      "idempotencyKey": "6e0ae27a-18d7-43f7-96ed-e031178bfd28"
    }

Amounts are decimal strings with up to two decimal places. The expected balances come from the confirmation screen. A stale balance returns HTTP 409 with code BALANCE_CHANGED and requires a fresh review.

A new transfer returns HTTP 201. Retrying the same payload with the same key returns HTTP 200 with replayed: true and the original receipt. Keys are scoped to the requesting user. Reusing a key for different transfer contents returns HTTP 409 with code REQUEST_KEY_REUSED.

Both balances, the transfer record, and the two linked ledger entries commit in one database transaction. Account rows are locked in increasing ID order. A unique request key prevents duplicate postings even when different requests arrive simultaneously.

Other errors: 400 invalid input, 404 inaccessible/archived vault, 422 insufficient funds or balance limits. Unexpected server failures return TRANSFER_UNCONFIRMED; clients should retry the same key and payload because the response may have been lost after commit.

## Frontend behavior

Transfers are available in navigation and from each vault's Transfer funds action. The browser retains the exact pending request in sessionStorage, scoped to the user, before submitting. A reload or interrupted response offers Check transfer result using that same request. Successful receipts link to both ledgers, whose entries share a transfer reference.

## Tests

- Backend suite: node node_modules/jest/bin/jest.js --runInBand --coverage --detectOpenHandles
- Real PostgreSQL checks: npm run test:transfers:db
- Frontend feature tests, from the frontend directory: npm run test:transfers

The PostgreSQL checks create and remove a dedicated temporary schema. They do not modify application accounts or balances. DATABASE_URL is loaded from src/config/.env; the database user must be able to create a schema.
