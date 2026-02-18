import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const TUTORIAL_STORAGE_KEY = '@thrive_walkthrough_completed';
const TUTORIAL_STEP_KEY = '@thrive_walkthrough_current_step';

const TUTORIAL_STEPS = [
  {
    id: 'home_dashboard',
    screen: 'home',
    title: 'Your Impact Dashboard',
    description: 'Track your monthly donations, total savings, and see how your contributions are making a difference. This is your personal impact center!',
  },
  {
    id: 'discounts',
    screen: 'discounts',
    title: 'Shop & Save with Discounts',
    description: 'Browse exclusive discounts from local partners. Every purchase helps support your chosen cause while you save money!',
  },
  {
    id: 'beneficiaries',
    screen: 'beneficiary',
    title: 'Change or View Other Causes',
    description: 'You support one cause per month for your monthly donation. You can change your primary beneficiary or make one-time gifts to other causes.',
  },
];

export function useTutorial(currentScreen) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState(null);
  const elementRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    checkTutorialStatus();
  }, [currentScreen]);
  
  // Re-check tutorial status when screen changes
  useEffect(() => {
    if (currentScreen === 'home' && !showTutorial) {
      checkTutorialStatus();
    }
  }, [currentScreen]);
  
  // Load saved step from AsyncStorage or check if tutorial should show
  useEffect(() => {
    const loadSavedStep = async () => {
      try {
        const savedStep = await AsyncStorage.getItem(TUTORIAL_STEP_KEY);
        const completed = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
        
        console.log('📚 Load saved step - savedStep:', savedStep, 'completed:', completed, 'currentScreen:', currentScreen);
        
        if (!completed) {
          if (savedStep) {
            // Load saved step if navigating between screens
            const stepIndex = parseInt(savedStep, 10);
            const step = TUTORIAL_STEPS[stepIndex];
            if (step && step.screen === currentScreen) {
              console.log('📚 Loading saved tutorial step:', stepIndex);
              setCurrentStepIndex(stepIndex);
              setTimeout(() => {
                console.log('📚 Setting showTutorial to true for saved step');
                setShowTutorial(true);
              }, 1000);
            }
          } else {
            // First time - show step 1 on home screen
            const currentStep = TUTORIAL_STEPS[0];
            if (currentStep.screen === currentScreen) {
              console.log('📚 First time - showing tutorial step 1 on home screen');
              setCurrentStepIndex(0);
              setTimeout(() => {
                console.log('📚 Setting showTutorial to true for first time');
                setShowTutorial(true);
              }, 1500);
            }
          }
        } else {
          console.log('📚 Tutorial already completed, not showing');
        }
      } catch (error) {
        console.error('Error loading saved step:', error);
      }
    };
    loadSavedStep();
  }, [currentScreen]);

  useEffect(() => {
    if (showTutorial && elementRef.current) {
      // Add delay to ensure element is rendered
      const timer = setTimeout(() => {
        console.log('📚 Measuring element - showTutorial:', showTutorial, 'elementRef.current:', !!elementRef.current);
        measureElement();
      }, 800);
      return () => clearTimeout(timer);
    } else if (showTutorial && !elementRef.current) {
      // If tutorial should show but ref not set, try again
      console.log('📚 Tutorial should show but ref not set, retrying...');
      const timer = setTimeout(() => {
        if (elementRef.current) {
          measureElement();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [showTutorial, currentStepIndex, currentScreen]);

  const checkTutorialStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      console.log('📚 Tutorial check - completed:', completed, 'currentScreen:', currentScreen);
      if (!completed) {
        // Check if user just signed up - show tutorial on home screen
        const currentStep = TUTORIAL_STEPS[0];
        if (currentStep.screen === currentScreen) {
          console.log('📚 Showing tutorial for step:', currentStep.id);
          // Small delay to ensure screen is rendered
          setTimeout(() => {
            setShowTutorial(true);
            setCurrentStepIndex(0);
          }, 1000);
        }
      } else {
        console.log('📚 Tutorial already completed, skipping');
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const measureElement = () => {
    if (!elementRef.current) {
      console.log('📚 measureElement: ref not set, retrying...');
      // Try again after a short delay
      setTimeout(() => {
        measureElement();
      }, 300);
      return;
    }

    console.log('📚 measureElement: measuring element...');
    setTimeout(() => {
      try {
        elementRef.current.measure((x, y, width, height, pageX, pageY) => {
          console.log('📚 measureElement: measured position:', { x: pageX, y: pageY, width, height });
          setHighlightPosition({
            x: pageX,
            y: pageY,
            width,
            height,
          });
        });
      } catch (error) {
        console.error('📚 Error measuring element:', error);
        // Try again if measurement fails
        setTimeout(() => {
          measureElement();
        }, 500);
      }
    }, 300);
  };

  const handleNext = async () => {
    const currentStep = TUTORIAL_STEPS[currentStepIndex];
    
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      const nextStepIndex = currentStepIndex + 1;
      const nextStep = TUTORIAL_STEPS[nextStepIndex];
      
      // Save current step to AsyncStorage
      try {
        await AsyncStorage.setItem(TUTORIAL_STEP_KEY, nextStepIndex.toString());
      } catch (error) {
        console.error('Error saving tutorial step:', error);
      }
      
      // Navigate to next screen if needed
      if (nextStep.screen !== currentScreen) {
        setShowTutorial(false);
        setHighlightPosition(null);
        
        // Navigate to next screen - use replace to update tab navigation
        if (nextStep.screen === 'discounts') {
          console.log('📚 Navigating to discounts screen');
          router.replace('/(tabs)/discounts');
        } else if (nextStep.screen === 'beneficiary') {
          console.log('📚 Navigating to beneficiary screen');
          router.replace('/(tabs)/beneficiary');
        } else if (nextStep.screen === 'home') {
          console.log('📚 Navigating to home screen');
          router.replace('/(tabs)/home');
        }
        
        // The next screen will load the saved step from AsyncStorage
      } else {
        // Same screen, just move to next step
        setCurrentStepIndex(nextStepIndex);
        setHighlightPosition(null);
        setTimeout(() => {
          measureElement();
        }, 100);
      }
    } else {
      // Last step - complete tutorial
      handleComplete();
    }
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      await AsyncStorage.removeItem(TUTORIAL_STEP_KEY);
      setShowTutorial(false);
      setHighlightPosition(null);
    } catch (error) {
      console.error('Error skipping tutorial:', error);
    }
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      await AsyncStorage.removeItem(TUTORIAL_STEP_KEY);
      setShowTutorial(false);
      setHighlightPosition(null);
      
      // Navigate to home page after completing tutorial
      console.log('📚 Tutorial completed - navigating to home');
      router.replace('/(tabs)/home');
    } catch (error) {
      console.error('Error saving tutorial status:', error);
    }
  };

  const currentStep = TUTORIAL_STEPS[currentStepIndex];

  return {
    showTutorial: showTutorial && currentStep?.screen === currentScreen,
    currentStep: currentStep ? {
      ...currentStep,
      stepNumber: currentStepIndex + 1,
      totalSteps: TUTORIAL_STEPS.length,
    } : null,
    highlightPosition,
    elementRef,
    handleNext,
    handleSkip,
    handleComplete,
  };
}

// Helper function to reset tutorial (for testing)
export async function resetTutorial() {
  try {
    await AsyncStorage.removeItem(TUTORIAL_STORAGE_KEY);
    await AsyncStorage.removeItem(TUTORIAL_STEP_KEY);
    console.log('📚 Tutorial reset - will show on next home screen visit');
    return true;
  } catch (error) {
    console.error('Error resetting tutorial:', error);
    return false;
  }
}

