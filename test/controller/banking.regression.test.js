
const { Prisma } = require('@prisma/client');
const prisma = require('../../src/prisma/client');
const AccountsModel = require('../../src/models/Accounts.model');
const TransactionsModel = require('../../src/models/Transactions.model');
const AccountsController = require('../../src/controllers/accounts.controller');
const TransactionsController = require('../../src/controllers/transactions.controller');

const response = () => {
    const res = {};
    for (const method of ['status', 'json', 'send']) res[method] = jest.fn().mockReturnValue(res);
    return res;
};
const transactionRequest = (amount) => ({
    user: { user: { id: 7 } },
    body: { accountId: 12, transactionAmount: amount, description: 'Regression entry', category: 'General' },
});

afterEach(() => jest.restoreAllMocks());

describe('Account detail authorization', () => {
    test('a valid login cannot read a vault belonging to somebody else', async () => {
        const query = jest.spyOn(prisma.account_users, 'findMany').mockImplementation(async ({ where }) => {
            const memberships = [{ account_id: 12, user_id: 99, archived: false }];
            return memberships.filter(row => Object.entries(where).every(([key, value]) => row[key] === value));
        });
        const details = jest.spyOn(AccountsModel, 'getAccountById');
        const res = response();
        await AccountsController.getAccountById({ params: { accountId: '12' }, user: { user: { id: 7 } } }, res);
        expect(query).toHaveBeenCalledWith({ where: { account_id: 12, user_id: 7, archived: false, accounts: { archived: false }, users: { archived: false } } });
        expect(res.status).toHaveBeenCalledWith(404);
        expect(details).not.toHaveBeenCalled();
    });

    test('an active shared member can read the vault', async () => {
        jest.spyOn(prisma.account_users, 'findMany').mockResolvedValue([{ account_id: 12, user_id: 7, archived: false }]);
        jest.spyOn(AccountsModel, 'getAccountById').mockResolvedValue({ rows: [{ id: 12, name: 'Shared vault' }] });
        const res = response();
        await AccountsController.getAccountById({ params: { accountId: '12' }, user: { user: { id: 7 } } }, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ id: 12, name: 'Shared vault' });
    });

    test('a missing identity never queries account membership', async () => {
        const membership = jest.spyOn(AccountsModel, 'checkUserHasAccess');
        const res = response();
        await AccountsController.getAccountById({ params: { accountId: '12' } }, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(membership).not.toHaveBeenCalled();
    });

    test('archived membership does not grant access', async () => {
        jest.spyOn(prisma.account_users, 'findMany').mockImplementation(async ({ where }) => {
            return where.archived === false ? [] : [{ account_id: 12, user_id: 7, archived: true }];
        });
        const res = response();
        await AccountsController.getAccountById({ params: { accountId: '12' }, user: { user: { id: 7 } } }, res);
        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe('Decimal transaction handling', () => {
    let balance, overdraft, tx, ledger;
    beforeEach(() => {
        balance = new Prisma.Decimal('100.25');
        overdraft = false;
        ledger = [];
        jest.spyOn(AccountsModel, 'getAccountById').mockResolvedValue({ rows: [{ id: 12 }] });
        jest.spyOn(TransactionsModel, 'checkUserAccountAccess').mockResolvedValue({ rows: [{ id: 1 }] });
        tx = {
            $queryRaw: jest.fn().mockResolvedValue([]),
            accounts: { updateMany: jest.fn(async ({ where, data }) => {
                const amount = data.balance.increment;
                const allowed = !where.OR || where.OR.some(condition =>
                    condition.overdraft === true ? overdraft : balance.gte(condition.balance.gte)
                );
                if (!allowed) return { count: 0 };
                balance = balance.plus(amount);
                return { count: 1 };
            }) },
            transactions: { create: jest.fn(async ({ data }) => { ledger.push(data); return { id: 1, ...data }; }) },
        };
        // Emulate commit/rollback so the controller must keep both writes in one callback.
        jest.spyOn(prisma, 'runTransaction').mockImplementation(async callback => {
            const before = balance, beforeLength = ledger.length;
            try { return await callback(tx); }
            catch (error) { balance = before; ledger.length = beforeLength; throw error; }
        });
    });

    test.each([
        ['100.25', 10.75, '111.00'],
        ['100.25', -10.75, '89.50'],
        ['0.10', '0.20', '0.30'],
        ['0.01', '-0.01', '0.00'],
        ['99999999999.98', '0.01', '99999999999.99'],
    ])('%s plus %s preserves every cent', async (start, amount, expected) => {
        balance = new Prisma.Decimal(start);
        const res = response();
        await TransactionsController.createTransaction(transactionRequest(amount), res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(balance.toFixed(2)).toBe(expected);
        expect(ledger[0].amount.toFixed(2)).toBe(new Prisma.Decimal(amount).toFixed(2));
        expect(tx.accounts.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.transactions.create).toHaveBeenCalledTimes(1);
    });

    test('one cent of overdraft is refused without creating a ledger entry', async () => {
        balance = new Prisma.Decimal('0.20');
        const res = response();
        await TransactionsController.createTransaction(transactionRequest('-0.21'), res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(balance.toFixed(2)).toBe('0.20');
        expect(ledger).toHaveLength(0);
    });

    test('an overdraft-enabled vault can go below zero by cents', async () => {
        overdraft = true; balance = new Prisma.Decimal('0');
        const res = response();
        await TransactionsController.createTransaction(transactionRequest('-0.01'), res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(balance.toFixed(2)).toBe('-0.01');
    });

    test.each(['bad', 'NaN', 'Infinity', '-Infinity', '0.001', '100000000000', '0', {}, [], true])(
        'rejects invalid amount %p before writing to the database', async amount => {
            const res = response();
            await TransactionsController.createTransaction(transactionRequest(amount), res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(prisma.runTransaction).not.toHaveBeenCalled();
        }
    );

    test('ledger failure rolls back the balance mutation', async () => {
        tx.transactions.create.mockRejectedValue(new Error('ledger write failed'));
        const res = response();
        await TransactionsController.createTransaction(transactionRequest('10.75'), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(balance.toFixed(2)).toBe('100.25');
        expect(ledger).toHaveLength(0);
    });

    test('both database operations use the transaction client', async () => {
        const outside = jest.spyOn(prisma.accounts, 'updateMany');
        const res = response();
        await TransactionsController.createTransaction(transactionRequest('-10.75'), res);
        expect(outside).not.toHaveBeenCalled();
        const mutation = tx.accounts.updateMany.mock.calls[0][0];
        expect(mutation.where.id).toBe(12);
        expect(mutation.where.archived).toBe(false);
        expect(mutation.where.OR[1].balance.gte.toString()).toBe('10.75');
        expect(mutation.data.balance.increment.toString()).toBe('-10.75');
    });

    test('concurrent deposits both contribute to the stored balance', async () => {
        balance = new Prisma.Decimal('0');
        const first = response(), second = response();
        await Promise.all([
            TransactionsController.createTransaction(transactionRequest('10.75'), first),
            TransactionsController.createTransaction(transactionRequest('2.25'), second),
        ]);
        expect(first.status).toHaveBeenCalledWith(201);
        expect(second.status).toHaveBeenCalledWith(201);
        expect(balance.toFixed(2)).toBe('13.00');
        expect(ledger).toHaveLength(2);
    });
});

describe('Zero balance account deletion', () => {
    const request = { params: { accountId: 12 }, user: { user: { id: 7 } }, body: { confirmName: 'Vault' } };
    function mockClosure(balance) {
        jest.spyOn(prisma.accounts, 'findFirst').mockResolvedValue({ id: 12, owner: 7, name: 'Vault', balance });
        jest.spyOn(prisma.account_users, 'findMany').mockResolvedValue([]);
        jest.spyOn(prisma.account_users, 'updateMany').mockResolvedValue({ count: 1 });
        return jest.spyOn(prisma.accounts, 'update').mockResolvedValue({});
    }
    test.each([new Prisma.Decimal('0.00'), '0.00', 0])('accepts a zero balance represented as %p', async balance => {
        const archive = mockClosure(balance);
        const res = response(); await AccountsController.deleteAccount(request, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(archive).toHaveBeenCalledWith({ where: { id: 12 }, data: { archived: true, update_date: expect.any(Date) } });
    });
    test.each(['0.01', '-0.01'])('refuses a non-zero Decimal balance of %s', async amount => {
        const archive = mockClosure(new Prisma.Decimal(amount));
        const res = response(); await AccountsController.deleteAccount(request, res);
        expect(res.status).toHaveBeenCalledWith(409); expect(archive).not.toHaveBeenCalled();
    });
    test('owner lookup excludes archived accounts rather than excluding a selected field', async () => {
        const find = jest.spyOn(prisma.accounts, 'findMany').mockResolvedValue([]);
        await AccountsModel.getAccountOwnerAndBalance(7, 12);
        expect(find).toHaveBeenCalledWith({
            where: { owner: 7, id: 12, archived: false },
            select: { balance: true, owner: true },
        });
    });
});


