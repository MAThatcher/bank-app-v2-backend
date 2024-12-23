const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
let corsOption = {
  origin: 'trustedwebsite.com'
}
let app = express();
app.use(cors(corsOption));

app.use(bodyParser.json());
app.use(cors());

const dashboardRoutes = require("./routes/Dashboard");
const userRoutes = require("./routes/Users");
const authRoutes = require("./routes/Auth");

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
