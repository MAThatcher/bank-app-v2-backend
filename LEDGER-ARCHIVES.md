# Ledger Archives

Open **Ledger archives** in the signed-in navigation (`/archives`). Applied filters are stored in the URL, so a report can be bookmarked and browser Back/Forward restores its filters.

Search descriptions, categories, vault names, and transfer references. Filter by an accessible vault, UTC date range, amount magnitude, exact category, and transaction type. Date endpoints include the complete selected day. Minimum and maximum amounts use absolute values; choose Withdrawals to restrict negative entries. Search text is a literal case-insensitive substring; SQL wildcard characters are not treated as wildcards.

The ledger loads 50 entries at a time, ordered by descending entry ID (newest recorded first). Reports cover every matching entry, not only loaded pages. Monthly tables include months with matching activity, with undated legacy rows grouped separately. Category bars show each category's share of matching spending.

Income is the sum of positive non-transfer entries; spending is the magnitude of negative non-transfer entries; net flow is income minus spending, not an account balance. Linked transfers are excluded using `transfer_id`, including when only one side's vault is selected. A regular transaction categorized as `Transfer` still counts as ordinary activity. Amounts and report totals remain exact decimal strings through the API and display.

## Export

**Export matching CSV** downloads all matching entries, including pages not loaded. Apply edited filters before export. Downloads are limited to 10,000 rows; larger requests return an explicit error asking for narrower filters. The export endpoint ignores pagination cursors and does not silently truncate.

CSV includes entry ID, vault ID/name, UTC timestamp, transaction type, category, description, exact amount, and linked transfer reference. UTF-8 BOM supports spreadsheet applications. Quotes, commas, and line breaks are escaped. Formula-like text fields receive a leading apostrophe to prevent spreadsheet formula execution; numeric amount cells retain signed values.

## API and access

Authenticated endpoints:

- `GET /api/transaction/search`: entries, nextCursor, totals, monthly and category reports.
- `GET /api/transaction/summary`: totals, monthly and category reports.
- `GET /api/transaction/export`: CSV attachment.

Filters: `q`, `accountId`, `from`, `to`, `minAmount`, `maxAmount`, `category`, `type` (`deposit`, `withdrawal`, `transfer`). `before` is an entry-ID cursor for search only. Invalid input returns 400; oversized exports return 413.

Every query requires an active user membership in an active vault and excludes archived transactions. Duplicate legacy memberships cannot multiply entries or totals because access uses EXISTS. Search and its reports share a repeatable-read database snapshot. CSV is generated from a single scoped database query. Responses disable caching. Report exports do not write to bank records or send emails.

No database migration is required. Restart the backend after installing the feature.

## Verification

Backend: `npm test -- --runInBand`.

PostgreSQL: `npm run test:transfers:db`; its isolated-schema checks cover privacy, duplicate memberships, date boundaries, transfers, literal search, pagination, exact totals, export safety and archived vaults.

Frontend: `npm run test:archives` and `npm run build`.
