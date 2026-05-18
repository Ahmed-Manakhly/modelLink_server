const authRoute = require( "./auth.route" )
const converstioinRoute = require( "./conversation.route" )
const gigRoute = require( "./gig.route" )
const messageRoute = require( "./message.route" )
const orderRoute = require( "./order.route" )
const reviewRoute = require( "./review.route" )
const userRoute = require( "./user.route" ) // foe admin
const userMeRoute = require( "./users-me.route" ) // foe profile
const companyRoute = require("./company.route")
const aiModelRoute = require("./aiModel.route")
const moduleRoute = require("./module.route")
const targetRoute = require("./target.route")
const ruleRoute = require("./rule.route")
const notificationRoute = require("./notification.route") // by manakhly
const emailTokenRoute = require("./emailToken.route") // by manakhly

module.exports = { authRoute , converstioinRoute , gigRoute, messageRoute, orderRoute, reviewRoute, userRoute, companyRoute,
                aiModelRoute,moduleRoute,targetRoute,ruleRoute ,notificationRoute,userMeRoute ,emailTokenRoute}