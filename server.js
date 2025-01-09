const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

let app = express();

app.use(bodyParser.json());
app.use(cors());
app.disable("x-powered-by");

const dashboardRoutes = require("./routes/Dashboard");
const userRoutes = require("./routes/Users");
const authRoutes = require("./routes/Auth");
const accountRoutes = require("./routes/Account");
const transactionRoutes = require("./routes/Transaction");
const notificationRoutes = require("./routes/Notification");

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/transaction", transactionRoutes);
app.use("/api/notification", notificationRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} else {
  module.exports = app;
}
