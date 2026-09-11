const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function id(value) { if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail(400, 'Invalid label or transaction reference.'); return Number(value); }
function kind(value) { if (!['category','tag'].includes(value)) fail(400, 'Invalid label type.'); return value; }
function fields(input) {
    if (typeof input?.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) fail(400, 'Label name must contain 1 to 60 characters.');
    if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) fail(400, 'Choose a valid label color.');
    return { name: input.name.trim(), color: input.color.toLowerCase() };
}
async function locked(userId, callback) {
    return db.runTransaction(async tx => {
        const users = await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${id(userId)} AND archived = false AND verified = true FOR NO KEY UPDATE`);
        if (!users.length) fail(401, 'Your account is unavailable.');
        return callback(tx);
    });
}
async function list(userId, type) {
    return db.$queryRaw(Prisma.sql`SELECT id,kind,name,color,archived FROM ledger_labels WHERE user_id=${id(userId)} ${type ? Prisma.sql`AND kind=${kind(type)}` : Prisma.empty} ORDER BY archived,name,id`);
}
async function save(userId, type, input, labelId) {
    const data = fields(input), labelKind = kind(type), user = id(userId);
    if (input.archived !== undefined && typeof input.archived !== 'boolean') fail(400, 'Archived must be a boolean.');
    return locked(user, async tx => {
        const duplicate = await tx.$queryRaw(Prisma.sql`SELECT id FROM ledger_labels WHERE user_id=${user} AND kind=${labelKind} AND lower(name)=lower(${data.name}) ${labelId ? Prisma.sql`AND id <> ${id(labelId)}` : Prisma.empty}`);
        if (duplicate.length) fail(409, 'This label already exists, including archived labels. Rename or restore it.');
        if (!labelId) return (await tx.$queryRaw(Prisma.sql`INSERT INTO ledger_labels(user_id,kind,name,color) VALUES (${user},${labelKind},${data.name},${data.color}) RETURNING id,kind,name,color,archived`))[0];
        const rows = await tx.$queryRaw(Prisma.sql`UPDATE ledger_labels SET name=${data.name},color=${data.color} ${input.archived !== undefined ? Prisma.sql`,archived=${input.archived}` : Prisma.empty} WHERE id=${id(labelId)} AND user_id=${user} AND kind=${labelKind} RETURNING id,kind,name,color,archived`);
        if (!rows.length) fail(404, 'Label not found.'); return rows[0];
    });
}
async function archive(userId, type, labelId) {
    return locked(userId, async tx => {
        const rows = await tx.$queryRaw(Prisma.sql`UPDATE ledger_labels SET archived=true WHERE id=${id(labelId)} AND user_id=${id(userId)} AND kind=${kind(type)} RETURNING id,kind,name,color,archived`);
        if (!rows.length) fail(404, 'Label not found.'); return rows[0];
    });
}
function ids(value, max = 100) {
    if (!Array.isArray(value) || value.length > max) fail(400, `Choose at most ${max} entries.`);
    const values = value.map(id); if (new Set(values).size !== values.length) fail(400, 'Duplicate references are not allowed.'); return values;
}
async function assign(userId, input = {}) {
    const user = id(userId), transactions = ids(input.transactionIds);
    if (!transactions.length) fail(400, 'Select at least one transaction.');
    const hasCategory = Object.hasOwn(input, 'categoryId');
    const category = hasCategory && input.categoryId !== null ? id(input.categoryId) : null;
    const add = ids(input.addTagIds || [], 20), remove = ids(input.removeTagIds || [], 20);
    if (!hasCategory && !add.length && !remove.length) fail(400, 'Choose a category or tag action.');
    if (add.some(value => remove.includes(value))) fail(400, 'A tag cannot be added and removed together.');
    return locked(user, async tx => {
        const accounts = await tx.$queryRaw(Prisma.sql`SELECT DISTINCT account_id FROM transactions WHERE id IN (${Prisma.join(transactions)}) ORDER BY account_id`);
        if (accounts.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM accounts WHERE id IN (${Prisma.join(accounts.map(row => row.account_id))}) ORDER BY id FOR UPDATE`);
        const visible = await tx.$queryRaw(Prisma.sql`SELECT t.id FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.id IN (${Prisma.join(transactions)}) AND t.archived=false AND a.archived=false AND EXISTS(SELECT 1 FROM account_users au WHERE au.account_id=a.id AND au.user_id=${user} AND au.archived=false)`);
        if (visible.length !== transactions.length) fail(404, 'One or more transactions are no longer accessible. Refresh the ledger.');
        const labels = [...new Set([...(category ? [category] : []), ...add, ...remove])];
        const available = labels.length ? await tx.$queryRaw(Prisma.sql`SELECT id,kind,archived FROM ledger_labels WHERE user_id=${user} AND id IN (${Prisma.join(labels)})`) : [];
        const valid = (value, type, allowArchived = false) => available.some(row => row.id === value && row.kind === type && (allowArchived || !row.archived));
        if ((category && !valid(category, 'category')) || add.some(value => !valid(value, 'tag')) || remove.some(value => !valid(value, 'tag', true))) fail(400, 'Choose your own active labels. Archived tags can only be removed.');
        for (const transaction of transactions) {
            if (hasCategory) await tx.$queryRaw(Prisma.sql`INSERT INTO ledger_annotations(user_id,transaction_id,category_id) VALUES(${user},${transaction},${category}) ON CONFLICT(user_id,transaction_id) DO UPDATE SET category_id=EXCLUDED.category_id RETURNING transaction_id`);
            if (remove.length) await tx.$queryRaw(Prisma.sql`DELETE FROM ledger_tag_assignments WHERE user_id=${user} AND transaction_id=${transaction} AND label_id IN (${Prisma.join(remove)}) RETURNING transaction_id`);
            for (const tag of add) await tx.$queryRaw(Prisma.sql`INSERT INTO ledger_tag_assignments(user_id,transaction_id,label_id) VALUES(${user},${transaction},${tag}) ON CONFLICT DO NOTHING RETURNING transaction_id`);
        }
        return { updated: transactions.length, message: 'Your ledger labels were updated.' };
    });
}
async function decorate(userId, entries) {
    if (!entries.length) return entries;
    const user = id(userId), entryIds = entries.map(row => id(row.id));
    const labels = await db.$queryRaw(Prisma.sql`SELECT a.transaction_id,l.id,l.kind,l.name,l.color,l.archived FROM ledger_annotations a JOIN ledger_labels l ON l.id=a.category_id AND l.user_id=a.user_id WHERE a.user_id=${user} AND a.transaction_id IN (${Prisma.join(entryIds)})
        UNION ALL SELECT a.transaction_id,l.id,l.kind,l.name,l.color,l.archived FROM ledger_tag_assignments a JOIN ledger_labels l ON l.id=a.label_id AND l.user_id=a.user_id WHERE a.user_id=${user} AND a.transaction_id IN (${Prisma.join(entryIds)})`);
    const lookup = new Map();
    for (const label of labels || []) { if (!lookup.has(label.transaction_id)) lookup.set(label.transaction_id, []); lookup.get(label.transaction_id).push(label); }
    return entries.map(entry => { const assigned = lookup.get(entry.id) || [], category = assigned.find(row => row.kind === 'category'); return { ...entry, ...(category ? { category: category.name, category_id: category.id } : {}), tags: assigned.filter(row => row.kind === 'tag').map(({transaction_id,...label}) => label) }; });
}
module.exports = { list, save, archive, assign, decorate };
