"use client";

import { useEffect } from "react";

export default function AutoRefresh() {
  useEffect(() => {
    const refreshPage = () => {
      window.location.reload();
    };

    const delayToNextMinute = 60000 - (Date.now() % 60000);
    let intervalId: number | undefined;

    const timeoutId = window.setTimeout(() => {
      refreshPage();
      intervalId = window.setInterval(refreshPage, 60000);
    }, delayToNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
