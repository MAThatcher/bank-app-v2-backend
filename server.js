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
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Login API Endpoint
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if the user exists
    const result = await pool.query("SELECT * FROM users WHERE email = $1;", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Email not found" });
    } else if (result.archive === true) {
      return res.status(401).json({ error: "Account is deactivated" });
    }

    const user = result.rows[0];
    console.log(user);
    // Compare the provided password with the hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate a JWT token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token, message: "Login successful" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Get a single user by email
app.get("/api/users/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 and archive = false;",
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
