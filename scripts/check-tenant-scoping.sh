#!/usr/bin/env bash
set -euo pipefail

# CI backstop for tenant isolation (brief §6, third layer of defense-in-depth --
# see docs/multi-tenancy.md). Forbids calling tenantDb/rawDb directly from anywhere
# except the service layer (packages/database/src/services) and a short list of
# documented, reviewed exceptions. Application code (dashboard routes, pages, server
# actions) must go through the service-layer helpers, which are what guarantee
# organizationId scoping -- the Prisma Client Extension in tenant-guard.ts is only a
# runtime backstop for bugs in that service layer, not a substitute for this rule.

ALLOWED_PREFIXES=(
  "packages/database/src/client.ts"
  "packages/database/src/services/"
  "packages/database/prisma/seed.ts"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

violations=0

while IFS= read -r -d '' file; do
  is_allowed=false
  for prefix in "${ALLOWED_PREFIXES[@]}"; do
    if [[ "$file" == "$prefix"* ]]; then
      is_allowed=true
      break
    fi
  done

  if [[ "$is_allowed" == false ]] && grep -nE '\b(tenantDb|rawDb)\.' "$file" >/dev/null 2>&1; then
    echo "Tenant scoping violation: $file calls tenantDb/rawDb directly."
    echo "  Use the service-layer helpers exported from @cms/database instead."
    grep -nE '\b(tenantDb|rawDb)\.' "$file" | sed 's/^/    /'
    violations=$((violations + 1))
  fi
done < <(find apps packages -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' -print0)

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "$violations file(s) bypass the tenant-scoping service layer. See docs/multi-tenancy.md."
  exit 1
fi

echo "Tenant scoping check passed: no direct tenantDb/rawDb usage outside the service layer."
