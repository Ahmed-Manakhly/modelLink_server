const authRoute = require("./auth.route")
const usersRoute = require("./users.route")
const usersAdminRoute = require("./usersAdmin.route")
// --------------------------------------------------------
const converstioinRoute = require("./conversation.route")
const gigRoute = require("./gig.route")
const messageRoute = require("./message.route")
const orderRoute = require("./order.route")
const reviewRoute = require("./review.route")
const companyRoute = require("./company.route")
const aiModelRoute = require("./aiModel.route")
const moduleRoute = require("./module.route")
const targetRoute = require("./target.route")
const ruleRoute = require("./rule.route")
const notificationRoute = require("./notification.route") // by manakhly

module.exports = {
    authRoute,
    usersRoute,
    usersAdminRoute,
    // -------------
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
    notificationRoute,
}