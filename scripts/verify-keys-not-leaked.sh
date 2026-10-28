#!/bin/bash
# Pre-commit hook to verify no API keys are leaked
# Scans staged files for common API key patterns

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Scanning for API keys in staged files..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    echo "No staged files to check."
    exit 0
fi

# Patterns to detect (case insensitive)
# These are common API key prefixes
PATTERNS=(
    # OpenAI
    "sk-[a-zA-Z0-9]{48}"
    "sk-proj-[a-zA-Z0-9]{48}"
    
    # Anthropic
    "sk-ant-[a-zA-Z0-9_-]{95}"
    
    # Google
    "AIza[a-zA-Z0-9_-]{35}"
    
    # Generic patterns
    "api[_-]?key[_-]?[=:]\s*[a-zA-Z0-9_-]{20,}"
    "secret[_-]?key[_-]?[=:]\s*[a-zA-Z0-9_-]{20,}"
    "access[_-]?token[_-]?[=:]\s*[a-zA-Z0-9_-]{20,}"
    
    # Bearer tokens
    "Bearer\s+[a-zA-Z0-9_-]{20,}"
    
    # Private keys
    "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"
    
    # Database URLs with passwords
    "postgres:"'//[^:]+:[^@]+@'
    "mysql:"'//[^:]+:[^@]+@'
    "mongodb:"'//[^:]+:[^@]+@'
)

FOUND_ISSUES=0

for file in $STAGED_FILES; do
    # Skip binary files and certain extensions
    if [[ "$file" =~ \.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$ ]]; then
        continue
    fi
    
    # Skip this verification script itself
    if [[ "$file" == "scripts/verify-keys-not-leaked.sh" ]]; then
        continue
    fi
    
    if [ ! -f "$file" ]; then
        continue
    fi
    
    for pattern in "${PATTERNS[@]}"; do
        if grep -qiE -e "$pattern" "$file"; then
            echo -e "${RED}❌ Potential secret found in $file${NC}"
            echo -e "${YELLOW}   Pattern: $pattern${NC}"
            # Show context (line number and surrounding lines)
            grep -niE -e "$pattern" "$file" | head -3 | while read -r line; do
                echo -e "${YELLOW}   $line${NC}"
            done
            FOUND_ISSUES=$((FOUND_ISSUES + 1))
        fi
    done
done

if [ $FOUND_ISSUES -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ $FOUND_ISSUES potential secret(s) found!${NC}"
    echo -e "${YELLOW}Please remove secrets before committing.${NC}"
    echo -e "${YELLOW}Use environment variables or secure storage instead.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ No secrets detected in staged files.${NC}"
    exit 0
fi