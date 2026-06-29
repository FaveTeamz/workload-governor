import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Verifies that the current wallet address is a registered maintainer for
 * the given org.  Redirects to /403 if not.
 */
export function useMaintainerCheck(orgId: string, maintainerAddress: string | null) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!maintainerAddress) {
      navigate("/403", { replace: true });
      return;
    }

    async function verify() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (globalThis as any).__contract_client__;
        const ok: boolean = c
          ? await c.is_maintainer(maintainerAddress, orgId)
          : false;
        if (!ok) navigate("/403", { replace: true });
        else setChecked(true);
      } catch {
        navigate("/403", { replace: true });
      }
    }

    verify();
  }, [maintainerAddress, orgId, navigate]);

  return checked;
}
