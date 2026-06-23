const reviewController = require("../controller/review.controller");
const authController = require("../controller/auth.controller");
const { optionalProtect } = require("../middleware/optionalProtect");
const router = require( "express" ).Router();


router.route("/")
    .get(authController.protect, reviewController.getAllReviews)
    .post(authController.protect, reviewController.createReview);

router.route("/byOrder/:id")
    .get(authController.protect, reviewController.getReviewByOrder)
router.route("/byModel/:id")
    .get(optionalProtect, reviewController.getReviewByModel)

router.route("/:id")
    .get(authController.protect, reviewController.getReview)
    .patch(authController.protect, reviewController.updateReview)
    .delete(authController.protect, reviewController.deleteReview);

module.exports = router;
