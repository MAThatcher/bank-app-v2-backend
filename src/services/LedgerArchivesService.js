const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
function bad(message) { const error = new Error(message); error.status = 400; throw error; }
function positiveId(value) {
    if (typeof value !== 'string' && typeof value !== 'number') bad('Invalid vault or page reference.');
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) bad('Invalid vault or page reference.');
    return Number(value);
}
function parse(query = {}) {
    const filters = {};
    for (const [key, max] of [['q',200],['category',1020]]) {
        if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > max)) bad(`Invalid ${key} filter.`);
        if (query[key]?.trim()) filters[key] = query[key].trim();
    }
    for (const key of ['from','to']) {
        if (query[key] === undefined || query[key] === '') continue;
        const value = query[key];
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9998-12-31') bad('Use a valid date in YYYY-MM-DD format.');
        const date = new Date(value + 'T00:00:00Z');
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) bad('Use a valid calendar date.');
        filters[key] = value;
    }
    if (filters.from && filters.to && filters.from > filters.to) bad('The start date must not follow the end date.');
    for (const key of ['minAmount','maxAmount']) {
        if (query[key] === undefined || query[key] === '') continue;
        if (typeof query[key] !== 'string' || !/^\d+(\.\d{1,2})?$/.test(query[key])) bad('Amount filters must be positive values with at most two decimal places.');
        const amount = new Prisma.Decimal(query[key]);
        if (amount.gt('99999999999.99')) bad('The amount filter exceeds the supported range.');
        filters[key] = amount.toFixed(2);
    }
    if (filters.minAmount && filters.maxAmount && new Prisma.Decimal(filters.minAmount).gt(filters.maxAmount)) bad('Minimum amount must not exceed maximum amount.');
    if (query.accountId !== undefined && query.accountId !== '') filters.accountId = positiveId(query.accountId);
    if (query.before !== undefined && query.before !== '') filters.before = positiveId(query.before);
    if (query.type !== undefined && query.type !== '') {
        if (!['deposit','withdrawal','transfer'].includes(query.type)) bad('Choose a valid transaction type.');
        filters.type = query.type;
    }
    return filters;
}
function scope(userId, filters) {
    const conditions = [Prisma.sql`t.archived = false`, Prisma.sql`a.archived = false`, Prisma.sql`EXISTS (
        SELECT 1 FROM account_users au JOIN users u ON u.id = au.user_id
        WHERE au.account_id = t.account_id AND au.user_id = ${positiveId(userId)} AND au.archived = false AND u.archived = false
    )`];
    if (filters.accountId) conditions.push(Prisma.sql`t.account_id = ${filters.accountId}`);
    if (filters.q) conditions.push(Prisma.sql`strpos(lower(concat_ws(' ', t.description, t.category, a.name, t.transfer_id::text)), lower(${filters.q})) > 0`);
    if (filters.category) conditions.push(Prisma.sql`t.category = ${filters.category}`);
    if (filters.from) conditions.push(Prisma.sql`t.create_date >= ${filters.from}::date`);
    if (filters.to) conditions.push(Prisma.sql`t.create_date < (${filters.to}::date + INTERVAL '1 day')`);
    if (filters.minAmount) conditions.push(Prisma.sql`abs(t.amount) >= ${filters.minAmount}::numeric`);
    if (filters.maxAmount) conditions.push(Prisma.sql`abs(t.amount) <= ${filters.maxAmount}::numeric`);
    if (filters.type === 'deposit') conditions.push(Prisma.sql`t.transfer_id IS NULL AND t.amount > 0`);
    if (filters.type === 'withdrawal') conditions.push(Prisma.sql`t.transfer_id IS NULL AND t.amount < 0`);
    if (filters.type === 'transfer') conditions.push(Prisma.sql`t.transfer_id IS NOT NULL`);
    return Prisma.join(conditions, ' AND ');
}
const totals = Prisma.sql`count(*)::int AS count,
    coalesce(sum(amount) FILTER (WHERE transfer_id IS NULL AND amount > 0), 0)::text AS income,
    coalesce(sum(-amount) FILTER (WHERE transfer_id IS NULL AND amount < 0), 0)::text AS spending,
    coalesce(sum(amount) FILTER (WHERE transfer_id IS NULL), 0)::text AS net,
    count(*) FILTER (WHERE transfer_id IS NOT NULL)::int AS "transferEntries"`;
const amounts = row => ({ ...row, income: new Prisma.Decimal(row.income).toFixed(2), spending: new Prisma.Decimal(row.spending).toFixed(2), net: new Prisma.Decimal(row.net).toFixed(2) });
async function rows(tx, where, before, limit) {
    return tx.$queryRaw(Prisma.sql`SELECT t.id, t.account_id AS "accountId", a.name AS "accountName", t.description,
        t.category, t.amount::text AS amount, t.create_date AS "createdAt", t.transfer_id AS "transferId"
        FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE ${where}
        ${before ? Prisma.sql`AND t.id < ${before}` : Prisma.empty} ORDER BY t.id DESC LIMIT ${limit}`);
}
async function report(tx, where) {
    const cte = Prisma.sql`WITH filtered AS (SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE ${where})`;
    const overall = await tx.$queryRaw(Prisma.sql`${cte} SELECT ${totals} FROM filtered`);
    const monthly = await tx.$queryRaw(Prisma.sql`${cte} SELECT coalesce(to_char(create_date, 'YYYY-MM'), 'Undated') AS month, ${totals} FROM filtered GROUP BY month ORDER BY month DESC`);
    const categories = await tx.$queryRaw(Prisma.sql`${cte} SELECT category, ${totals} FROM filtered WHERE transfer_id IS NULL GROUP BY category ORDER BY sum(abs(amount)) DESC, category`);
    return { totals: amounts(overall[0]), monthly: monthly.map(amounts), categories: categories.map(amounts) };
}
async function search(userId, query) {
    const filters = parse(query), where = scope(userId, filters);
    return db.runTransaction(async tx => {
        const entries = await rows(tx, where, filters.before, 51);
        const reports = await report(tx, where);
        return { entries: entries.slice(0,50).map(row => ({ ...row, amount: new Prisma.Decimal(row.amount).toFixed(2) })),
            nextCursor: entries.length > 50 ? entries[49].id : null, ...reports };
    }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}
async function summary(userId, query) { return db.runTransaction(tx => report(tx, scope(userId, parse(query))), { isolationLevel: 'RepeatableRead', timeout: 15000 }); }
function cell(value, text = true) {
    let output = String(value ?? '');
    if (text && (/^[\s\u0000-\u001f]*[=+@-]/.test(output) || /^[\t\r\n]/.test(output))) output = "'" + output;
    return '"' + output.replace(/"/g, '""') + '"';
}
async function exportCsv(userId, query) {
    const entries = await rows(db, scope(userId, parse(query)), null, 10001);
    if (entries.length > 10000) { const error = new Error('This export exceeds 10,000 entries. Narrow the filters and try again.'); error.status = 413; throw error; }
    const lines = ['Entry ID,Vault ID,Vault,Date (UTC),Type,Category,Description,Amount,Transfer reference'];
    for (const entry of entries) {
        const amount = new Prisma.Decimal(entry.amount);
        const type = entry.transferId ? (amount.isNegative() ? 'Transfer out' : 'Transfer in') : (amount.isNegative() ? 'Withdrawal' : 'Deposit');
        lines.push([cell(entry.id,false),cell(entry.accountId,false),cell(entry.accountName),cell(entry.createdAt?.toISOString() || ''),cell(type),cell(entry.category),cell(entry.description),cell(amount.toFixed(2),false),cell(entry.transferId)].join(','));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
}
module.exports = { parse, scope, search, summary, exportCsv, cell };
