const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const AuthModel = require('../../src/models/Auth.model');

describe('Auth Model - full', () => {
  afterEach(() => sinon.restore());

  it('findUserByIdVerified calls db', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    const res = await AuthModel.findUserByIdVerified(1);
    expect(res.rows[0].id).to.equal(1);
  });
});
