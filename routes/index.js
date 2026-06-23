const authRoute = require("./auth.route");
const usersRoute = require("./users.route");
const usersAdminRoute = require("./usersAdmin.route");
const converstioinRoute = require("./conversation.route");
const messageRoute = require("./message.route");
const orderRoute = require("./order.route");
const reviewRoute = require("./review.route");
const aiModelRoute = require("./aiModel.route");
const notificationRoute = require("./notification.route");

const developerVerificationRoute = require("./developerVerification.route");
const walletRoute = require("./wallet.route");
const payoutRoute = require("./payout.route");
const disputeRoute = require("./dispute.route");
const adminRoute = require("./admin.route");
const taxonomyRoute = require("./taxonomy.route");
const stripeRoute = require("./stripe.route");
const supportRoute = require("./support.route");

module.exports = {
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
    supportRoute,
};