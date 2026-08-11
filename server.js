import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "../config/db.js"; // Adjusted relative path if placed inside /api

import productRoutes from "../routes/products.js";
import saleRoutes from "../routes/sales.js";
import purchaseRoutes from "../routes/purchases.js";
import analyticsRoutes from "../routes/analytics.js";
import searchRoutes from "../routes/search.js";
import importRoutes from "../routes/import.js";
import pickndropRoutes from "../routes/pickndrop.routes.js";
import packagingRoutes from "../routes/packaging.routes.js";
import exportRoutes from "../routes/export.js";
import authRoutes from "../routes/auth.js";
import { protect } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

// Connect to Database
connectDB();

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// NOTE: Vercel has a read-only ephemeral filesystem.
// express.static local folder uploads will NOT persist across deployments or serverless invocations.
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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

// 404 fallback
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

// EXPORT default app instead of calling app.listen()
export default app;