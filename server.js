const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pool = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET;
const generateAccessToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "15m" });
};
const generateRefreshToken = (user) => {
  return jwt.sign(user, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
};
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET,
    (err, user) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
      }
      req.user = user;
      next();
    }
  );
};

// Login API Endpoint
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1;", [ email ]);
    if (result.rows.length === 0) { return res.status(401).json({ error: "Email not found" }); } 
    else if (result.archive === true) { return res.status(401).json({ error: "Account is deactivated" }); }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) { return res.status(401).json({ error: "Invalid password" }); }

    const accessToken = generateAccessToken({ id: result.rows[0].id, email: result.rows[0].email });
    const refreshToken = generateRefreshToken({ id: result.rows[0].id, email: result.rows[0].email });

    res.json({ accessToken, refreshToken, message: "Login Successful" });
    
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
      "SELECT id,email,archive,create_date,update_date,super_user FROM users WHERE email = $1 and archive = false;",
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
      "SELECT * FROM users WHERE email = $1 and archive = false;",
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
