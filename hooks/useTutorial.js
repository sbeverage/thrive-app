import { useState, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_STORAGE_KEY = '@thrive_walkthrough_completed';

export const TUTORIAL_STEPS = [
  {
    id: 'home_dashboard',
    icon: '🏠',
    title: 'Your Impact Dashboard',
    description: 'Track your monthly donations, total savings, and see how your contributions are making a difference.',
  },
  {
    id: 'discounts',
    icon: '🏷️',
    title: 'Shop & Save',
    description: 'Browse exclusive discounts from local partners. Every purchase helps support your chosen cause while you save money!',
  },
  {
    id: 'beneficiaries',
    icon: '❤️',
    title: 'Choose Your Cause',
    description: 'You support one cause per month. You can change your primary beneficiary or make one-time gifts to other causes at any time.',
  },
];

export function useTutorial() {
  const [showTutorial, setShowTutorial] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        AsyncStorage.getItem(TUTORIAL_STORAGE_KEY).then(completed => {
          if (!completed) setShowTutorial(true);
        }).catch(() => {});
      }, 800);
    });
    return () => task.cancel();
  }, []);

  const handleNext = () => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      setCurrentStepIndex(i => i + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true').catch(() => {});
    setShowTutorial(false);
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'true').catch(() => {});
    setShowTutorial(false);
  };

  return {
    showTutorial,
    currentStepIndex,
    currentStep: TUTORIAL_STEPS[currentStepIndex],
    totalSteps: TUTORIAL_STEPS.length,
    handleNext,
    handleSkip,
    handleComplete,
  };
}

export async function resetTutorial() {
  await AsyncStorage.removeItem(TUTORIAL_STORAGE_KEY).catch(() => {});
}
