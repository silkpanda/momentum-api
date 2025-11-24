import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
    getRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    getRestaurants,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    getMealPlans,
    createMealPlan,
    deleteMealPlan,
    addMealToPlan,
    removeMealFromPlan,
} from '../controllers/mealController';

const router = express.Router();

router.use(protect);

// Recipes
router.route('/recipes')
    .get(getRecipes)
    .post(createRecipe);
router.route('/recipes/:id')
    .put(updateRecipe)
    .delete(deleteRecipe);

// Restaurants
router.route('/restaurants')
    .get(getRestaurants)
    .post(createRestaurant);
router.route('/restaurants/:id')
    .put(updateRestaurant)
    .delete(deleteRestaurant);

// Meal Plans
router.route('/plans')
    .get(getMealPlans)
    .post(createMealPlan);
router.route('/plans/:id')
    .delete(deleteMealPlan);

router.route('/plans/:planId/meals')
    .post(addMealToPlan);

router.route('/plans/:planId/meals/:mealId')
    .delete(removeMealFromPlan);

export default router;
