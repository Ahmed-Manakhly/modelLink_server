const reviewController = require("../controller/review.controller");
const authController = require("../controller/auth.controller");
const router = require( "express" ).Router();

const { verifyToken } = require( "../middleware/jwt" );


router.route("/")
    .get(authController.protect, reviewController.getAllReviews)
    .post(authController.protect, reviewController.createReview);

router.route("/byOrder/:id") // by manakhly
    .get(authController.protect, reviewController.getReviewByOrder)
router.route("/byModel/:id") // by manakhly
    .get(authController.protect, reviewController.getReviewByModel)

router.route("/:id")
    .get(authController.protect, reviewController.getReview)
    .patch(authController.protect, reviewController.updateReview)
    .delete(authController.protect, reviewController.deleteReview);

module.exports = router;
