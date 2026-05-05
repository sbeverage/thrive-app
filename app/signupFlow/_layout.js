import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, useRouter } from "expo-router";
import { useUser } from "../context/UserContext";

/**
 * If the server clears the session (deleted user, invalid JWT) while this stack
 * is visible, send the user back to the welcome flow instead of a dead signup screen.
 */
export default function SignupFlowLayout() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    if (user.isLoading) return;
    if (!user.isLoggedIn) {
      router.replace("/");
    }
  }, [user.isLoading, user.isLoggedIn, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}
