// silkpanda/momentum-api/momentum-api-556c5b7b5d534751fdc505eedf6113f20a02cc98/src/routes/householdRoutes.ts
import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { restrictTo } from '../controllers/authController';
import { 
  createHousehold,
  getAllHouseholds,
  getHousehold,
  updateHousehold,
  deleteHousehold,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
} from '../controllers/householdController';

// Mandatory camelCase variable name for the Router instance
const router = Router();

// All routes after this middleware will be protected and restricted to 'Parent' role
router.use(protect, restrictTo('Parent'));

// Routes for listing all households and creating a new household (Parent CRUD)
// GET /api/v1/households
// POST /api/v1/households
router.route('/')
    .get(getAllHouseholds) // Get all households the Parent belongs to
    .post(createHousehold); // Create a new household

// Routes for individual household operations (Parent CRUD)
// GET /api/v1/households/:id
// PATCH /api/v1/households/:id
// DELETE /api/v1/households/:id
router.route('/:id')
    .get(getHousehold) // Get single household
    .patch(updateHousehold) // Update household details (e.g., name)
    .delete(deleteHousehold); // Delete household


// Nested routes for Family Member Management (Child Profiles)
// POST /api/v1/households/:id/members (Add Member)
router.route('/:id/members')
    .post(addFamilyMember); 

// PATCH /api/v1/households/:id/members/:memberId (Update Member)
// DELETE /api/v1/households/:id/members/:memberId (Delete Member)
router.route('/:id/members/:memberId')
    .patch(updateFamilyMember)
    .delete(deleteFamilyMember);

export default router;