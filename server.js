import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";

import productRoutes from "./routes/products.js";
import saleRoutes from "./routes/sales.js";
import purchaseRoutes from "./routes/purchases.js";
import analyticsRoutes from "./routes/analytics.js";
import searchRoutes from "./routes/search.js";
import importRoutes from "./routes/import.js";
import pickndropRoutes from "./routes/pickndrop.routes.js";
import packagingRoutes from "./routes/packaging.routes.js";
import exportRoutes from "./routes/export.js";
import authRoutes from "./routes/auth.js";
import { protect } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();

// 1. Dynamic CORS with trimmed origin values
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));

// 2. Database Connection Middleware (Prevents serverless cold-start crashes)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("[db] Middleware connection error:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// 3. Safe static uploads serving
const uploadsPath = path.join(__dirname, "uploads");
if (fs.existsSync(uploadsPath)) {
  app.use("/uploads", express.static(uploadsPath));
}

// Routes setup
app.use("/api/auth", authRoutes);
app.use("/api", protect);

app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/import", importRoutes);
app.use("/api/pickndrop", pickndropRoutes);
app.use("/api/packaging", packagingRoutes);
app.use("/api/export", exportRoutes);

// 404 Fallback
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Central Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

export default app;