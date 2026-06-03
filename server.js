// module imports
const dotenv = require("dotenv");
//=============================================== LOAD .env FILE
dotenv.config({ path: ".env" });

const prisma = require("./prisma/prisma");
const logger = require("./utils/logger");
const { Server } = require('socket.io');
const { validateEnvVars } = require('./utils/envValidator');
const path = require('path');
const fs = require('fs');

//=============================================== THE SYNC ERROR HANDLER
process.on('uncaughtException', err => {
  logger.error(err, 'Uncaught exception');
  logger.error('An uncaught exception occurred! Shutting down.');
  process.exit(1);
});

//=============================================== config the public directory
// Docker manages /public via named volume and PUBLIC_DIR env
// For local development, the below will auto-create publicDir:

if (process.env.NODE_ENV !== 'production') {
  const projectRoot = __dirname;
  const parentDir = path.dirname(projectRoot);
  const publicDir = path.join(parentDir, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    logger.info(`✅ Created public directory: ${publicDir}`);
  }
  process.env.PUBLIC_DIR = publicDir;
}
// Validate environment variables
validateEnvVars();

// to create the init user + run schema migrations
const { bootstrap } = require('./utils/bootstrap');

const app = require("./app");

const connectToPrisma = async () => {
  try {
    await prisma.$connect();
    logger.info('Prisma connected successfully!');
    // Run bootstrap (migrations + admin user creation)
    await bootstrap();
  } catch (error) {
    logger.error(error, 'Prisma connect() failed');
    process.exit(1);
  }
};

const server = app.listen(process.env.PORT || 8000, async () => {
  await connectToPrisma();
  logger.info(`App listening on Port: ${process.env.PORT || 8000}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});
// Graceful shutdown for Nodemon restarts to prevent EADDRINUSE ghost processes
process.once('SIGUSR2', () => {
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});


process.on("unhandledRejection", (err) => {
  logger.fatal(err, 'Unhandled Rejection! Server is Shutting down...');
  server.close(() => {
    process.exit(1);
  });
});

// io connection====================

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
