const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();

app.use(bodyParser.json());
app.use(cors());

const JWT_SECRET = `${process.env.JWT_SECRET}`;
const JWT_REFRESH_SECRET = `${process.env.JWT_REFRESH_SECRET}`;

const generateAccessToken = (user) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "15m" });
};
const generateRefreshToken = (user) => {
  return jwt.sign(user, JWT_REFRESH_SECRET, { expiresIn: "7d" });
};
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};
app.post("/api/token", (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ error: "Invalid or expired refresh token" });
    }

    const newAccessToken = generateAccessToken({ user });
    res.json({ accessToken: newAccessToken });
  });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT email,password,super_user FROM users WHERE email = $1;",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Email not found" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const accessToken = generateAccessToken({ user });
    const refreshToken = generateRefreshToken({ user });
    res.json({ accessToken, refreshToken, message: "Login Successful" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.get("/dashboard", authenticateToken, (req, res) => {
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

app.delete("/api/users/:email", authenticateToken, async (req, res) => {
  const { email } = req.params;
  try {
    const token = req.headers["authorization"]?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token required" });
    }
    let valid = false;
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (user.user.email === email) {
        valid = true;
      } else {
        return res
          .status(401)
          .json({ error: "Unauthorized. Not your account." });
      }
      req.user = user;
    });
    if (valid) {
      const to_delete = await pool.query(
        "UPDATE users SET email = NULL,archived = true,archived_email = $1,super_user = false, password = 'DELETED', update_date = current_timestamp where email = $2;",
        [email, email]
      );
      res.json({message: "User Deleted Successfully"});
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});
// Get a single user by email
app.get("/api/users/:email", authenticateToken, async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      "SELECT id,email,create_date,update_date,super_user FROM users WHERE email = $1;",
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1;",
      [email]
    );
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query("INSERT INTO users (email, password ) VALUES ($1, $2)", [
      email,
      hashedPassword,
    ]);

    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
