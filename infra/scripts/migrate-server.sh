#!/usr/bin/env bash
#
# migrate-server.sh — Full setup script for new labpics-dashboard server
#
# Usage: ssh root@152.53.248.134 'bash -s' < migrate-server.sh
#    or: copy to server and run: bash migrate-server.sh
#
# Target: v2202602338930435494.powersrv.de (152.53.248.134)
# Domain: dashboard.lab.pics / dev.dashboard.lab.pics
#
set -euo pipefail

REPO_URL="https://github.com/lemone112/labpics-dashboard.git"
REPO_BRANCH="labpics_dashboard"
INSTALL_DIR="/opt/labpics-dashboard"
RUNNER_DIR="/opt/actions-runner"
RUNNER_USER="runner"

echo "========================================"
echo " labpics-dashboard Server Migration"
echo "========================================"
echo ""

# ------------------------------------------------------------------
# Step 1: System update & base packages
# ------------------------------------------------------------------
echo "[1/7] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git jq ca-certificates gnupg lsb-release \
  unzip htop nano ufw fail2ban \
  > /dev/null 2>&1
echo "  -> System packages installed"

# ------------------------------------------------------------------
# Step 2: Install Docker (official repo)
# ------------------------------------------------------------------
echo "[2/7] Installing Docker..."
if command -v docker &>/dev/null; then
  echo "  -> Docker already installed: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin > /dev/null 2>&1
  systemctl enable docker
  systemctl start docker
  echo "  -> Docker installed: $(docker --version)"
fi
echo "  -> Docker Compose: $(docker compose version)"

# ------------------------------------------------------------------
# Step 3: Firewall setup
# ------------------------------------------------------------------
echo "[3/7] Configuring firewall..."
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment 'SSH' > /dev/null
ufw allow 80/tcp comment 'HTTP' > /dev/null
ufw allow 443/tcp comment 'HTTPS' > /dev/null
ufw --force enable > /dev/null
echo "  -> UFW enabled (SSH, HTTP, HTTPS)"

# ------------------------------------------------------------------
# Step 4: Clone repository
# ------------------------------------------------------------------
echo "[4/7] Cloning repository..."
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  -> Repo already exists, pulling latest..."
  cd "$INSTALL_DIR"
  git fetch origin "$REPO_BRANCH"
  git checkout "$REPO_BRANCH"
  git pull origin "$REPO_BRANCH"
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
echo "  -> Repo at $INSTALL_DIR (branch: $REPO_BRANCH)"

# ------------------------------------------------------------------
# Step 5: Create runner user & install GitHub Actions runner
# ------------------------------------------------------------------
echo "[5/7] Setting up GitHub Actions self-hosted runner..."
if ! id "$RUNNER_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$RUNNER_USER"
  usermod -aG docker "$RUNNER_USER"
  echo "  -> Created user '$RUNNER_USER' with docker group"
else
  usermod -aG docker "$RUNNER_USER"
  echo "  -> User '$RUNNER_USER' already exists, added to docker group"
fi

mkdir -p "$RUNNER_DIR"
chown "$RUNNER_USER":"$RUNNER_USER" "$RUNNER_DIR"

# Download latest runner
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')
RUNNER_ARCH="linux-x64"
RUNNER_FILE="actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"

if [ ! -f "$RUNNER_DIR/run.sh" ]; then
  echo "  -> Downloading runner v${RUNNER_VERSION}..."
  cd "$RUNNER_DIR"
  curl -sL "$RUNNER_URL" | tar xz
  chown -R "$RUNNER_USER":"$RUNNER_USER" "$RUNNER_DIR"
  echo "  -> Runner downloaded and extracted"
else
  echo "  -> Runner already installed"
fi

# ------------------------------------------------------------------
# Step 6: Instructions for runner registration
# ------------------------------------------------------------------
echo ""
echo "========================================"
echo " MANUAL STEPS REQUIRED"
echo "========================================"
echo ""
echo "=== Step A: Register the GitHub Actions runner ==="
echo ""
echo "Run on THIS server as the runner user:"
echo ""
echo "  sudo -u $RUNNER_USER bash -c 'cd $RUNNER_DIR && ./config.sh \\"
echo "    --url https://github.com/lemone112/labpics-dashboard \\"
echo "    --token <REGISTRATION_TOKEN> \\"
echo "    --name labpics-runner-new \\"
echo "    --labels self-hosted,Linux,X64 \\"
echo "    --work _work \\"
echo "    --replace'"
echo ""
echo "To get a fresh registration token, run:"
echo "  curl -s -X POST \\"
echo "    -H \"Authorization: token <YOUR_GITHUB_PAT>\" \\"
echo "    https://api.github.com/repos/lemone112/labpics-dashboard/actions/runners/registration-token \\"
echo "    | jq -r '.token'"
echo ""
echo "=== Step B: Install runner as a service ==="
echo ""
echo "  cd $RUNNER_DIR"
echo "  sudo ./svc.sh install $RUNNER_USER"
echo "  sudo ./svc.sh start"
echo "  sudo ./svc.sh status"
echo ""
echo "=== Step C: Create backup directory ==="
echo ""
echo "  mkdir -p /backups"
echo "  chown $RUNNER_USER:$RUNNER_USER /backups"
echo ""
echo "=== Step D: Update DNS ==="
echo ""
echo "Point these A records to: 152.53.248.134"
echo "  dashboard.lab.pics     -> 152.53.248.134"
echo "  dev.dashboard.lab.pics -> 152.53.248.134"
echo ""
echo "Also add AAAA records:"
echo "  dashboard.lab.pics     -> 2a0a:4cc0:c0:abd5:8802:acff:fec7:2782"
echo "  dev.dashboard.lab.pics -> 2a0a:4cc0:c0:abd5:8802:acff:fec7:2782"
echo ""
echo "=== Step E: Trigger deployment ==="
echo ""
echo "After runner is online & DNS propagated, push to cursor/labpics_dashboard"
echo "or trigger manually: GitHub -> Actions -> Deploy (dev) -> Run workflow"
echo ""
echo "========================================"
echo " Setup script completed!"
echo "========================================"
echo ""
echo "Server info:"
echo "  Hostname: $(hostname)"
echo "  OS: $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "  Docker: $(docker --version)"
echo "  Compose: $(docker compose version)"
echo "  CPU cores: $(nproc)"
echo "  Memory: $(free -h | awk '/Mem:/{print $2}')"
echo "  Disk: $(df -h / | awk 'NR==2{print $2 " total, " $4 " free"}')"
