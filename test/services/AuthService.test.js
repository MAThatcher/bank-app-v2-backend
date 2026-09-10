const chai = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const AuthService = require('../../src/services/AuthService');

describe('AuthService', () => {
  afterEach(() => sinon.restore());

  it('generateAccessToken returns token and writes to db', async () => {
    sinon.stub(jwt, 'sign').returns('tok');
    sinon.stub(jwt, 'decode').returns({ exp: 2000000000 });
    sinon.stub(prisma, 'runTransaction').resolves();
    const res = await AuthService.generateAccessToken({ user: { id: 1 } });
    expect(res).to.equal('tok');
    expect(prisma.runTransaction.called).to.be.true;
  });

  it('generateAccessToken propagates signing errors', async () => {
    sinon.stub(jwt, 'sign').throws(new Error('bad'));
    await require('assert').rejects(AuthService.generateAccessToken({ user: { id: 1 } }), /bad/);
  });
});
