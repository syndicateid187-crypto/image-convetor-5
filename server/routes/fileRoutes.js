
import express from 'express';
import convertController from '../controllers/convertController.js';

const router = express.Router();
router.post('/convert', convertController);

export default router;
