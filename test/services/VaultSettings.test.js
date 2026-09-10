const { Prisma } = require('@prisma/client');
const prisma = require('../../src/prisma/client');
const service = require('../../src/services/VaultSettingsService');
let tx, vault;
beforeEach(() => {
 vault = { id: 12, owner: 7, name: 'Reserve', balance: new Prisma.Decimal(0), overdraft: false };
 tx = {
  $queryRaw: jest.fn().mockResolvedValue([]),
  accounts: { findFirst: jest.fn().mockImplementation(async () => vault), update: jest.fn().mockResolvedValue({}) },
  users: { findMany: jest.fn().mockResolvedValue([{ id: 8 }]) },
  account_users: { findMany: jest.fn().mockResolvedValue([{ users: { id: 7, email: 'owner@test.example', verified: true } }, { users: { id: 8, email: 'member@test.example', verified: true } }]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  transactions: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  notifications: { create: jest.fn().mockResolvedValue({}) },
 };
 jest.spyOn(prisma, 'runTransaction').mockImplementation(cb => cb(tx));
});
afterEach(() => jest.restoreAllMocks());
test.each(['settings', 'rename', 'overdraft', 'add', 'remove', 'transfer', 'close'])('%s rechecks owner authority after locking the vault', async method => {
 tx.accounts.findFirst.mockResolvedValue(null);
 await expect(service[method](9, 12, {})).rejects.toMatchObject({ status: 404 });
 expect(tx.$queryRaw.mock.calls[0][0].values).toEqual([12]);
 expect(tx.accounts.findFirst.mock.calls[0][0].where).toEqual({ id: 12, archived: false, owner: 9, users: { archived: false } });
 expect(tx.accounts.update).not.toHaveBeenCalled(); expect(tx.notifications.create).not.toHaveBeenCalled();
});
test('member roster includes only active users and deduplicates legacy membership rows', async () => {
 const row = { users: { id: 7, email: 'owner@test.example' } }; tx.account_users.findMany.mockResolvedValue([row,row]);
 const result = await service.settings(7, 12);
 expect(result.members).toHaveLength(1);
 expect(tx.account_users.findMany.mock.calls[0][0].where).toEqual({ account_id: 12, archived: false, users: { archived: false } });
});
test.each(['', ' ', 'a'.repeat(101), null])('invalid rename %p is rejected', async accountName => {
 await expect(service.rename(7,12,{ accountName })).rejects.toMatchObject({ status: 400 });
});
test('rename trims the accepted name', async () => {
 await service.rename(7,12,{ accountName: ' New Reserve ' }); expect(tx.accounts.update.mock.calls[0][0].data.name).toBe('New Reserve');
});
test.each(['false', 0, null])('overdraft rejects non-boolean %p', async overdraft => { await expect(service.overdraft(7,12,{ overdraft })).rejects.toMatchObject({ status: 400 }); });
test('negative balances cannot lose overdraft permission', async () => { vault.balance = new Prisma.Decimal('-0.01'); await expect(service.overdraft(7,12,{ overdraft:false })).rejects.toMatchObject({ status:409 }); });
test('enabling overdraft stores a real boolean', async () => { await service.overdraft(7,12,{ overdraft:true }); expect(tx.accounts.update.mock.calls[0][0].data.overdraft).toBe(true); });
test('adding a member queues both access alerts in the same transaction', async () => {
 await service.add(7,12,{ email:'member@test.example' });
 expect(tx.account_users.create).toHaveBeenCalledWith({ data:{ account_id:12,user_id:8 } });
 expect(tx.notifications.create.mock.calls.map(([args])=>args.data.user_id)).toEqual([8,7]);
 expect(tx.notifications.create.mock.calls[0][0].data.email_status).toBe('pending');
});
test('unverified or ambiguous email cannot be added', async () => { tx.users.findMany.mockResolvedValue([]); await expect(service.add(7,12,{email:'a@test.example'})).rejects.toMatchObject({status:404}); });
test('existing membership cannot be duplicated', async () => { tx.account_users.findFirst.mockResolvedValue({id:1}); await expect(service.add(7,12,{email:'a@test.example'})).rejects.toMatchObject({status:409}); });
test('owner removal is forbidden', async () => { await expect(service.remove(7,12,{userId:7})).rejects.toMatchObject({status:409}); expect(tx.account_users.updateMany).not.toHaveBeenCalled(); });
test('removal archives all matching memberships and alerts both parties', async () => { await service.remove(7,12,{userId:8}); expect(tx.account_users.updateMany.mock.calls[0][0].where).toEqual({account_id:12,user_id:8,archived:false}); expect(tx.notifications.create).toHaveBeenCalledTimes(2); });
test('repeated removal does not duplicate notifications', async () => { tx.account_users.updateMany.mockResolvedValue({count:0}); await service.remove(7,12,{userId:8}); expect(tx.notifications.create).not.toHaveBeenCalled(); });
test('ownership requires explicit confirmation', async () => { await expect(service.transfer(7,12,{email:'a@test.example'})).rejects.toMatchObject({status:400}); });
test('archived membership cannot inherit ownership', async () => { await expect(service.transfer(7,12,{email:'a@test.example',confirm:true})).rejects.toMatchObject({status:409}); });
test('ownership changes preserve membership and alert both owners', async () => { tx.account_users.findFirst.mockResolvedValue({id:1}); await service.transfer(7,12,{email:'a@test.example',confirm:true}); expect(tx.accounts.update.mock.calls[0][0].data.owner).toBe(8); expect(tx.account_users.updateMany).not.toHaveBeenCalled(); expect(tx.notifications.create).toHaveBeenCalledTimes(2); });
test('closure requires the current vault name', async () => { await expect(service.close(7,12,{confirmName:'Old name'})).rejects.toMatchObject({status:400}); });
test('closure archives the vault, memberships and ledger without deleting records', async () => { await service.close(7,12,{confirmName:'Reserve'}); expect(tx.accounts.update.mock.calls[0][0].data.archived).toBe(true); expect(tx.transactions.updateMany).toHaveBeenCalled(); expect(tx.notifications.create).toHaveBeenCalledTimes(2); });
test('notification errors fail the containing transaction', async () => { tx.notifications.create.mockRejectedValue(new Error('queue failed')); await expect(service.add(7,12,{email:'a@test.example'})).rejects.toThrow('queue failed'); });
test.each([0,-1,'x','999999999999999999'])('invalid vault %s is rejected before opening a transaction', async value => { await expect(service.settings(7,value)).rejects.toMatchObject({status:400}); expect(prisma.runTransaction).not.toHaveBeenCalled(); });
