import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import AppError from '../utils/applicationError';
import Recipe from '../models/Recipe';
import Restaurant from '../models/Restaurant';
import MealPlan from '../models/MealPlan';

// --- RECIPES ---

export const getRecipes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;
    const recipes = await Recipe.find({ householdId }).sort({ name: 1 });
    res.status(200).json({ status: 'success', data: { recipes } });
});

export const createRecipe = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;

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
    res.status(204).json({ status: 'success', data: null });
});

// --- RESTAURANTS ---

export const getRestaurants = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;
    const restaurants = await Restaurant.find({ householdId }).sort({ name: 1 });
    res.status(200).json({ status: 'success', data: { restaurants } });
});

export const createRestaurant = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;

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
    res.status(204).json({ status: 'success', data: null });
});

// --- MEAL PLANS ---

export const getMealPlans = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;
    const { startDate, endDate } = req.query;

    const query: any = { householdId };
    if (startDate && endDate) {
        query.date = { $gte: new Date(startDate as string), $lte: new Date(endDate as string) };
    }

    const mealPlans = await MealPlan.find(query)
        .populate('itemId') // Will populate from Recipe or Restaurant based on refPath
        .sort({ date: 1 });

    res.status(200).json({ status: 'success', data: { mealPlans } });
});

export const createMealPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const householdId = req.householdId;
    const mealPlan = await MealPlan.create({ ...req.body, householdId });

    // Populate immediately for UI convenience
    await mealPlan.populate('itemId');

    res.status(201).json({ status: 'success', data: { mealPlan } });
});

export const deleteMealPlan = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const mealPlan = await MealPlan.findOneAndDelete({ _id: id, householdId: req.householdId });
    if (!mealPlan) throw new AppError('Meal plan not found', 404);
    res.status(204).json({ status: 'success', data: null });
});
