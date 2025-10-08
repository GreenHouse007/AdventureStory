const mongoose = require("mongoose");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/cyoaDB";

const sanitizeMongoUri = (uri) => {
  if (!uri) return "";

  try {
    const parsed = new URL(uri);
    const hasUser = Boolean(parsed.username);
    const host = parsed.host || parsed.hostname;
    const dbPath = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.protocol}//${hasUser ? "<user>@" : ""}${host}${dbPath}`;
  } catch (err) {
    return uri.replace(/\/\/[^@]+@/, "//<credentials>@");
  }
};

const normalizeSrvUriToDirect = (uri) => {
  if (!uri || !uri.startsWith("mongodb+srv://")) {
    return null;
  }

  try {
    const parsed = new URL(uri);
    const searchParams = new URLSearchParams(parsed.search);

    if (!searchParams.has("directConnection")) {
      searchParams.set("directConnection", "true");
    }

    if (!searchParams.has("tls")) {
      searchParams.set("tls", "true");
    }

    const credentials = parsed.username
      ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
      : "";

    const pathname = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";

    return `mongodb://${credentials}${parsed.hostname}${pathname}?${searchParams.toString()}`;
  } catch (error) {
    console.error("Failed to derive direct connection URI from SRV string:", error);
    return null;
  }
};

const attemptMongoConnection = async (uri, label) => {
  if (!uri) {
    throw new Error(`MongoDB connection string for ${label} is not defined.`);
  }

  console.log(`Attempting MongoDB connection using ${label} (${sanitizeMongoUri(uri)})`);

  try {
    const connection = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(
      `MongoDB connected via ${label}: ${connection.connection.host}:${connection.connection.port}`
    );
    return connection;
  } catch (error) {
    console.error(
      `MongoDB connection using ${label} (${sanitizeMongoUri(uri)}) failed: ${error.code ||
        error.name} - ${error.message}`
    );
    throw error;
  }
};

const connectDB = async () => {
  const connectionChain = [];

  if (process.env.MONGO_URI) {
    connectionChain.push({ uri: process.env.MONGO_URI, label: "MONGO_URI" });

    const directUri = normalizeSrvUriToDirect(process.env.MONGO_URI);

    if (directUri) {
      connectionChain.push({ uri: directUri, label: "derived direct connection" });
    }
  }

  connectionChain.push({ uri: DEFAULT_URI, label: "local fallback" });

  let lastError = null;

  for (const target of connectionChain) {
    try {
      await attemptMongoConnection(target.uri, target.label);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  console.error(
    "All MongoDB connection attempts failed. Ensure that MONGO_URI is reachable or a local MongoDB instance is running."
  );

  if (lastError) {
    console.error(lastError);
  }

  process.exit(1);
};

module.exports = connectDB;
