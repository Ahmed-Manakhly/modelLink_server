const router = require("express").Router()
const {
    createAiModel, getAllAiModels, deleteAiModel, getAiModel, updateAiModel, getUserAiModels, uploadModelFiles,
    getCategories, getModalities, getBodyParts, getTags, getFilters, bulkUpdateAiModels
} = require("../controller/aiModel.controller");
const versionController = require("../controller/aiModelVersion.controller");
const authController = require("../controller/auth.controller");

const { validateCreateAiModel } = require("../middleware/validator");

router.route("/categories").get(getCategories);
router.route("/modalities").get(getModalities);
router.route("/bodyparts").get(getBodyParts);
router.route("/tags").get(getTags);
router.route("/filters").get(getFilters);

router.route("/").get(getAllAiModels)
router.route("/bulk-status").patch(authController.protect, authController.restrictTo('ADMIN', 'EMPLOYEE'), bulkUpdateAiModels)
router.route("/").post(authController.protect, authController.restrictTo('DEVELOPER'), uploadModelFiles, validateCreateAiModel, createAiModel)

// Versions nested routes
router.route("/:id/versions")
    .post(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.createVersion)
    .get(versionController.getAiModelVersions);

router.route("/versions/:id")
    .get(versionController.getVersionDetails)
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.updateVersion)
    .delete(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.deleteVersion);

router.route("/versions/:id/activate")
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.activateVersion);

router.route("/versions/:id/set-primary")
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.setPrimaryVersion);

// Features routes
router.route("/versions/:id/features")
    .post(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.createFeature)
    .get(versionController.getFeatures);

router.route("/features/:id")
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.updateFeature)
    .delete(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.deleteFeature);

// Metrics routes
router.route("/versions/:id/metrics")
    .post(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.createMetric)
    .get(versionController.getMetrics);

router.route("/metrics/:id")
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.updateMetric)
    .delete(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.deleteMetric);

// Assets routes
router.route("/versions/:id/assets")
    .post(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.createAsset)
    .get(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.getAssets);

router.route("/assets/:id")
    .patch(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.updateAsset)
    .delete(authController.protect, authController.restrictTo('DEVELOPER', 'ADMIN'), versionController.deleteAsset);

router.route("/assets/:id/download")
    .get(authController.protect, versionController.downloadAsset);

// Parent Model routes
router.route("/:id").delete(authController.protect, authController.restrictTo('ADMIN', 'DEVELOPER'), deleteAiModel)
router.route("/:id").get(getAiModel)
router.route("/:id").patch(authController.protect, authController.restrictTo('ADMIN', 'DEVELOPER'), uploadModelFiles, updateAiModel)
router.route("/byUser/:id").get(getUserAiModels)

module.exports = router;
