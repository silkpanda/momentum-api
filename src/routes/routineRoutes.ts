import express from 'express';
import {
    createRoutine,
    getAllRoutines,
    getMemberRoutines,
    updateRoutine,
    deleteRoutine,
    completeRoutine
} from '../controllers/routineController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAllRoutines)
    .post(createRoutine);

router.route('/:id')
    .put(updateRoutine)
    .delete(deleteRoutine);

router.get('/member/:memberId', getMemberRoutines);
router.post('/:id/complete', completeRoutine);

export default router;
