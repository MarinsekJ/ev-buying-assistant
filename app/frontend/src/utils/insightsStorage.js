export const INSIGHTS_STORAGE_KEY = 'ev-transition:insights:v1';

export function saveInsightsPayload(payload) {
  try {
    window.localStorage.setItem(INSIGHTS_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Unable to save insights payload', error);
    return false;
  }
}

export function readInsightsPayload() {
  try {
    const rawPayload = window.localStorage.getItem(INSIGHTS_STORAGE_KEY);
    if (!rawPayload) return null;
    return JSON.parse(rawPayload);
  } catch (error) {
    console.error('Unable to read insights payload', error);
    return null;
  }
}
