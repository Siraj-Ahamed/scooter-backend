const express  = require("express");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");

const router = express.Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email and password are required" });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = await User.create({ name, email, password: hashed, phone, role });
    const { password: _, ...safe } = user.toObject();
    res.status(201).json({ message: "Registered successfully", user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/signin
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/signout  (stateless — client deletes token)
router.post("/signout", (_req, res) => {
  res.json({ message: "Signed out — please delete your token on the client" });
});

module.exports = router;
