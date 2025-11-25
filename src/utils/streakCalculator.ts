// src/utils/streakCalculator.ts
/**
 * Streak Multiplier Tiers
 * Based on consecutive days of task completion
 */
export const STREAK_TIERS = [
    { days: 0, multiplier: 1.0, label: 'Getting Started', emoji: '🌱' },
    { days: 3, multiplier: 1.5, label: 'On Fire', emoji: '🔥' },
    { days: 7, multiplier: 2.0, label: 'Unstoppable', emoji: '⚡' },
    { days: 14, multiplier: 2.5, label: 'Legendary', emoji: '🌟' },
    { days: 30, multiplier: 3.0, label: 'Champion', emoji: '👑' },
] as const;

/**
 * Get the multiplier for a given streak count
 */
export const getMultiplierForStreak = (streakDays: number): number => {
    let multiplier = 1.0;
    for (const tier of STREAK_TIERS) {
        if (streakDays >= tier.days) {
            multiplier = tier.multiplier;
        } else {
            break;
        }
    }
    return multiplier;
};

/**
 * Check if a streak should be maintained or reset
 * Returns: 'increment' | 'maintain' | 'reset'
 */
export const calculateStreakChange = (
    lastCompletionDate: string | null | undefined,
    completedToday: boolean
): 'increment' | 'maintain' | 'reset' => {
    if (!lastCompletionDate) {
        // First time completing tasks
        return completedToday ? 'increment' : 'reset';
    }

    const lastDate = new Date(lastCompletionDate);
    const today = new Date();

    // Reset time to midnight for accurate day comparison
    lastDate.setUTCHours(0, 0, 0, 0);
    today.setUTCHours(0, 0, 0, 0);

    const daysDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDifference === 0) {
        // Same day - no change to streak
        return 'maintain';
    } else if (daysDifference === 1 && completedToday) {
        // Consecutive day - increment streak
        return 'increment';
    } else {
        // Missed a day - reset streak
        return completedToday ? 'reset' : 'reset';
    }
};

/**
 * Update member's streak based on task completion
 * Returns updated streak data
 */
export const updateMemberStreak = (
    currentStreak: number = 0,
    longestStreak: number = 0,
    lastCompletionDate: string | null | undefined,
    allTasksCompletedToday: boolean
): {
    currentStreak: number;
    longestStreak: number;
    lastCompletionDate: string;
    streakMultiplier: number;
} => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    if (!allTasksCompletedToday) {
        // Don't update if not all tasks are done
        return {
            currentStreak,
            longestStreak,
            lastCompletionDate: lastCompletionDate || today,
            streakMultiplier: getMultiplierForStreak(currentStreak),
        };
    }

    const streakChange = calculateStreakChange(lastCompletionDate, true);

    let newStreak: number;
    if (streakChange === 'maintain') {
        // Same day, no change
        newStreak = currentStreak;
    } else if (streakChange === 'increment') {
        // Increment streak
        newStreak = currentStreak + 1;
    } else {
        // Reset streak
        newStreak = 1;
    }

    const newLongestStreak = Math.max(longestStreak, newStreak);
    const newMultiplier = getMultiplierForStreak(newStreak);

    return {
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastCompletionDate: today,
        streakMultiplier: newMultiplier,
    };
};

/**
 * Apply multiplier to points
 */
export const applyMultiplier = (basePoints: number, multiplier: number): number => {
    return Math.floor(basePoints * multiplier);
};
