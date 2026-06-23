// module imports
const dotenv = require("dotenv");
//=============================================== LOAD .env FILE
dotenv.config({ path: ".env" });

const prisma = require("./prisma/prisma");
const logger = require("./utils/logger");
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const util = require('util');
const { getAllowedOrigins } = require("./utils/corsOrigins");
const { validateEnvVars } = require('./utils/envValidator');

//=============================================== THE SYNC ERROR HANDLER
process.on('uncaughtException', err => {
  logger.error(err, 'Uncaught exception');
  logger.error('An uncaught exception occurred! Shutting down.');
  process.exit(1);
});

validateEnvVars();

const { bootstrap } = require('./utils/bootstrap');
const app = require("./app");

const connectToPrisma = async () => {
  try {
    await prisma.$connect();
    logger.info('Prisma connected successfully!');
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

const allowedOrigins = getAllowedOrigins();

const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

app.set('io', io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token || token === 'null' || token === 'undefined') {
      return next(new Error('Authentication required'));
    }
    const decoded = await util.promisify(jwt.verify)(token, process.env.ACCESS_SECRET_STR);
    if (!decoded?.id) {
      return next(new Error('Invalid token payload'));
    }
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

let activeUsers = [];

io.on('connection', (socket) => {
  socket.on("joinRoom", (requestedUserId) => {
    if (requestedUserId && requestedUserId !== socket.userId) {
      socket.emit('error', { message: 'Cannot join another user\'s room' });
      return;
    }
    const room = `${socket.userId}__room`;
    socket.join(room);
    if (!activeUsers.some((user) => user.userId === socket.userId)) {
      activeUsers.push({ userId: socket.userId, socketId: socket.id });
    }
    io.emit("get-users", activeUsers);
  });
  socket.on("msg_created", (data) => {
    io.to(data.forId + '__room').emit("receive_msg", data.message)
  });
  socket.on("typing", (data) => {
    if (!data?.forId || !data?.conversationId) return;
    io.to(`${data.forId}__room`).emit("typing", {
      conversationId: data.conversationId,
      fromUserId: socket.userId,
    });
  });
  socket.on("stopTyping", (data) => {
    if (!data?.forId || !data?.conversationId) return;
    io.to(`${data.forId}__room`).emit("stopTyping", {
      conversationId: data.conversationId,
      fromUserId: socket.userId,
    });
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
  socket.on("leavingRoom", () => {
    activeUsers = activeUsers.filter((user) => user.userId !== socket.userId);
    io.emit("get-users", activeUsers);
  });
});
