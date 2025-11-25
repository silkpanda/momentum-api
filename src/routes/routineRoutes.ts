// src/routes/routineRoutes.ts
import express from 'express';
import {
    createRoutine,
    getAllRoutines,
    getMemberRoutines,
    getRoutineById,
    updateRoutine,
    deleteRoutine,
    toggleRoutineItem,
    resetRoutine
} from '../controllers/routineController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAllRoutines)
    .post(createRoutine);

router.get('/member/:memberId', getMemberRoutines);

router.route('/:id')
    .get(getRoutineById)
    .put(updateRoutine)
    .delete(deleteRoutine);

router.post('/:id/items/:itemId/toggle', toggleRoutineItem);
router.post('/:id/reset', resetRoutine);

export default router;
