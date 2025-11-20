import express from 'express';
import { protect } from '../middleware/authMiddleware';
import * as questController from '../controllers/questController';

const router = express.Router();

// All quest routes are protected
router.use(protect);

router
    .route('/')
    .get(questController.getAllQuests)
    .post(questController.createQuest);

router
    .route('/:id')
    .put(questController.updateQuest)
    .delete(questController.deleteQuest);

// Quest Action Routes
router.post('/:id/claim', questController.claimQuest);
router.post('/:id/complete', questController.completeQuest);
router.post('/:id/approve', questController.approveQuest);

export default router;