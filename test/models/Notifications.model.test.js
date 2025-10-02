const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const NotificationsModel = require('../../src/models/Notifications.model');

describe('Notifications Model', () => {
  afterEach(() => sinon.restore());

  it('getNotificationsForUser returns rows', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    const res = await NotificationsModel.getNotificationsForUser(1);
    expect(res.rows).to.deep.equal([{ id: 1 }]);
  });
});
