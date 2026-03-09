const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');

router.post('/signup', ctrl.signUp);
router.post('/signin', ctrl.signIn);
router.post('/check-email', ctrl.checkEmailExists);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

router.post('/send-code', ctrl.sendCode);
router.post('/signup-code', ctrl.signUpWithCode);
router.post('/signin-code', ctrl.signInWithCode);

module.exports = router;
