import { useEffect, useState } from "react";

function readOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export default function useOnlineStatus() {
  const [online, setOnline] = useState(readOnlineStatus);

  useEffect(() => {
    function refresh() {
      setOnline(readOnlineStatus());
    }

    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  return online;
}
