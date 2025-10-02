const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const pool = require('../../src/config/db');
const NotificationsModel = require('../../src/models/Notifications.model');

describe('Notifications Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(pool, 'query').resolves({ rows: [{ id: 1 }] });
    await NotificationsModel.getNotificationsForUser(1);
    await NotificationsModel.getNotificationById(1, 2);
    await NotificationsModel.dismissNotification(1, 2);
    await NotificationsModel.createNotification('m', 1);
    expect(pool.query.called).to.be.true;
  });
});
