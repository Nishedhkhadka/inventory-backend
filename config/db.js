import mongoose from "mongoose";

// Cache the connection across hot lambda invocations in NodeJS global context
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // 1. If a connection exists, reuse it immediately
  if (cached.conn) {
    return cached.conn;
  }

  // 2. If no connection promise exists, initiate a new connection
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Disable buffering so queries fail instantly if DB is down
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((mongooseInstance) => {
      console.log(
        `[db] MongoDB connected: ${mongooseInstance.connection.host}/${mongooseInstance.connection.name}`
      );
      return mongooseInstance;
    });
  }

  // 3. Await the promise and cache the connection
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // Reset promise on failure so subsequent requests can retry
    console.error(`[db] Connection failed: ${err.message}`);
    throw err; // Let Express handle the error and return a 500 response
  }

  return cached.conn;
};

export default connectDB;