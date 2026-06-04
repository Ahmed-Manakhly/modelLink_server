const authRoute = require("./auth.route")
const usersRoute = require("./users.route")
const usersAdminRoute = require("./usersAdmin.route")
// --------------------------------------------------------
const converstioinRoute = require("./conversation.route")
const messageRoute = require("./message.route")
const orderRoute = require("./order.route")
const reviewRoute = require("./review.route")
const aiModelRoute = require("./aiModel.route")
const notificationRoute = require("./notification.route") // by manakhly

module.exports = {
    authRoute,
    usersRoute,
    usersAdminRoute,
    // -------------
    converstioinRoute,
    messageRoute,
    orderRoute,
    reviewRoute,
    aiModelRoute,
    notificationRoute
}