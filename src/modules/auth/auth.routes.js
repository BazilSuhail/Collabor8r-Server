import { Router } from 'express';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas.js';
import { changePassword, login, logout, logoutAll, me, refresh, register } from './auth.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', refresh); // token comes from the httpOnly cookie only
router.post('/logout', logout); // cookie is the credential, so no access token is required
router.post('/logout-all', auth, logoutAll);
router.get('/me', auth, me);
router.post('/change-password', auth, validate(changePasswordSchema), changePassword);

export default router;
