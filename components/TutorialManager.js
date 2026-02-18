import React, { useState, useEffect, useRef } from 'react';
import { View, findNodeHandle, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WalkthroughTutorial from './WalkthroughTutorial';

const TUTORIAL_STORAGE_KEY = '@thrive_walkthrough_completed';

const TUTORIAL_STEPS = [
  {
    id: 'home_dashboard',
    screen: 'home',
    title: 'Your Impact Dashboard',
    description: 'Track your monthly donations, total savings, and see how your contributions are making a difference. This is your personal impact center!',
    elementRef: 'monthlyImpactCard',
  },
  {
    id: 'discounts',
    screen: 'discounts',
    title: 'Shop & Save with Discounts',
    description: 'Browse exclusive discounts from local partners. Every purchase helps support your chosen cause while you save money!',
    elementRef: 'discountsSection',
  },
  {
    id: 'beneficiaries',
    screen: 'beneficiary',
    title: 'Change or View Other Causes',
    description: 'Explore different causes and make one-time gifts. You can change your primary beneficiary or support multiple causes.',
    elementRef: 'beneficiarySection',
  },
];

export default function TutorialManager({ currentScreen, children }) {
  const [showTutorial, setShowTutorial] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [highlightPosition, setHighlightPosition] = useState(null);
  const elementRefs = useRef({});

  useEffect(() => {
    checkTutorialStatus();
  }, []);

  useEffect(() => {
    if (showTutorial && currentScreen) {
      // Wait for screen to render, then show tutorial
      setTimeout(() => {
        showCurrentStep();
      }, 500);
    }
  }, [showTutorial, currentScreen, currentStepIndex]);

  const checkTutorialStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (!completed) {
        // Check if user just signed up (you can add additional logic here)
        setShowTutorial(true);
      }
    } catch (error) {
      console.error('Error checking tutorial status:', error);
    }
  };

  const measureElement = (refName) => {
    return new Promise((resolve) => {
      const ref = elementRefs.current[refName];
      if (!ref) {
        resolve(null);
        return;
      }

      const nodeHandle = findNodeHandle(ref);
      if (!nodeHandle) {
        resolve(null);
        return;
      }

      UIManager.measure(nodeHandle, (x, y, width, height, pageX, pageY) => {
        resolve({
          x: pageX,
          y: pageY,
          width,
          height,
        });
      });
    });
  };

  const showCurrentStep = async () => {
    const currentStep = TUTORIAL_STEPS[currentStepIndex];
    if (!currentStep) return;

    // Only show if we're on the correct screen
    if (currentStep.screen !== currentScreen) {
      return;
    }

    const position = await measureElement(currentStep.elementRef);
    if (position) {
      setHighlightPosition(position);
    } else {
      // If element not found, try again after a short delay
      setTimeout(() => {
        showCurrentStep();
      }, 300);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setHighlightPosition(null);
      
      // Navigate to next screen if needed
      const nextStep = TUTORIAL_STEPS[currentStepIndex + 1];
      if (nextStep && nextStep.screen !== currentScreen) {
        // You'll need to handle navigation here
        // For now, we'll just update the step
        setTimeout(() => {
          setCurrentStepIndex(currentStepIndex + 1);
        }, 500);
      }
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      setShowTutorial(false);
    } catch (error) {
      console.error('Error saving tutorial status:', error);
    }
  };

  const currentStep = TUTORIAL_STEPS[currentStepIndex];

  return (
    <>
      {children}
      {showTutorial && currentStep && (
        <WalkthroughTutorial
          visible={showTutorial && currentStep.screen === currentScreen}
          currentStep={currentStepIndex + 1}
          totalSteps={TUTORIAL_STEPS.length}
          highlightPosition={highlightPosition}
          title={currentStep.title}
          description={currentStep.description}
          onNext={handleNext}
          onSkip={handleSkip}
          onComplete={handleComplete}
        />
      )}
    </>
  );
}

// Helper component to register elements for tutorial
export function TutorialElement({ name, children, style }) {
  const tutorialManager = React.useContext(TutorialContext);
  const ref = useRef(null);

  useEffect(() => {
    if (tutorialManager && ref.current) {
      tutorialManager.registerElement(name, ref);
    }
  }, [name, tutorialManager]);

  return (
    <View ref={ref} style={style}>
      {children}
    </View>
  );
}

// Context for tutorial manager
export const TutorialContext = React.createContext(null);









