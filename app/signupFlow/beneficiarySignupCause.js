import { persistSignupFlowCheckpointFromParams } from "../utils/signupFlowCheckpoint";
import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import BeneficiaryScreen from "../(tabs)/(main)/beneficiary";

export default function BeneficiaryPreferences() {
  const params = useLocalSearchParams();
  const signupFlowParamsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    persistSignupFlowCheckpointFromParams("/signupFlow/beneficiarySignupCause", params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupFlowParamsKey]);

  return <BeneficiaryScreen isSignupFlow signupParams={params} />;
}
