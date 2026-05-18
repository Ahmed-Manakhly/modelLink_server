const pino = require('pino');

const transport = pino.transport({
    targets: [
        {
            target: 'pino-pretty',
            options: {
                destination: '../logs/app.log',
                mkdir: true,
                colorize: false,
            },
        },
        {
            target: 'pino-pretty',
            options: {
               destination: process.stdout.fd,
            },
        }
    ]
});

const logger = pino({
    // disable logs in development\
    // enabled: process.env.NODE_ENV === "production",
}, transport);

module.exports = logger;
