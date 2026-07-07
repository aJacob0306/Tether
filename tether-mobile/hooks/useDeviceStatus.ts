import { useCallback, useEffect, useState } from "react";
import {
  fetchMyDeviceStatus,
  type DeviceStatusSummary,
} from "../lib/devices";

type DeviceStatusState = {
  status: DeviceStatusSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
};

export function useDeviceStatus() {
  const [state, setState] = useState<DeviceStatusState>({
    status: null,
    loading: true,
    refreshing: false,
    error: "",
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      refreshing: true,
      error: "",
    }));

    try {
      const status = await fetchMyDeviceStatus();
      setState({
        status,
        loading: false,
        refreshing: false,
        error: "",
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : "Failed to load device status.",
      }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    fetchMyDeviceStatus()
      .then((status) => {
        if (!mounted) return;
        setState({
          status,
          loading: false,
          refreshing: false,
          error: "",
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: error instanceof Error ? error.message : "Failed to load device status.",
        }));
      });

    return () => {
      mounted = false;
    };
  }, []);

  return {
    ...state,
    refresh,
  };
}
