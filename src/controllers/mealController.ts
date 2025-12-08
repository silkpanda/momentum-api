import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/AppError';
import Recipe from '../models/Recipe';
import Restaurant from '../models/Restaurant';
import MealPlan from '../models/MealPlan';
import WeeklyMealPlan from '../models/WeeklyMealPlan';

// --- RECIPES ---

export const getRecipes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;
    const recipes = await Recipe.find({ householdId }).sort({ name: 1 });
    res.status(200).json({ status: 'success', data: { recipes } });
});

export const createRecipe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;

    if (!householdId) {
        throw new AppError('Household ID not found in request. Please ensure you are authenticated.', 401);
    }

    const recipe = await Recipe.create({ ...req.body, householdId });
    res.status(201).json({ status: 'success', data: { recipe } });
});

export const updateRecipe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const recipe = await Recipe.findOneAndUpdate(
        { _id: id, householdId: req.householdId },
        req.body,
        { new: true, runValidators: true }
    );
    if (!recipe) throw new AppError('Recipe not found', 404);
    res.status(200).json({ status: 'success', data: { recipe } });
});

export const deleteRecipe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const recipe = await Recipe.findOneAndDelete({ _id: id, householdId: req.householdId });
    if (!recipe) throw new AppError('Recipe not found', 404);
    res.status(200).json({ status: 'success', message: 'Recipe deleted successfully' });
});

// --- RESTAURANTS ---

export const getRestaurants = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;
    const restaurants = await Restaurant.find({ householdId }).sort({ name: 1 });
    res.status(200).json({ status: 'success', data: { restaurants } });
});

export const createRestaurant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;

    if (!householdId) {
        throw new AppError('Household ID not found in request. Please ensure you are authenticated.', 401);
    }

    console.log('[Meal Controller] Creating restaurant for household:', householdId);
    console.log('[Meal Controller] Request body:', req.body);

    const restaurant = await Restaurant.create({ ...req.body, householdId });
    res.status(201).json({ status: 'success', data: { restaurant } });
});

export const updateRestaurant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const restaurant = await Restaurant.findOneAndUpdate(
        { _id: id, householdId: req.householdId },
        req.body,
        { new: true, runValidators: true }
    );
    if (!restaurant) throw new AppError('Restaurant not found', 404);
    res.status(200).json({ status: 'success', data: { restaurant } });
});

export const deleteRestaurant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const restaurant = await Restaurant.findOneAndDelete({ _id: id, householdId: req.householdId });
    if (!restaurant) throw new AppError('Restaurant not found', 404);
    res.status(200).json({ status: 'success', message: 'Restaurant deleted successfully' });
});

// --- MEAL PLANS ---

export const getMealPlans = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;

    // 1. Fetch all Weekly Plans for this household
    const weeklyPlans = await WeeklyMealPlan.find({ householdId }).sort({ startDate: -1 });

    // 2. For each weekly plan, fetch its meals
    const plansWithMeals = await Promise.all(weeklyPlans.map(async (plan) => {
        const meals = await MealPlan.find({ weeklyMealPlanId: plan._id }).populate('itemId');
        return {
            ...plan.toObject(),
            meals
        };
    }));

    res.status(200).json({ status: 'success', data: { mealPlans: plansWithMeals } });
});

export const createMealPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;
    const { startDate, endDate } = req.body;

    // Create the Weekly Container
    const weeklyPlan = await WeeklyMealPlan.create({
        householdId,
        startDate,
        endDate
    });

    res.status(201).json({ status: 'success', data: { mealPlan: { ...weeklyPlan.toObject(), meals: [] } } });
});

export const addMealToPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;
    const { planId } = req.params;

    const weeklyPlan = await WeeklyMealPlan.findOne({ _id: planId, householdId });
    if (!weeklyPlan) throw new AppError('Weekly plan not found', 404);

    const meal = await MealPlan.create({
        ...req.body,
        householdId,
        weeklyMealPlanId: planId
    });

    await meal.populate('itemId');

    res.status(201).json({ status: 'success', data: { meal } });
});

export const removeMealFromPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { planId, mealId } = req.params;
    // Verify ownership via householdId is handled by findOneAndDelete
    const meal = await MealPlan.findOneAndDelete({ _id: mealId, householdId: req.householdId, weeklyMealPlanId: planId });

    if (!meal) throw new AppError('Meal not found', 404);

    res.status(204).json({ status: 'success', data: null });
});

export const deleteMealPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Delete the weekly plan
    const weeklyPlan = await WeeklyMealPlan.findOneAndDelete({ _id: id, householdId: req.householdId });

    if (!weeklyPlan) throw new AppError('Meal plan not found', 404);

    // Delete all associated meals
    await MealPlan.deleteMany({ weeklyMealPlanId: id });

    res.status(204).json({ status: 'success', data: null });
});

export const getUnratedMeals = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {householdId} = req;

    // Find meals from the past that haven't been rated
    const unratedMeals = await MealPlan.find({
        householdId,
        date: { $lt: new Date() }, // In the past
        isRated: { $ne: true },
    })
        .sort({ date: -1 })
        .limit(3) // Just get top 3 most recent unrated
        .populate('itemId');

    res.status(200).json({ status: 'success', data: { unratedMeals } });
});

export const rateMeal = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { mealId } = req.params;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        throw new AppError('Please provide a valid rating between 1 and 5', 400);
    }

    const meal = await MealPlan.findOneAndUpdate(
        { _id: mealId, householdId: req.householdId },
        { rating, isRated: true },
        { new: true }
    );

    if (!meal) throw new AppError('Meal not found', 404);

    res.status(200).json({ status: 'success', data: { meal } });
});
