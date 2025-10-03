const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const UsersModel = require('../../src/models/Users.model');

describe('Users Model', () => {
  afterEach(() => sinon.restore());

  it('softDeleteUserByEmail calls query', async () => {
    sinon.stub(prisma.users, 'updateMany').resolves();
    await UsersModel.softDeleteUserByEmail('a@b.com');
    expect(prisma.users.updateMany.called).to.be.true;
  });
});
