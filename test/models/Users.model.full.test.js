const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const UsersModel = require('../../src/models/Users.model');

describe('Users Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(prisma.users, 'updateMany').resolves({});
    sinon.stub(prisma.users, 'findMany').resolves([{ id: 1 }]);
    sinon.stub(prisma.users, 'create').resolves({ id: 1 });
    sinon.stub(prisma.user_details, 'create').resolves({});
    sinon.stub(prisma.users, 'update').resolves({});

    await UsersModel.softDeleteUserByEmail('a@b.com');
    await UsersModel.getUserDetailsByEmail('a@b.com');
    await UsersModel.findUserByEmailVerified('a@b.com');
    await UsersModel.findUserByEmail('a@b.com');
    await UsersModel.insertUser('a@b.com', 'h');
    await UsersModel.insertUserDetails(1);
    await UsersModel.setVerifiedByEmail('a@b.com');

    expect(prisma.users.findMany.called).to.be.true;
  });
});
