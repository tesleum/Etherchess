
/**
 * Telegram Service
 * 
 * NOTE: Direct calls to api.telegram.org from the browser are blocked by CORS.
 * We rely on the photo_url provided by the Telegram WebApp init data which is 
 * stored in our Firestore database via App.tsx.
 */

// Cache to prevent hitting rate limits for the same user repeatedly in a session
const photoCache = new Map<string, string>();

/**
 * Placeholder for getting Telegram photos. 
 * Since browser-side API calls fail due to CORS, this simply returns null 
 * to allow the UI to fall back to the URL stored in Firestore.
 */
export const getTelegramPhoto = async (userId: string | number): Promise<string | null> => {
    // Return null to enforce usage of Firestore-stored avatars.
    // Client-side fetching from api.telegram.org is not possible.
    return null; 
};
