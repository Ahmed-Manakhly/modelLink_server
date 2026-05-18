const orderController = require("../controller/order.controller");
const authController = require( "../controller/auth.controller" );
const { verifyToken } = require( "../middleware/jwt" );
const router = require( "express" ).Router();


router.route( "/" )
    .get( authController.protect, orderController.getAllOrders );

router.route("/:id")
    .get( authController.protect, orderController.getOrder )
    .delete( authController.protect, orderController.deleteOrder)

router.route("/byModel/:id").get( authController.protect, orderController.getOrdersByModel ) // m
router.route("/byDev/:id").get( authController.protect, orderController.getOrdersByDev ) // m
router.route("/byClient/:id").get( authController.protect, orderController.getOrdersByClient ) // m

router.post( "/create-payment-intent/" , authController.protect , orderController.createOrderIntent );
router.patch( "/confirm-order/:id" , authController.protect , orderController.confirmOrder )

module.exports = router;