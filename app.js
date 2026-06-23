const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const xss = require("xss-clean");
const hpp = require("hpp");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const createError = require("./utils/createError");
const globalErrorHandler = require("./controller/errorController");
const uuid = require("uuid");
const logger = require("./utils/logger");
const { getAllowedOrigins, createCorsOriginChecker } = require("./utils/corsOrigins");

const {
    authRoute,
    usersRoute,
    usersAdminRoute,
    converstioinRoute,
    messageRoute,
    orderRoute,
    reviewRoute,
    aiModelRoute,
    notificationRoute,
    developerVerificationRoute,
    walletRoute,
    payoutRoute,
    disputeRoute,
    adminRoute,
    taxonomyRoute,
    stripeRoute,
    supportRoute
} = require("./routes");

const app = express();
const allowedOrigins = getAllowedOrigins();

app.use(
    cors({
        origin: createCorsOriginChecker(allowedOrigins),
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// set security HTTP headers
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
}));



if (process.env.NODE_ENV === "production") {
    // limit requests from same API
    const limiter = rateLimit({
        max: 500,
        windowMs: 60 * 60 * 1000,
        message: "Too many requests from this IP, please try again in an hour!",
    });

    app.use("/api", limiter);
}

app.use(express.json({
    limit: '10kb',
    verify: (req, res, buf) => {
        if (req.originalUrl && req.originalUrl.includes('stripe-webhook')) {
            req.rawBody = buf;
        }
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// app.use(express.static('public'))
if (process.env.PUBLIC_DIR) {
    app.use('/public', express.static(process.env.PUBLIC_DIR));
} else {
    logger.warn('PUBLIC_DIR environment variable not set');
}

// development logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// body parser is configured above


app.use(xss());
// Attach a unique request ID to every request for logging and tracing
app.use((req, res, next) => {
    req.id = uuid.v4();
    next();
});

app.get("/", (req, res) => {
    res.send("server is running...");
});

// Health check route for deploy and cache-warm scripts
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "success", message: "Server is healthy" });
});

app.use("/api/auth", authRoute);
app.use("/api/users", usersRoute);
app.use("/api/admin/users", usersAdminRoute);
// --------------------------
app.use("/api/orders", orderRoute);
app.use("/api/conversations", converstioinRoute);
app.use("/api/messages", messageRoute);
app.use("/api/reviews", reviewRoute);
app.use("/api/aiModel", aiModelRoute);
app.use("/api/notification", notificationRoute);
app.use("/api/verifications", developerVerificationRoute);
app.use("/api/wallets", walletRoute);
app.use("/api/payouts", payoutRoute);
app.use("/api/disputes", disputeRoute);
app.use("/api/admin", adminRoute);
app.use("/api/taxonomy", taxonomyRoute);
app.use("/api/stripe", stripeRoute);
app.use("/api/support", supportRoute);


app.all("*", (req, res, next) => {
    logger.warn(`Route not found: ${req.originalUrl}`);
    next(new createError(404, `Can't find ${req.originalUrl} on this server!`));
});

app.use(globalErrorHandler);

module.exports = app;
