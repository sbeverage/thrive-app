/**
 * Charity profile during signup — stays in signupFlow stack (no tab bar / home back-stack).
 */
import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { persistSignupFlowCheckpointFromParams } from "../utils/signupFlowCheckpoint";
import BeneficiaryDetailScreen from "../(tabs)/(main)/beneficiary/beneficiaryDetail";

export default function SignupBeneficiaryDetail() {
  const params = useLocalSearchParams();
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    persistSignupFlowCheckpointFromParams("/signupFlow/beneficiaryDetail", {
      ...params,
      fromSignup: "true",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  return <BeneficiaryDetailScreen />;
}
