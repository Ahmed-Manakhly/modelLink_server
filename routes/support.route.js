const router = require('express').Router();
const supportController = require('../controller/support.controller');
const { optionalProtect } = require('../middleware/optionalProtect');

router.post('/contact', optionalProtect, supportController.submitContact);

module.exports = router;
