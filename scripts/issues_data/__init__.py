from .smart_contract import SMART_CONTRACT_ISSUES
from .backend import BACKEND_ISSUES
from .indexer import INDEXER_ISSUES
from .database import DB_ISSUES
from .frontend import FRONTEND_ISSUES
from .ui_ux import UI_UX_ISSUES
from .testing import TESTING_ISSUES
from .cicd import CICD_ISSUES
from .devops import DEVOPS_ISSUES
from .security import SECURITY_ISSUES
from .observability import OBSERVABILITY_ISSUES
from .docs_dx import DOCS_DX_ISSUES

ALL_ISSUES = (
    SMART_CONTRACT_ISSUES
    + BACKEND_ISSUES
    + INDEXER_ISSUES
    + DB_ISSUES
    + FRONTEND_ISSUES
    + UI_UX_ISSUES
    + TESTING_ISSUES
    + CICD_ISSUES
    + DEVOPS_ISSUES
    + SECURITY_ISSUES
    + OBSERVABILITY_ISSUES
    + DOCS_DX_ISSUES
)

assert len(ALL_ISSUES) == 125, f"Expected 125 issues, got {len(ALL_ISSUES)}"
