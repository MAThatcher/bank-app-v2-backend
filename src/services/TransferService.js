
const { randomUUID } = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../prisma/client');
const TransactionsModel = require('../models/Transactions.model');
const NotificationsModel = require('../models/Notifications.model');

const LIMIT = new Prisma.Decimal('99999999999.99');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function money(value, positive = false) {
    try {
        if (!['string', 'number'].includes(typeof value)) throw new Error();
        const result = new Prisma.Decimal(value);
        if (!result.isFinite() || result.decimalPlaces() > 2 || result.abs().gt(LIMIT) || (positive && !result.gt(0))) {
            throw new Error();
        }
        return result;
    } catch {
        throw problem(400, 'INVALID_AMOUNT', 'Use a valid amount with at most two decimal places within the supported range.');
    }
}

function accountId(value) {
    if (!['string', 'number'].includes(typeof value) || !Number.isInteger(Number(value)) || Number(value) <= 0 || Number(value) > 2147483647) {
        throw problem(400, 'INVALID_ACCOUNT', 'Select two valid vaults.');
    }
    return Number(value);
}

function validate(input) {
    const sourceId = accountId(input.sourceAccountId);
    const destinationId = accountId(input.destinationAccountId);
    if (sourceId === destinationId) throw problem(400, 'SAME_ACCOUNT', 'Select two different vaults.');
    if (typeof input.idempotencyKey !== 'string' || !UUID.test(input.idempotencyKey)) {
        throw problem(400, 'INVALID_REQUEST_KEY', 'A valid transfer request key is required.');
    }
    if (input.description != null && typeof input.description !== 'string') {
        throw problem(400, 'INVALID_DESCRIPTION', 'The description must be text.');
    }
    const description = (input.description || '').trim();
    if (description.length > 512) throw problem(400, 'INVALID_DESCRIPTION', 'Keep the description to 512 characters or fewer.');
    return {
        sourceId, destinationId, description,
        amount: money(input.amount, true),
        sourceBefore: money(input.expectedSourceBalance),
        destinationBefore: money(input.expectedDestinationBalance),
        key: input.idempotencyKey.toLowerCase(),
    };
}

function receipt(transfer, replayed = false) {
    return {
        replayed,
        transfer: {
            id: transfer.id,
            sourceAccountId: transfer.source_account_id,
            destinationAccountId: transfer.destination_account_id,
            amount: transfer.amount.toFixed(2),
            description: transfer.description,
            sourceBalanceBefore: transfer.source_balance_before.toFixed(2),
            sourceBalanceAfter: transfer.source_balance_after.toFixed(2),
            destinationBalanceBefore: transfer.destination_balance_before.toFixed(2),
            destinationBalanceAfter: transfer.destination_balance_after.toFixed(2),
            createdAt: transfer.create_date,
        },
    };
}

function replay(existing, request) {
    if (existing.source_account_id !== request.sourceId || existing.destination_account_id !== request.destinationId ||
        !existing.amount.eq(request.amount) || existing.description !== request.description ||
        !existing.source_balance_before.eq(request.sourceBefore) || !existing.destination_balance_before.eq(request.destinationBefore)) {
        throw problem(409, 'REQUEST_KEY_REUSED', 'This request key belongs to a different transfer. Review a new transfer before continuing.');
    }
    return receipt(existing, true);
}

async function listAccounts(userId) {
    return prisma.accounts.findMany({
        where: { archived: false, account_users: { some: { user_id: userId, archived: false, users: { archived: false } } } },
        select: { id: true, name: true, balance: true, overdraft: true },
        orderBy: { id: 'asc' },
    });
}

async function createTransfer(userId, input) {
    if (!Number.isInteger(userId) || userId <= 0) throw problem(401, 'INVALID_USER', 'Sign in to transfer funds.');
    const request = validate(input);
    const key = { user_id_request_key: { user_id: userId, request_key: request.key } };
    const existing = await prisma.transfers.findUnique({ where: key });
    if (existing) return replay(existing, request);

    try {
        return await prisma.runTransaction(async tx => {
            // Always lock in the same order, including transfers in opposite directions.
            // This also serializes transfers with ordinary deposits and withdrawals.
            const ids = [request.sourceId, request.destinationId].sort((a, b) => a - b);
            await tx.$queryRaw(Prisma.sql`SELECT id FROM accounts WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);

            // A simultaneous retry may have committed while this request waited for locks.
            const completed = await tx.transfers.findUnique({ where: key });
            if (completed) return replay(completed, request);

            const accounts = await tx.accounts.findMany({
                where: {
                    id: { in: ids }, archived: false,
                    account_users: { some: { user_id: userId, archived: false, users: { archived: false } } },
                },
                select: { id: true, balance: true, overdraft: true },
            });
            if (accounts.length !== 2) {
                throw problem(404, 'VAULT_UNAVAILABLE', 'Both vaults must be active and accessible to you.');
            }
            const source = accounts.find(account => account.id === request.sourceId);
            const destination = accounts.find(account => account.id === request.destinationId);
            if (source.balance === null || destination.balance === null) {
                throw problem(409, 'BALANCE_UNAVAILABLE', 'A vault balance is unavailable. Contact support before transferring.');
            }
            if (!source.balance.eq(request.sourceBefore) || !destination.balance.eq(request.destinationBefore)) {
                throw problem(409, 'BALANCE_CHANGED', 'A vault balance changed. Refresh the balances and review this transfer again.');
            }
            const sourceAfter = source.balance.minus(request.amount);
            const destinationAfter = destination.balance.plus(request.amount);
            if (!source.overdraft && sourceAfter.isNegative()) {
                throw problem(422, 'INSUFFICIENT_FUNDS', 'The source vault does not have enough funds and overdraft is not permitted.');
            }
            if (sourceAfter.abs().gt(LIMIT) || destinationAfter.abs().gt(LIMIT)) {
                throw problem(422, 'BALANCE_LIMIT', 'This transfer would exceed a vault balance limit.');
            }

            const transfer = await tx.transfers.create({
                data: {
                    id: randomUUID(), user_id: userId, request_key: request.key,
                    source_account_id: source.id, destination_account_id: destination.id,
                    amount: request.amount, description: request.description,
                    source_balance_before: source.balance, source_balance_after: sourceAfter,
                    destination_balance_before: destination.balance, destination_balance_after: destinationAfter,
                },
            });
            const debit = await TransactionsModel.applyBalanceChange(request.amount.negated(), source.id, tx);
            const credit = await TransactionsModel.applyBalanceChange(request.amount, destination.id, tx);
            if (debit.count !== 1 || credit.count !== 1) {
                throw problem(409, 'VAULT_UNAVAILABLE', 'The vaults could not be updated. No funds were transferred.');
            }
            const suffix = request.description ? ' — ' + request.description : '';
            await tx.transactions.create({
                data: {
                    user_id: userId, account_id: source.id, amount: request.amount.negated(),
                    description: 'Transfer to vault #' + destination.id + suffix, category: 'Transfer', transfer_id: transfer.id,
                },
            });
            await tx.transactions.create({
                data: {
                    user_id: userId, account_id: destination.id, amount: request.amount,
                    description: 'Transfer from vault #' + source.id + suffix, category: 'Transfer', transfer_id: transfer.id,
                },
            });
            await NotificationsModel.createNotification(
                `Transfer complete: ${request.amount.toFixed(2)} ₮ from vault #${source.id} to vault #${destination.id}. Reference: ${transfer.id}.`,
                userId, tx, 'transfer'
            );
            return receipt(transfer);
        }, { maxWait: 10000, timeout: 15000 });
    } catch (error) {
        // The unique key is the final guard even if two different account pairs
        // are submitted concurrently with the same request key.
        if (error.code === 'P2002') {
            const completed = await prisma.transfers.findUnique({ where: key });
            if (completed) return replay(completed, request);
        }
        throw error;
    }
}

module.exports = { listAccounts, createTransfer };

