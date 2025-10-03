const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const AuthService = require('../../src/services/AuthService');
const prisma = require('../../src/prisma/client');

describe('AuthService - full', () => {
  afterEach(() => sinon.restore());

  it('generateRefreshToken returns token and writes to db', async () => {
    sinon.stub(jwt, 'sign').returns('rtok');
    sinon.stub(prisma, 'runTransaction').resolves();
    const res = AuthService.generateRefreshToken({ user: { id: 2 } });
    expect(res).to.equal('rtok');
    expect(prisma.runTransaction.called).to.be.true;
  });
});
