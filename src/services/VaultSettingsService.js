const { Prisma } = require('@prisma/client');
const prisma = require('../prisma/client');
const Notifications = require('../models/Notifications.model');
function problem(status, message) { const error = new Error(message); error.status = status; throw error; }
function id(value) {
    if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) problem(400, 'Choose a valid vault or member.');
    return Number(value);
}
const accountFields = { id: true, name: true, owner: true, balance: true, overdraft: true, archived: true, update_date: true };
async function owned(userId, accountId, operation) {
    const user = id(userId), account = id(accountId);
    return prisma.runTransaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM accounts WHERE id = ${account} FOR UPDATE`);
        const vault = await tx.accounts.findFirst({ where: { id: account, archived: false, owner: user, users: { archived: false } }, select: accountFields });
        if (!vault) problem(404, 'Vault unavailable. Only its current owner can manage it.');
        return operation(tx, vault, user);
    });
}
async function members(tx, accountId) {
    const rows = await tx.account_users.findMany({ where: { account_id: accountId, archived: false, users: { archived: false } },
        select: { users: { select: { id: true, email: true, verified: true } } }, orderBy: { id: 'asc' } });
    return [...new Map(rows.filter(row => row.users).map(row => [row.users.id, row.users])).values()];
}
const notify = (tx, user, message) => Notifications.createNotification(message, user, tx, 'membership');
async function targetUser(tx, email) {
    if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) problem(400, 'Enter a valid email address.');
    const matches = await tx.users.findMany({ where: { email: { equals: email.trim(), mode: 'insensitive' }, archived: false, verified: true }, select: { id: true }, take: 2 });
    if (matches.length !== 1) problem(404, 'No eligible verified user was found for that email.');
    return matches[0].id;
}
const service = {
    settings: (user, account) => owned(user, account, async (tx, vault) => ({ account: vault, members: await members(tx, vault.id) })),
    rename: (user, account, input) => owned(user, account, async (tx, vault) => {
        const name = input.accountName;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) problem(400, 'Vault name must contain 1 to 100 characters.');
        await tx.accounts.update({ where: { id: vault.id }, data: { name: name.trim(), update_date: new Date() } });
        return { message: 'Vault name updated.' };
    }),
    overdraft: (user, account, input) => owned(user, account, async (tx, vault) => {
        if (typeof input.overdraft !== 'boolean') problem(400, 'Overdraft must be enabled or disabled.');
        if (vault.balance == null) problem(409, 'The vault balance is unavailable.');
        if (!input.overdraft && new Prisma.Decimal(vault.balance).isNegative()) problem(409, 'Bring the balance to zero or above before disabling overdraft.');
        await tx.accounts.update({ where: { id: vault.id }, data: { overdraft: input.overdraft, update_date: new Date() } });
        return { message: 'Overdraft permission updated.' };
    }),
    add: (user, account, input) => owned(user, account, async (tx, vault, owner) => {
        const target = await targetUser(tx, input.email);
        const existing = await tx.account_users.findFirst({ where: { account_id: vault.id, user_id: target, archived: false } });
        if (existing || target === owner) problem(409, 'This user already has access to the vault.');
        // The vault lock serializes competing additions, including re-adding removed members.
        await tx.account_users.create({ data: { account_id: vault.id, user_id: target } });
        await notify(tx, target, `You have been granted access to vault #${vault.id}.`);
        await notify(tx, owner, `A member has been added to vault #${vault.id}.`);
        return { message: 'Member added.', userId: target };
    }),
    remove: (user, account, input) => owned(user, account, async (tx, vault, owner) => {
        const target = id(input.userId);
        if (target === owner) problem(409, 'The owner cannot be removed. Transfer ownership first.');
        const result = await tx.account_users.updateMany({ where: { account_id: vault.id, user_id: target, archived: false }, data: { archived: true, update_date: new Date() } });
        if (result.count) {
            await notify(tx, target, `Your access to vault #${vault.id} has been removed.`);
            await notify(tx, owner, `A member has been removed from vault #${vault.id}.`);
        }
        return { message: result.count ? 'Member removed.' : 'This member no longer has access.' };
    }),
    transfer: (user, account, input) => owned(user, account, async (tx, vault, owner) => {
        if (input.confirm !== true) problem(400, 'Confirm the ownership transfer before continuing.');
        const target = await targetUser(tx, input.email);
        if (target === owner) problem(409, 'Choose a different owner.');
        const member = await tx.account_users.findFirst({ where: { account_id: vault.id, user_id: target, archived: false } });
        if (!member) problem(409, 'The new owner must already be an active member.');
        await tx.accounts.update({ where: { id: vault.id }, data: { owner: target, update_date: new Date() } });
        await notify(tx, target, `You are now the owner of vault #${vault.id}.`);
        await notify(tx, owner, `Ownership of vault #${vault.id} has been transferred. You retain member access.`);
        return { message: 'Ownership transferred. You retain member access.', newOwnerId: target };
    }),
    close: (user, account, input) => owned(user, account, async (tx, vault) => {
        if (input.confirmName !== vault.name) problem(400, 'Type the current vault name to confirm closure.');
        if (vault.balance == null || !new Prisma.Decimal(vault.balance).isZero()) problem(409, 'The vault balance must be exactly zero before closure.');
        const recipients = new Set([vault.owner, ...(await members(tx, vault.id)).map(member => member.id)]);
        await tx.account_users.updateMany({ where: { account_id: vault.id }, data: { archived: true, update_date: new Date() } });
        await tx.accounts.update({ where: { id: vault.id }, data: { archived: true, update_date: new Date() } });
        await tx.transactions.updateMany({ where: { account_id: vault.id }, data: { archived: true, update_date: new Date() } });
        for (const recipient of recipients) await notify(tx, recipient, `Vault #${vault.id} has been closed. Its ledger records are retained in the archive.`);
        return { message: 'Vault closed. Ledger records were retained.' };
    }),
};
module.exports = service;
