const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'config', '.env') });

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const morgan = require('morgan');
const logger = require('./Utilities/logger.js');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');

let app = express();

app.use(bodyParser.json());
app.use(cors());

app.use(requestId);

morgan.token('id', function getId(req) { return req.requestId; });
app.use(morgan(':id :remote-addr - :method :url :status :response-time ms', { stream: { write: (message) => logger.info(message.trim()) } }));
app.disable("x-powered-by");

const accountRoutes = require("./views/accounts.routes");
const authRoutes = require("./views/auth.routes");
const dashboardRoutes = require("./views/dashboard.routes.js");
const notificationRoutes = require("./views/notifications.routes");
const transactionRoutes = require("./views/transactions.routes");
const userRoutes = require("./views/users.routes");

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/transaction", transactionRoutes);
app.use("/api/notification", notificationRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});
app.use(errorHandler);
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.debug('JWT_SECRET loaded: %s', process.env.JWT_SECRET ? 'yes' : 'no');
    logger.debug('Env file used: %s', path.resolve(__dirname, 'config', '.env'));
  });
}
