// Set test environment variables before modules are loaded
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://localhost:27017/test";
process.env.PORT = "4000";
process.env.LOG_LEVEL = "error";
