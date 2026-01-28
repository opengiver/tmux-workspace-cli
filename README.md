# Tmux Workspace CLI

Interactive CLI tool for managing tmux workspaces easily.

## Features

- 🎨 **Interactive workspace creation** - Build complex layouts step-by-step with navigation
- 📋 **Full CRUD operations** - Create, Read, Update, Delete, and Rename workspaces
- 🚀 **Quick launch** - Start workspaces with one command
- 💾 **Configuration storage** - JSON configs for easy editing
- 🔧 **Flexible layouts** - Support for horizontal/vertical splits, custom sizes
- ↩️ **Navigation support** - Go back and forth during creation/editing

## Installation

```bash
cd ~/tmux-cli
npm install
npm link
```

Create required directories:

```bash
mkdir -p ~/.tmux-scripts ~/.tmux-cli-configs
```

## Usage

### Create a new workspace

```bash
tx create
```

**Features:**
- Navigate back and forth during setup
- Review configuration before saving
- Edit any step before finalizing

This will guide you through:
- Naming your workspace
- Setting base directory
- Adding panes (horizontal/vertical splits)
- Configuring commands for each pane
- Setting custom sizes
- **Review and confirm** before creating

### Load a workspace

```bash
tx load <workspace-name>
```

Example:
```bash
tx load deepenqt
tx load byungskerlog
```

### List all workspaces

```bash
tx list
# or
tx ls
```

**Interactive mode (default):**
- Shows all workspaces
- Use ↑↓ arrows to select
- Press Enter to load the selected workspace

**Plain list mode:**
```bash
tx ls --no-interactive
```
Shows all workspaces with pane counts and base directories without selection.

### Edit a workspace

```bash
tx edit <workspace-name>
```

**Edit options:**
- Change base directory
- Add new panes
- Edit existing panes (command, split, directory, resize)
- Remove panes (except pane 0)
- Edit script directly in your editor
- Save and exit or cancel changes

### Rename a workspace

```bash
tx rename <old-name> <new-name>
# or
tx mv <old-name> <new-name>
```

Example:
```bash
tx rename myproject my-awesome-project
```

### Delete a workspace

```bash
tx delete <workspace-name>
# or
tx rm <workspace-name>
```

Requires confirmation before deletion.

### Open config in editor

```bash
tx config                    # Open scripts directory
tx config <workspace-name>   # Open specific workspace script
```

**Note:** Make sure your `EDITOR` environment variable is set:
```bash
export EDITOR=vim
# or
export EDITOR=nvim
# or
export EDITOR="code --wait"
```

## Example Workflow

```bash
# 1. Create a new workspace with navigation
tx create
# Follow prompts, go back if you make mistakes, review before creating

# 2. Load the workspace
tx load myproject

# 3. List all workspaces
tx ls

# 4. Edit workspace (add a pane, change commands, etc.)
tx edit myproject

# 5. Rename if needed
tx rename myproject my-app

# 6. Delete when done
tx delete my-app
```

## Directory Structure

```
~/.tmux-scripts/          # Generated bash scripts
~/.tmux-cli-configs/      # JSON configurations
```

## Tips

- Use `opencode` to open VS Code in tmux
- Use `lazygit` for git management
- Small panes (5-12 lines) work well for logs/status
- Main work pane should be 100-120 columns wide
- You can go back during `tx create` to fix mistakes
- Use `tx edit` to modify existing workspaces interactively
- Use `tx config` for direct script editing

## Troubleshooting

### Editor not opening

If `tx config` or `tx edit` (with "Edit script directly") fails:

1. Check your EDITOR variable:
   ```bash
   echo $EDITOR
   ```

2. Set it properly:
   ```bash
   export EDITOR=vim
   # Add to ~/.zshrc or ~/.bashrc to persist
   ```

3. For editors that need wait flag:
   ```bash
   export EDITOR="code --wait"
   export EDITOR="zed --wait"
   ```

## Requirements

- tmux
- Node.js 18+
- bash
