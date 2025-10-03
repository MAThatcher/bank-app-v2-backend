const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;

const prisma = require('../../src/prisma/client');
const NotificationsModel = require('../../src/models/Notifications.model');

describe('Notifications Model - full', () => {
  afterEach(() => sinon.restore());

  it('calls all exported functions', async () => {
    sinon.stub(prisma.notifications, 'findMany').resolves([{ id: 1 }]);
    sinon.stub(prisma.notifications, 'findFirst').resolves({ id: 1 });
    sinon.stub(prisma.notifications, 'updateMany').resolves({});
    sinon.stub(prisma.notifications, 'create').resolves({});

    await NotificationsModel.getNotificationsForUser(1);
    await NotificationsModel.getNotificationById(1, 2);
    await NotificationsModel.dismissNotification(1, 2);
    await NotificationsModel.createNotification('m', 1);
    expect(prisma.notifications.findMany.called).to.be.true;
  });
});
