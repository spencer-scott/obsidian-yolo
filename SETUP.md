# YOLO Plugin - MacBook Pro Setup

Spencer's English fork of Lapis0x0/obsidian-yolo.

## One-Time Setup

### 1. SSH Key for GitHub (if not already done)

```bash
# Check if you already have a key
ls ~/.ssh/id_ed25519.pub

# If not, generate one:
ssh-keygen -t ed25519 -C "spencer@s2analytics.io"

# Copy the public key:
cat ~/.ssh/id_ed25519.pub | pbcopy
```

Go to https://github.com/settings/keys, click **New SSH key**, paste it, save.

Verify:
```bash
ssh -T git@github.com
# Should say: Hi spencer-scott!
```

### 2. Clone the Repo

```bash
mkdir -p ~/Documents/obsidian/plugins
git clone -b english-translation git@github.com:spencer-scott/obsidian-yolo.git ~/Documents/obsidian/plugins/obsidian-yolo
cd ~/Documents/obsidian/plugins/obsidian-yolo
git remote add upstream git@github.com:Lapis0x0/obsidian-yolo.git
npm install
```

If SSH doesn't work, use HTTPS:
```bash
git clone -b english-translation https://github.com/spencer-scott/obsidian-yolo.git ~/Documents/obsidian/plugins/obsidian-yolo
```

### 3. Verify

```bash
cd ~/Documents/obsidian/plugins/obsidian-yolo
npm run build
ls -lh main.js  # Should be ~9-10MB
```

## Updating the Plugin

### Quick Update (no new Chinese text)

```bash
~/Documents/obsidian/plugins/obsidian-yolo/scripts/update-yolo.sh
```

This will:
1. Quit Obsidian
2. Fetch and merge upstream changes
3. Scan for new Chinese text
4. Build the plugin
5. Copy main.js, manifest.json, styles.css to ~/.obsidian/plugins/yolo/
6. Reopen Obsidian

### If Merge Conflicts or New Chinese Text

The script will stop and tell you. Open Claude Code in the repo:

```bash
cd ~/Documents/obsidian/plugins/obsidian-yolo
claude
```

Tell Claude: "Resolve merge conflicts and translate all new Chinese to English"

After Claude is done, finish the deploy:

```bash
~/Documents/obsidian/plugins/obsidian-yolo/scripts/update-yolo.sh --build-only
```

### Check for Updates Without Installing

```bash
~/Documents/obsidian/plugins/obsidian-yolo/scripts/update-yolo.sh --check
```

## File Layout

| File | Purpose |
|------|---------|
| `~/Documents/obsidian/plugins/obsidian-yolo/` | The git repo (source code) |
| `~/Documents/obsidian/.obsidian/plugins/yolo/` | The installed plugin (Obsidian reads from here) |
| `~/Documents/obsidian/.obsidian/plugins/yolo/data.json` | Your settings/API keys (never overwritten) |

## Custom Modifications

These are changes specific to this fork that may need reapplying after upstream merges:

- **Stream timeout**: `src/core/llm/requestTransport.ts` line 16, timeout set to 90 seconds (upstream default is 3 seconds). Needed for local LLM servers that take time to load models.
