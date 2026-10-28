#!/bin/bash
# Setup script for Prisma development environment
# Run this once after cloning the repository

set -e

echo "🚀 Setting up Prisma development environment..."

# Check for required tools
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
    echo "✅ $1 found"
}

echo "📋 Checking required tools..."
check_command "node"
check_command "pnpm"
check_command "git"

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ required. Current: $(node --version)"
    exit 1
fi
echo "✅ Node.js version OK: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

# Build core package
echo "🔨 Building core package..."
pnpm --filter @prisma-ai/core build

# Generate native code for mobile (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Setting up iOS (macOS detected)..."
    cd apps/mobile
    if command -v pod &> /dev/null; then
        npx pod-install
    else
        echo "⚠️ CocoaPods not installed. Run 'sudo gem install cocoapods' then 'npx pod-install' in apps/mobile"
    fi
    cd ../..
else
    echo "ℹ️ Skipping iOS setup (not on macOS)"
fi

# Android setup check
if command -v adb &> /dev/null; then
    echo "✅ Android SDK found"
else
    echo "⚠️ Android SDK not found. Install Android Studio for mobile testing."
fi

# Tauri setup check
if command -v cargo &> /dev/null; then
    echo "✅ Rust/Cargo found"
else
    echo "⚠️ Rust not found. Install from https://rustup.rs/ for desktop development."
fi

# Set up git hooks
echo "🔧 Setting up git hooks..."
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook to verify no API keys are committed
bash scripts/verify-keys-not-leaked.sh
EOF
chmod +x .git/hooks/pre-commit

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start desktop dev: pnpm --filter @prisma-ai/desktop dev"
echo "  2. Start mobile dev: cd apps/mobile && pnpm dev"
echo "  3. Run tests: pnpm test"
echo "  4. Run lint: pnpm lint"
echo ""
echo "For mobile testing on Android:"
echo "  - Connect device via USB with USB debugging enabled"
echo "  - Run: cd apps/mobile && pnpm dev"
echo ""
echo "For iOS testing (macOS only):"
echo "  - Run: cd apps/mobile && pnpm dev"
echo "  - Press 'i' to open iOS simulator"