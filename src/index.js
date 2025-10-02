const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'config', '.env') });

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

let app = express();

app.use(bodyParser.json());
app.use(cors());
app.disable("x-powered-by");

const accountRoutes = require("./routes/accounts.routes");
const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes.js");
const notificationRoutes = require("./routes/notifications.routes");
const transactionRoutes = require("./routes/transactions.routes");
const userRoutes = require("./routes/users.routes");

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/transaction", transactionRoutes);
app.use("/api/notification", notificationRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('JWT_SECRET loaded:', process.env.JWT_SECRET ? 'yes' : 'no');
    console.log('Env file used:', path.resolve(__dirname, 'config', '.env'));
  });
}
