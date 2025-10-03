const { PrismaClient } = require('@prisma/client');

// During unit tests we don't want Prisma to attempt to connect or validate
// environment variables. Jest runs with NODE_ENV=test so export a lightweight
// object whose model properties can be stubbed by sinon in tests.
if (process.env.NODE_ENV === 'test') {
	// minimal shape used by tests: provide methods so sinon.stub can replace them
	const noopAsync = async () => {};
	const makeModel = () => ({
		findMany: noopAsync,
		findUnique: noopAsync,
		findFirst: noopAsync,
		create: noopAsync,
		update: noopAsync,
		updateMany: noopAsync,
	});

	module.exports = {
		accounts: makeModel(),
		account_users: makeModel(),
		users: makeModel(),
		transactions: makeModel(),
		tokens: makeModel(),
		notifications: makeModel(),
		user_details: makeModel(),

		// runTransaction executes the callback with a transaction-like client. In tests
		// we simply pass the fake client object so stubs work. In real usage this is
		// overridden by the Prisma client's $transaction helper below.
		runTransaction: async (cb) => {
			// cb will receive the test client object
			return await cb(module.exports);
		},
	};
} else {
	// Single shared Prisma client for the app (production/dev)
	const prisma = new PrismaClient();

	// Convenience helper to run an interactive transaction. It forwards the
	// transaction client (tx) to the callback so model methods can use tx.*
	prisma.runTransaction = async (cb) => {
		return await prisma.$transaction(async (tx) => {
			return await cb(tx);
		});
	};

	module.exports = prisma;
}
