import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../../shared/queryKeys";
import { authApi } from "../api";

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: authApi.me,
    retry: false,
  });
}
