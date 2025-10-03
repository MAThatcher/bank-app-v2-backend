const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const NotificationsModel = require('../../src/models/Notifications.model');

describe('Notifications Model', () => {
  afterEach(() => sinon.restore());

  it('getNotificationsForUser returns rows', async () => {
    sinon.stub(prisma.notifications, 'findMany').resolves([{ id: 1 }]);
    const res = await NotificationsModel.getNotificationsForUser(1);
    expect(res.rows).to.deep.equal([{ id: 1 }]);
  });
});
