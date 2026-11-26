import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchIsMaintainer } from "./useMaintainerAuth";

/**
 * Verifies that the current wallet address is a registered maintainer for
 * the given org.  Redirects to /403 if not.
 */
export function useMaintainerCheck(orgId: string, maintainerAddress: string | null, apiBase = "/api") {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!maintainerAddress) {
      navigate("/403", { replace: true });
      return;
    }

    async function verify() {
      try {
        // Contract `is_maintainer` view via the backend (#1261).
        const ok = await fetchIsMaintainer(maintainerAddress as string, orgId, apiBase);
        if (!ok) navigate("/403", { replace: true });
        else setChecked(true);
      } catch {
        navigate("/403", { replace: true });
      }
    }

    verify();
  }, [maintainerAddress, orgId, navigate, apiBase]);

  return checked;
}
