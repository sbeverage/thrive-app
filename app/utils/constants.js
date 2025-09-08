import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Backend API Configuration
export const BACKEND_URL = 'http://thrive-backend-final.eba-fxvg5pyf.us-east-1.elasticbeanstalk.com';

export { screenWidth, screenHeight };
