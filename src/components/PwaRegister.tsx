"use client";

import { useEffect } from "react";

// Registra o service worker (habilita instalar na tela inicial / standalone).
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}
