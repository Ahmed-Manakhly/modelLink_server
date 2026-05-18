const nodemailer = require('nodemailer');
const prisma = require("../prisma/prisma");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

//=======================================================

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: 'smtp.gmail.com', // Gmail SMTP server
    port: 587, // Port for secure TLS connection
    secure: true, // Set to true if using port 465
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// const transporter = nodemailer.createTransport({
//     service: 'Gmail',
//     host: 'smtp.gmail.com', // Gmail SMTP server
//     port: 587, // Port for secure TLS connection
//     secure: false, // Set to true if using port 465
//     auth: {
//       user: 'aiexchange.platform@gmail.com', // Your Gmail email address
//       pass: 'Aix@123456789', // Your Gmail password or an app-specific password
//     },
//     tls: {
//       rejectUnauthorized: false, // Allow self-signed certificates (use with caution)
//     },
// })

//========================================================
// const createEmailToken = asyncErrorCatching(async (req, res,next) => {
//     let {
//         email
//     } = req.body;
//     const newEmailToken = await prisma.EmailToken.create({
//         data : {
//             email,
//             emailToken : crypto.randomBytes(64).toString("hex")
//         }
//     });
//     if (newEmailToken) {
//         res.status(201).json({
//             status: "success",
//             data: {
//                 newEmailToken
//             }
//         });
//     } else {
//         res.status(424).json({
//             status: "failed",
//             data: {
//                 "message": "can't create newEmailToken"
//             }
//         });
//     }
// });
//================================================================================
const createEmailToken = asyncErrorCatching(async (req, res,next) => {
    const { email } = req.body;
    // console.log(email )
    if(email){
        const otp = `${Math.floor(1000 + Math.random() * 9000) }`;
        const mailOptions ={
            from :'aiexchange.platform@gmail.com' ,
            to : email,
            subject : 'Verify Your Email',
            html : `<h1>Welcome to Ai Exchange world!</h1>
            <p>We are very excited to have you on board</p>
            <p>Your OTP to complete the Account Registration is <b>${otp}</b></p>
            <p>This code <b>expires in 5 Minutes</b></p>
            `
        }
        const saltRounds = 10;
        const hashedOtp = await bcrypt.hash(otp , saltRounds)
        const expiration = new Date();
        expiration.setMinutes(expiration.getMinutes() + 5) 
        const exEmail = await prisma.EmailToken.findUnique({
            where: {
                email
            },
        });
        if(!exEmail){
            const newEmailToken = await prisma.EmailToken.create({
                data : {
                    email,
                    emailToken : hashedOtp,
                    createdAt : new Date(),
                    expiresAt :  new Date(expiration),
                }
            });
            if (newEmailToken) {
                // console.log(newEmailToken)
                await transporter.sendMail(mailOptions);
                res.status(201).json({
                    status: "success",
                    data: {
                        message:'verification OTP mail sent successfully',
                        email
                    }
                });
            } else {
                res.status(400).json({
                    status: "failed",
                    data: {
                        message: "can't send OTP"
                    }
                });
            }
        }else{
            const newEmailToken = await prisma.EmailToken.update({
                where: {
                    email,
                },
                data : {
                    emailToken : hashedOtp,
                    createdAt : new Date(),
                    expiresAt :  new Date(expiration),
                }
            });
            if (newEmailToken) {
                // console.log(newEmailToken)
                await transporter.sendMail(mailOptions);
                res.status(201).json({
                    status: "success",
                    data: {
                        message:'verification OTP mail sent successfully',
                        email
                    }
                });
            } else {
                res.status(400).json({
                    status: "failed",
                    data: {
                        message: "can't send OTP"
                    }
                });
            }
        }
    }else{
        res.status(400).json({
            status: "failed",
            data: {
                message: "can't send OTP"
            }
        });
    }
});
//==============================================================================
const verifyEmailToken = asyncErrorCatching(async (req, res,next) => {
    const { email , otp} = req.query;
    // console.log(email , otp )
    if(!email || !otp){
        return res.status(400).json({
            status: "failed",
            data: {
                "message": "OTP or email are missing"
            }
        });
    }else{
        const exToken = await prisma.EmailToken.findFirst({
            where: {
                email 
            }
        });
        if(!exToken){
            return res.status(400).json({
                status: "failed",
                data: {
                    "message": "Email is invalid"
                }
            });
        }else{
            const {expiresAt} = exToken
            const {emailToken} = exToken
            if(expiresAt < Date.now() ){
                return res.status(400).json({
                    status: "failed",
                    data: {
                        "message": `OTP was expired at ${expiresAt.toUTCString()} Please request it again`
                    }
                });
            }else{
                const otpIsValid  = await bcrypt.compare(otp, emailToken)
                if(otpIsValid){
                    res.status(200).json({
                        status: "success",
                        data: {
                            "message": `Email verified successfully!`
                        }
                    });
                }else{
                    return res.status(400).json({
                        status: "failed",
                        data: {
                            "message": `Invalid Code Kindly Check your Email again!`
                        }
                    });
                }
            }
        }
    }
});
//==========================================================================

module.exports = {
    createEmailToken,
    verifyEmailToken
};