const router = require("express").Router()
const { createCompany, getCompanies, deleteCompany, getCompany, updateCompany } = require("../controller/company.controller");
const authController = require("../controller/auth.controller");

router.route("/").post(authController.protect, authController.restrictTo('CLIENT'), createCompany)
router.route("/").get(authController.protect, authController.restrictTo('ADMIN'), getCompanies)
router.route("/:id").delete(authController.protect, authController.restrictTo('ADMIN'), deleteCompany)
router.route("/:id").get(authController.protect, authController.restrictTo('ADMIN'), getCompany)
router.route("/:id").put(authController.protect, authController.restrictTo('ADMIN'), updateCompany)
module.exports = router;
