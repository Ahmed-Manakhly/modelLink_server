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


const {
    authRoute,
    usersRoute,
    usersAdminRoute,
    // ----------------
    converstioinRoute,
    gigRoute,
    messageRoute,
    orderRoute,
    reviewRoute,
    companyRoute,
    aiModelRoute,
    moduleRoute,
    targetRoute,
    ruleRoute,
    notificationRoute

} = require("./routes");

const app = express();

const allowedOrigins = [
    'https://66dedc51c84f8d239a9adb2f--melodious-starlight-977ab6.netlify.app',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://192.168.1.103:3001',
    "http://localhost:5173",
    "http://localhost:5175",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    'https://aiex.netlify.app',
    'http://localhost:3000'
];

app.use(
    cors({
        origin: function (origin, callback) {
            // allow requests with no origin
            // (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                var msg =
                    "The CORS policy for this site does not " +
                    "allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);

        },
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// set security HTTP headers
app.use(helmet());



if (process.env.NODE_ENV === "production") {
    // limit requests from same API
    const limiter = rateLimit({
        max: 500,
        windowMs: 60 * 60 * 1000,
        message: "Too many requests from this IP, please try again in an hour!",
    });

    app.use("/api", limiter);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
//EDIT-MANAKHLY
app.use(express.static('public'))

// development logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));

app.use(xss());
// Attach a unique request ID to every request for logging and tracing
app.use((req, res, next) => {
    req.id = uuid.v4();
    next();
});

app.get("/", (req, res) => {
    res.send("server is running...");
});




app.use("/api/auth", authRoute);
app.use("/api/users", usersRoute);
app.use("/api/admin/users", usersAdminRoute);
// --------------------------
app.use("/api/gigs", gigRoute);
app.use("/api/orders", orderRoute);
app.use("/api/conversations", converstioinRoute);
app.use("/api/messages", messageRoute);
app.use("/api/reviews", reviewRoute);
app.use("/api/company", companyRoute);
app.use("/api/aiModel", aiModelRoute);
app.use("/api/module", moduleRoute);
app.use("/api/target", targetRoute);
app.use("/api/rule", ruleRoute);
app.use("/api/notification", notificationRoute);


app.all("*", (req, res, next) => {
    console.log('NO ROUTE SELECTED')
    res.send('NO ROUTE SELECTED')
});

app.use(globalErrorHandler);

module.exports = app;
