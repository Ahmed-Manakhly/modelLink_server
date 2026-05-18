// module imports
const app = require("./app");
const dotenv = require("dotenv");
const prisma = require("./prisma/prisma");
const logger = require("./utils/logger");
const cors = require("cors");
const { Server } = require('socket.io');


process.on('uncaughtException', err => {
  logger.fatal({
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
  }, 'Uncaught Exception! Server is Shutting down...');
  process.exit(1);
});

dotenv.config({ path: ".env" });

const connectToPrisma = async () => {
  try {
    await prisma.$connect();
    console.log("Prisma connected successfully");
  } catch (error) {
    console.log("connect()", error);
  }
};

const server = app.listen(process.env.PORT || 8000, async () => {
  await connectToPrisma();
  console.log("App listening on Port:", process.env.PORT || 8000);
  console.log("Environment:", process.env.NODE_ENV);
});



process.on("unhandledRejection", (err) => {
  logger.fatal({
    errorName: err.name,
    errorMessage: err.message,
    errorStack: err.stack,
  }, 'Uncaught Exception! Server is Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});

// manakhly====================

const allowedOrigins = [
  'https://66dedc51c84f8d239a9adb2f--melodious-starlight-977ab6.netlify.app',
  'http://localhost:3001',
  "http://localhost:5173",
  "http://localhost:5175",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  'https://aiex.netlify.app',
  'http://localhost:3000'
];

const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

//=================================================
let activeUsers = [];

io.on('connection', (socket) => {
  socket.on("joinRoom", (userId) => {
    socket.join(userId + '__room')
    if (!activeUsers.some((user) => user.userId === userId)) {
      activeUsers.push({ userId, socketId: socket.id });
    }
    io.emit("get-users", activeUsers);
  });
  socket.on("msg_created", (data) => {
    io.to(data.forId + '__room').emit("receive_msg", data.message)
  });
  socket.on("order_created", (data) => {
    io.to(data.to + '__room').emit("receive_order", data)
    io.to(data.to + '__room').emit("refresh", data)
    io.to(data.from + '__room').emit("refresh", data)
  });
  socket.on("refreshModel", (data) => {
    io.to(data.to + '__room').emit("modelRefresh", data)
  });
  socket.on("new_model", () => {
    io.emit("new_model_created")
  });

  socket.on("disconnect", () => {
    activeUsers = activeUsers.filter((user) => user.socketId !== socket.id);
    io.emit("get-users", activeUsers);
  });
  socket.on("leavingRoom", (id) => {
    activeUsers = activeUsers.filter((user) => user.userId !== id);
    io.emit("get-users", activeUsers);
  });
})
