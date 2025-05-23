const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../services/AuthService");

router.get("/", authenticateToken, (req, res) => {
  const dashboardData = {
    user: req.user,
    stats: {
      totalUsers: 1200,
      activeUsers: 890,
      newSignups: 34,
    },
    notifications: [
      { id: 1, message: "Welcome to the platform!", type: "info" },
      { id: 2, message: "Your profile is 80% complete.", type: "warning" },
    ],
  };

  res.json(dashboardData);
});

module.exports = router;
