import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Backend API Configuration - ✅ HTTPS PRODUCTION URL
export const BACKEND_URL = 'https://api.forpurposetechnologies.com';

export { screenWidth, screenHeight };
