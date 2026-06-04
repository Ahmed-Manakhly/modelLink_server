const pino = require('pino');
const pretty = require('pino-pretty');
const path = require('path');
const os = require('os');

const logDir = process.env.LOG_DIR || path.join(os.homedir(), '.modelLink_logs');

// 1. File Transports (runs in worker threads for high performance)
const fileTransports = pino.transport({
    targets: [
        {
            target: 'pino-roll',
            options: {
                file: path.join(logDir, 'app'),
                size: '20m',
                frequency: 'daily',
                extension: '.log',
                mkdir: true
            }
        },
        {
            target: 'pino-roll',
            options: {
                file: path.join(logDir, 'error'),
                size: '20m',
                frequency: 'daily',
                extension: '.log',
                mkdir: true
            },
            level: 'error'
        }
    ]
});

// 2. Console Stream (runs in main thread, allowing functions like messageFormat)
const consoleStream = pretty({
    colorize: true,
    translateTime: 'SYS:standard',
    messageFormat: (log, messageKey) => {
        const levelMap = {
            20: '🐛',
            30: '✅',
            40: '⚠️',
            50: '❌',
            60: '💀'
        };
        const emoji = levelMap[log.level] || '';
        let formattedMessage = log[messageKey];
        if (typeof formattedMessage === 'object') {
            formattedMessage = JSON.stringify(formattedMessage);
        }
        return `${emoji} ${formattedMessage}`;
    }
});

// Combine both streams
const logger = pino(
    {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    pino.multistream([
        { stream: consoleStream },
        { stream: fileTransports }
    ])
);

module.exports = logger;
