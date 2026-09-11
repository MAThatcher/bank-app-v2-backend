
const { Prisma } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = require('../../src/prisma/client');
const service = require('../../src/services/TransferService');
const controller = require('../../src/controllers/transfers.controller');

const dec = n => new Prisma.Decimal(n);
let tx, input, saved;

beforeEach(() => {
    input = { sourceAccountId: 1, destinationAccountId: 2, amount: '10.75', description: 'Supply reserve',
        expectedSourceBalance: '100.25', expectedDestinationBalance: '25.10', idempotencyKey: randomUUID() };
    saved = null;
    jest.spyOn(prisma.transfers, 'findUnique').mockImplementation(async () => saved);
    tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
        accounts: {
            findMany: jest.fn().mockResolvedValue([{ id: 1, balance: dec('100.25'), overdraft: false }, { id: 2, balance: dec('25.10'), overdraft: false }]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transfers: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, create_date: new Date('2026-09-09T12:00:00Z') })),
        },
        transactions: { create: jest.fn().mockResolvedValue({}) },
        user_preferences: { findUnique: jest.fn().mockResolvedValue(null) }, notifications: { create: jest.fn().mockResolvedValue({}) },
    };
    jest.spyOn(prisma, 'runTransaction').mockImplementation(cb => cb(tx));
});
afterEach(() => jest.restoreAllMocks());

test('a transfer returns exact before/after balances and linked, opposing ledger entries', async () => {
    const result = await service.createTransfer(7, input);
    expect(result.replayed).toBe(false);
    expect(result.transfer).toMatchObject({ amount: '10.75', sourceBalanceBefore: '100.25', sourceBalanceAfter: '89.50',
        destinationBalanceBefore: '25.10', destinationBalanceAfter: '35.85' });
    expect(tx.transactions.create).toHaveBeenCalledTimes(2);
    const [debit, credit] = tx.transactions.create.mock.calls.map(([arg]) => arg.data);
    expect(debit.amount.toString()).toBe('-10.75');
    expect(credit.amount.toString()).toBe('10.75');
    expect(debit.transfer_id).toBe(result.transfer.id);
    expect(credit.transfer_id).toBe(result.transfer.id);
    expect(debit.description).toContain('vault #2');
    expect(credit.description).toContain('vault #1');
    expect(tx.accounts.findMany.mock.calls[0][0].where.account_users.some).toEqual({ user_id: 7, archived: false, users: { archived: false } });
    expect(tx.$queryRaw.mock.calls[0][0].values).toEqual([1, 2]);
});

test('retries return the original receipt without opening another money-moving transaction', async () => {
    const first = await service.createTransfer(7, input);
    saved = { ...tx.transfers.create.mock.calls[0][0].data, create_date: new Date() };
    prisma.runTransaction.mockClear();
    const second = await service.createTransfer(7, { ...input, amount: 10.75 });
    expect(second.transfer.id).toBe(first.transfer.id);
    expect(second.replayed).toBe(true);
    expect(prisma.runTransaction).not.toHaveBeenCalled();
});

test('same request key with different contents is rejected', async () => {
    await service.createTransfer(7, input);
    saved = { ...tx.transfers.create.mock.calls[0][0].data, create_date: new Date() };
    await expect(service.createTransfer(7, { ...input, amount: '11.00' })).rejects.toMatchObject({ status: 409, code: 'REQUEST_KEY_REUSED' });
});

test('duplicate discovered after the account lock does not post again', async () => {
    await service.createTransfer(7, input);
    const completed = { ...tx.transfers.create.mock.calls[0][0].data, create_date: new Date() };
    tx.transfers.findUnique.mockResolvedValue(completed);
    tx.transactions.create.mockClear();
    const result = await service.createTransfer(7, input);
    expect(result.replayed).toBe(true);
    expect(tx.transactions.create).not.toHaveBeenCalled();
});

test('unique-key races fetch the winner rather than rerunning the transfer', async () => {
    await service.createTransfer(7, input);
    const completed = { ...tx.transfers.create.mock.calls[0][0].data, create_date: new Date() };
    prisma.transfers.findUnique.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(completed);
    prisma.runTransaction.mockRejectedValue({ code: 'P2002' });
    expect((await service.createTransfer(7, input)).replayed).toBe(true);
});

test.each([
    ['amount', '0'], ['amount', '-0.01'], ['amount', '1.001'], ['amount', 'NaN'], ['amount', 'Infinity'], ['amount', {}],
    ['amount', '100000000000'], ['sourceAccountId', 0], ['destinationAccountId', 1], ['sourceAccountId', true],
    ['idempotencyKey', ''], ['description', {}], ['description', 'x'.repeat(513)], ['expectedSourceBalance', undefined],
])('invalid %s=%p is rejected before writes', async (field, value) => {
    await expect(service.createTransfer(7, { ...input, [field]: value })).rejects.toMatchObject({ status: 400 });
    expect(prisma.runTransaction).not.toHaveBeenCalled();
});

test('unauthenticated user cannot request a transfer', async () => {
    await expect(service.createTransfer(undefined, input)).rejects.toMatchObject({ status: 401 });
});

test('missing or inaccessible destination is rejected without writes', async () => {
    tx.accounts.findMany.mockResolvedValue([{ id: 1, balance: dec('100.25'), overdraft: false }]);
    await expect(service.createTransfer(7, input)).rejects.toMatchObject({ status: 404 });
    expect(tx.accounts.updateMany).not.toHaveBeenCalled();
});

test('a changed balance requires a new review', async () => {
    await expect(service.createTransfer(7, { ...input, expectedSourceBalance: '100.00' })).rejects.toMatchObject({ code: 'BALANCE_CHANGED' });
    expect(tx.accounts.updateMany).not.toHaveBeenCalled();
});

test('a one-cent overdraft is rejected', async () => {
    await expect(service.createTransfer(7, { ...input, amount: '100.26' })).rejects.toMatchObject({ status: 422, code: 'INSUFFICIENT_FUNDS' });
    expect(tx.accounts.updateMany).not.toHaveBeenCalled();
});

test('sanctioned overdraft is honored', async () => {
    tx.accounts.findMany.mockResolvedValue([{ id: 1, balance: dec('100.25'), overdraft: true }, { id: 2, balance: dec('25.10'), overdraft: false }]);
    expect((await service.createTransfer(7, { ...input, amount: '100.26' })).transfer.sourceBalanceAfter).toBe('-0.01');
});

test('destination overflow is rejected before debiting the source', async () => {
    tx.accounts.findMany.mockResolvedValue([{ id: 1, balance: dec('100.25'), overdraft: false }, { id: 2, balance: dec('99999999999.99'), overdraft: false }]);
    await expect(service.createTransfer(7, { ...input, expectedDestinationBalance: '99999999999.99' })).rejects.toMatchObject({ code: 'BALANCE_LIMIT' });
    expect(tx.accounts.updateMany).not.toHaveBeenCalled();
});

test('a second ledger failure rejects the entire transaction callback', async () => {
    tx.transactions.create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('ledger failed'));
    await expect(service.createTransfer(7, input)).rejects.toThrow('ledger failed');
});

test('opposite-direction transfers lock accounts in the same order', async () => {
    await service.createTransfer(7, { ...input, sourceAccountId: 2, destinationAccountId: 1, expectedSourceBalance: '25.10', expectedDestinationBalance: '100.25' });
    expect(tx.$queryRaw.mock.calls[0][0].values).toEqual([1, 2]);
});

test('API returns 201 for a new transfer and 200 for an idempotent replay', async () => {
    const create = jest.spyOn(service, 'createTransfer').mockResolvedValueOnce({ replayed: false, transfer: { id: 'one' } })
        .mockResolvedValueOnce({ replayed: true, transfer: { id: 'one' } });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await controller.createTransfer({ user: { user: { id: 7 } }, body: input }, res);
    expect(res.status).toHaveBeenLastCalledWith(201);
    await controller.createTransfer({ user: { user: { id: 7 } }, body: input }, res);
    expect(res.status).toHaveBeenLastCalledWith(200);
    expect(create).toHaveBeenCalledWith(7, input);
});


test('transfer alerts use the same transaction and are not recreated on replay', async () => {
    const first = await service.createTransfer(7, input);
    expect(tx.notifications.create).toHaveBeenCalledTimes(1);
    expect(tx.notifications.create.mock.calls[0][0].data).toMatchObject({ user_id: 7, type: 'transfer', dismissed: false });
    expect(tx.notifications.create.mock.calls[0][0].data.message).toContain(first.transfer.id);
    saved = { ...tx.transfers.create.mock.calls[0][0].data, create_date: new Date() };
    await service.createTransfer(7, input);
    expect(tx.notifications.create).toHaveBeenCalledTimes(1);
});
test('notification failure rejects the entire transfer transaction', async () => {
    tx.notifications.create.mockRejectedValue(new Error('notification insert failed'));
    await expect(service.createTransfer(7, input)).rejects.toThrow('notification insert failed');
});
