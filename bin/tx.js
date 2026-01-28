#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { readdir, readFile, writeFile, unlink, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_DIR = path.join(homedir(), '.tmux-scripts');
const CONFIG_DIR = path.join(homedir(), '.tmux-cli-configs');

// Read package.json for version
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

const program = new Command();

// Ensure required directories exist
async function ensureDirectories() {
  try {
    if (!existsSync(SCRIPT_DIR)) {
      await mkdir(SCRIPT_DIR, { recursive: true });
    }
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }
  } catch (err) {
    console.error(chalk.red(`Failed to create directories: ${err.message}`));
  }
}

// Initialize directories on startup
await ensureDirectories();

// Ctrl+C 핸들러 (깔끔한 종료)
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Cancelled\n'));
  process.exit(0);
});

// Editor 실행 헬퍼 (플래그 처리)
function openEditor(filePath) {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || 'vim';
    const [cmd, ...args] = editor.split(' ');

    const proc = spawn(cmd, [...args, filePath], {
      stdio: 'inherit',
      shell: false
    });

    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// 워크스페이스 목록 가져오기
async function getWorkspaces() {
  try {
    const files = await readdir(SCRIPT_DIR);
    return files.filter(f => f.endsWith('.sh')).map(f => f.replace('.sh', ''));
  } catch {
    return [];
  }
}

// 워크스페이스 설정 저장
async function saveConfig(name, config) {
  if (!existsSync(CONFIG_DIR)) {
    await writeFile(path.join(CONFIG_DIR, '.gitkeep'), '');
  }
  await writeFile(
    path.join(CONFIG_DIR, `${name}.json`),
    JSON.stringify(config, null, 2)
  );
}

// 워크스페이스 설정 불러오기
async function loadConfig(name) {
  try {
    const content = await readFile(path.join(CONFIG_DIR, `${name}.json`), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Bash 스크립트 생성
function generateScript(config) {
  const { name, baseDir, panes } = config;

  let script = `#!/bin/bash
SESSION="${name}"
BASE_DIR=${baseDir}

tmux has-session -t $SESSION 2>/dev/null && tmux attach -t $SESSION && exit

tmux new-session -d -s $SESSION -c $BASE_DIR
`;

  // 첫 번째 패널은 이미 생성되어 있으므로 스킵
  for (let i = 1; i < panes.length; i++) {
    const pane = panes[i];
    const dir = pane.directory || '$BASE_DIR';

    if (pane.split === 'horizontal') {
      script += `\ntmux split-window -h -c ${dir}`;
    } else {
      script += `\ntmux split-window -v -c ${dir}`;
    }
  }

  // 패널 크기 조정
  panes.forEach((pane, i) => {
    if (pane.resize) {
      script += `\n\ntmux select-pane -t ${i}`;
      if (pane.resize.type === 'width') {
        script += `\ntmux resize-pane -x ${pane.resize.value}`;
      } else if (pane.resize.type === 'height') {
        script += `\ntmux resize-pane -y ${pane.resize.value}`;
      }
    }
  });

  // 명령어 실행
  panes.forEach((pane, i) => {
    if (pane.command) {
      script += `\ntmux send-keys -t ${i} '${pane.command}' C-m`;
    }
  });

  script += `\n\ntmux select-pane -t 0\ntmux attach -t $SESSION\n`;

  return script;
}

// CREATE 명령어
program
  .command('create')
  .description('Create a new tmux workspace interactively')
  .action(async () => {
    console.log(chalk.blue.bold('\n🚀 Create a new tmux workspace\n'));

    const config = {
      name: '',
      baseDir: process.cwd(),
      panes: [{ command: '' }]
    };

    let editing = true;

    while (editing) {
      // 현재 설정 상태 표시
      console.clear();
      console.log(chalk.blue.bold('🚀 Create Workspace\n'));
      console.log(chalk.cyan('Current Configuration:'));
      console.log(chalk.white(`  Name: ${config.name || chalk.gray('(not set)')}`));
      console.log(chalk.white(`  Base Dir: ${config.baseDir}`));
      console.log(chalk.white(`  Panes: ${config.panes.length}`));

      config.panes.forEach((pane, i) => {
        if (i === 0) {
          console.log(chalk.gray(`    Pane 0: ${pane.command || '(no command)'}`));
        } else {
          const parts = [`Pane ${i}: ${pane.split}`];
          if (pane.command) parts.push(`cmd="${pane.command}"`);
          if (pane.directory) parts.push(`dir="${pane.directory}"`);
          if (pane.resize) parts.push(`${pane.resize.type}=${pane.resize.value}`);
          console.log(chalk.gray(`    ${parts.join(', ')}`));
        }
      });

      console.log();

      // 편집 가능한 필드 목록 생성
      const choices = [];

      // 기본 설정
      choices.push(new inquirer.Separator(chalk.yellow('── Basic ──')));
      choices.push({
        name: `  Name: ${config.name || chalk.gray('(required)')}`,
        value: 'edit-name'
      });
      choices.push({
        name: `  Base directory: ${config.baseDir}`,
        value: 'edit-basedir'
      });

      // 패널 0
      choices.push(new inquirer.Separator(chalk.yellow('── Panes ──')));
      choices.push({
        name: `  Pane 0 - Command: ${config.panes[0].command || chalk.gray('(none)')}`,
        value: 'edit-pane-0'
      });

      // 나머지 패널들
      config.panes.slice(1).forEach((pane, idx) => {
        const i = idx + 1;
        const label = `Pane ${i}: ${pane.split} ${pane.command ? `"${pane.command}"` : ''}`;
        choices.push({
          name: `  ${label}`,
          value: `edit-pane-${i}`
        });
      });

      // 액션들
      choices.push(new inquirer.Separator(chalk.yellow('── Actions ──')));
      choices.push({
        name: chalk.green('  ➕ Add pane'),
        value: 'add-pane'
      });

      if (config.panes.length > 1) {
        choices.push({
          name: chalk.red('  ➖ Remove last pane'),
          value: 'remove-pane'
        });
      }

      choices.push(new inquirer.Separator());

      if (config.name) {
        choices.push({
          name: chalk.green.bold('  ✅ Create workspace'),
          value: 'create'
        });
      }

      choices.push({
        name: chalk.gray('  ❌ Cancel'),
        value: 'cancel'
      });

      // 메뉴 표시
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Select field to edit:',
          choices,
          pageSize: 20
        }
      ]);

      // 액션 처리
      if (answer.action === 'edit-name') {
        const result = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Workspace name:',
            default: config.name,
            validate: input => input.length > 0 || 'Name is required'
          }
        ]);
        config.name = result.name;
      }

      else if (answer.action === 'edit-basedir') {
        const result = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseDir',
            message: 'Base directory:',
            default: config.baseDir
          }
        ]);
        config.baseDir = result.baseDir;
      }

      else if (answer.action.startsWith('edit-pane-')) {
        const paneIndex = parseInt(answer.action.split('-')[2]);
        const pane = config.panes[paneIndex];

        // Pane 편집 루프
        let editingPane = true;
        while (editingPane) {
          // Pane 0는 command, resize만, 나머지는 split, directory, command, resize
          const fieldChoices = paneIndex === 0
            ? [
                { name: `Command: ${pane.command || '(none)'}`, value: 'command' },
                { name: `Resize: ${pane.resize ? `${pane.resize.type} ${pane.resize.value}` : '(none)'}`, value: 'resize' },
                new inquirer.Separator(),
                { name: '← Done', value: 'done' }
              ]
            : [
                { name: `Split: ${pane.split}`, value: 'split' },
                { name: `Directory: ${pane.directory || '(base)'}`, value: 'directory' },
                { name: `Command: ${pane.command || '(none)'}`, value: 'command' },
                { name: `Resize: ${pane.resize ? `${pane.resize.type} ${pane.resize.value}` : '(none)'}`, value: 'resize' },
                new inquirer.Separator(),
                { name: '← Done', value: 'done' }
              ];

          const editChoice = await inquirer.prompt([
            {
              type: 'list',
              name: 'field',
              message: `Edit Pane ${paneIndex}:`,
              choices: fieldChoices
            }
          ]);

          if (editChoice.field === 'done') {
            editingPane = false;
            break;
          }

          if (editChoice.field === 'split') {
            const result = await inquirer.prompt([
              {
                type: 'list',
                name: 'split',
                message: 'Split direction:',
                choices: ['horizontal', 'vertical', new inquirer.Separator(), '← Cancel'],
                default: pane.split
              }
            ]);
            if (result.split !== '← Cancel') {
              pane.split = result.split;
            }
          }
          else if (editChoice.field === 'directory') {
            const result = await inquirer.prompt([
              {
                type: 'input',
                name: 'directory',
                message: 'Directory (empty = base):',
                default: pane.directory || ''
              }
            ]);
            pane.directory = result.directory || null;
          }
          else if (editChoice.field === 'command') {
            const result = await inquirer.prompt([
              {
                type: 'input',
                name: 'command',
                message: 'Command:',
                default: pane.command || ''
              }
            ]);
            pane.command = result.command;
          }
          else if (editChoice.field === 'resize') {
            const hasResize = await inquirer.prompt([
              {
                type: 'list',
                name: 'action',
                message: 'Resize action:',
                choices: [
                  { name: 'Enable/Edit custom size', value: 'enable' },
                  { name: 'Disable custom size', value: 'disable' },
                  new inquirer.Separator(),
                  { name: '← Cancel', value: 'cancel' }
                ],
                default: pane.resize ? 'enable' : 'disable'
              }
            ]);

            if (hasResize.action === 'enable') {
              const result = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'type',
                  message: 'Resize by:',
                  choices: ['width', 'height', new inquirer.Separator(), '← Cancel'],
                  default: pane.resize?.type || 'width'
                }
              ]);

              if (result.type !== '← Cancel') {
                const sizeResult = await inquirer.prompt([
                  {
                    type: 'number',
                    name: 'value',
                    message: 'Size (lines/columns):',
                    default: pane.resize?.value || 10
                  }
                ]);
                pane.resize = { type: result.type, value: sizeResult.value };
              }
            } else if (hasResize.action === 'disable') {
              pane.resize = null;
            }
          }
        }
      }

      else if (answer.action === 'add-pane') {
        const paneIndex = config.panes.length;

        const splitChoice = await inquirer.prompt([
          {
            type: 'list',
            name: 'split',
            message: `Pane ${paneIndex} - Split:`,
            choices: ['horizontal', 'vertical', new inquirer.Separator(), '← Cancel']
          }
        ]);

        if (splitChoice.split === '← Cancel') continue;

        const newPane = await inquirer.prompt([
          {
            type: 'input',
            name: 'directory',
            message: 'Directory (empty = base):',
            default: ''
          },
          {
            type: 'input',
            name: 'command',
            message: 'Command:',
            default: ''
          },
          {
            type: 'confirm',
            name: 'needResize',
            message: 'Custom size?',
            default: false
          }
        ]);

        let resize = null;
        if (newPane.needResize) {
          const resizeChoice = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Resize by:',
              choices: ['width', 'height', new inquirer.Separator(), '← Skip']
            }
          ]);

          if (resizeChoice.type !== '← Skip') {
            const resizeValue = await inquirer.prompt([
              {
                type: 'number',
                name: 'value',
                message: 'Size:',
                default: 10
              }
            ]);
            resize = { type: resizeChoice.type, value: resizeValue.value };
          }
        }

        config.panes.push({
          split: splitChoice.split,
          directory: newPane.directory || null,
          command: newPane.command,
          resize
        });
      }

      else if (answer.action === 'remove-pane') {
        config.panes.pop();
      }

      else if (answer.action === 'create') {
        editing = false;
      }

      else if (answer.action === 'cancel') {
        console.log(chalk.yellow('\nCancelled'));
        return;
      }
    }

    // 스크립트 생성 및 저장
    const script = generateScript(config);
    await writeFile(path.join(SCRIPT_DIR, `${config.name}.sh`), script);
    spawn('chmod', ['+x', path.join(SCRIPT_DIR, `${config.name}.sh`)]);
    await saveConfig(config.name, config);

    console.log(chalk.green.bold(`\n✅ Workspace "${config.name}" created!\n`));
    console.log(chalk.gray(`Run: ${chalk.white(`tx load ${config.name}`)}`));
  });

// LOAD 명령어
program
  .command('load <workspace>')
  .description('Load a tmux workspace')
  .action(async (workspace) => {
    const script = path.join(SCRIPT_DIR, `${workspace}.sh`);

    if (!existsSync(script)) {
      console.error(chalk.red(`❌ Workspace "${workspace}" not found`));
      process.exit(1);
    }

    spawn('bash', [script], { stdio: 'inherit' });
  });

// LIST 명령어
program
  .command('list')
  .alias('ls')
  .description('List all workspaces')
  .option('-i, --interactive', 'Interactive mode (select and load)')
  .action(async (options) => {
    const workspaces = await getWorkspaces();

    if (workspaces.length === 0) {
      console.log(chalk.yellow('No workspaces found'));
      return;
    }

    // Interactive mode (기본값)
    if (options.interactive !== false) {
      console.log(chalk.blue.bold('\n📋 Available workspaces\n'));

      const choices = [];
      for (const ws of workspaces) {
        const config = await loadConfig(ws);
        if (config) {
          choices.push({
            name: `${chalk.cyan(ws)} ${chalk.gray(`(${config.panes.length} panes) - ${config.baseDir}`)}`,
            value: ws,
            short: ws
          });
        } else {
          choices.push({
            name: chalk.cyan(ws),
            value: ws,
            short: ws
          });
        }
      }

      choices.push(new inquirer.Separator());
      choices.push({
        name: chalk.gray('Cancel'),
        value: null
      });

      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'workspace',
          message: 'Select workspace to load:',
          choices,
          pageSize: 15
        }
      ]);

      if (answer.workspace) {
        const script = path.join(SCRIPT_DIR, `${answer.workspace}.sh`);
        console.log(chalk.green(`\n🚀 Loading ${answer.workspace}...\n`));
        spawn('bash', [script], { stdio: 'inherit' });
      } else {
        console.log(chalk.yellow('Cancelled'));
      }
    }
    // Plain list mode (--no-interactive)
    else {
      console.log(chalk.blue.bold('\n📋 Available workspaces:\n'));
      for (const ws of workspaces) {
        const config = await loadConfig(ws);
        if (config) {
          console.log(chalk.white(`  ${chalk.cyan(ws)} ${chalk.gray(`(${config.panes.length} panes)`)}`));
          console.log(chalk.gray(`    ${config.baseDir}`));
        } else {
          console.log(chalk.white(`  ${chalk.cyan(ws)}`));
        }
      }
      console.log();
    }
  });

// EDIT 명령어
program
  .command('edit <workspace>')
  .description('Edit workspace configuration')
  .action(async (workspace) => {
    const config = await loadConfig(workspace);

    if (!config) {
      console.error(chalk.red(`❌ Workspace "${workspace}" not found`));
      process.exit(1);
    }

    let editing = true;

    while (editing) {
      console.log(chalk.blue.bold(`\n✏️  Edit workspace: ${workspace}\n`));

      const editChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What do you want to edit?',
          choices: [
            'Base directory',
            'Add pane',
            'Edit pane',
            'Remove pane',
            'Edit script directly',
            'Save and exit',
            'Cancel'
          ]
        }
      ]);

      if (editChoice.action === 'Cancel') {
        const confirmCancel = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'sure',
            message: 'Discard changes?',
            default: false
          }
        ]);
        if (confirmCancel.sure) return;
        continue;
      }

      if (editChoice.action === 'Save and exit') {
        const script = generateScript(config);
        await writeFile(path.join(SCRIPT_DIR, `${workspace}.sh`), script);
        await saveConfig(workspace, config);
        console.log(chalk.green(`\n✅ Workspace "${workspace}" updated!\n`));
        return;
      }

      if (editChoice.action === 'Edit script directly') {
        try {
          await openEditor(path.join(SCRIPT_DIR, `${workspace}.sh`));
          console.log(chalk.green.bold(`\n✅ 변경이 완료되었어요!\n`));
        } catch (err) {
          console.error(chalk.red(`\n❌ Failed to open editor: ${err.message}`));
        }
        return;
      }

      if (editChoice.action === 'Base directory') {
        const answer = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseDir',
            message: 'New base directory:',
            default: config.baseDir
          }
        ]);
        config.baseDir = answer.baseDir;
      }

      else if (editChoice.action === 'Add pane') {
        const paneIndex = config.panes.length;

        const splitChoice = await inquirer.prompt([
          {
            type: 'list',
            name: 'split',
            message: `Pane ${paneIndex} - Split direction:`,
            choices: ['horizontal', 'vertical', new inquirer.Separator(), '← Cancel']
          }
        ]);

        if (splitChoice.split === '← Cancel') continue;

        const paneDetails = await inquirer.prompt([
          {
            type: 'input',
            name: 'directory',
            message: `Pane ${paneIndex} - Directory (leave empty for base dir):`,
            default: ''
          },
          {
            type: 'input',
            name: 'command',
            message: `Pane ${paneIndex} - Command to run:`,
            default: ''
          },
          {
            type: 'confirm',
            name: 'needResize',
            message: `Pane ${paneIndex} - Need custom size?`,
            default: false
          }
        ]);

        let resize = null;
        if (paneDetails.needResize) {
          const resizeConfig = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Resize by:',
              choices: ['width', 'height', new inquirer.Separator(), '← Skip']
            }
          ]);

          if (resizeConfig.type !== '← Skip') {
            const sizeValue = await inquirer.prompt([
              {
                type: 'number',
                name: 'value',
                message: 'Size (lines or columns):',
                default: 10
              }
            ]);
            resize = { type: resizeConfig.type, value: sizeValue.value };
          }
        }

        config.panes.push({
          split: splitChoice.split,
          directory: paneDetails.directory || null,
          command: paneDetails.command,
          resize
        });

        console.log(chalk.green(`\n✅ Pane ${paneIndex} added`));
      }

      else if (editChoice.action === 'Edit pane') {
        const paneChoices = config.panes.map((p, i) => ({
          name: `Pane ${i}: ${p.command || '(no command)'}`,
          value: i
        }));

        paneChoices.push(new inquirer.Separator());
        paneChoices.push({ name: '← Cancel', value: null });

        const paneSelect = await inquirer.prompt([
          {
            type: 'list',
            name: 'paneIndex',
            message: 'Which pane to edit?',
            choices: paneChoices
          }
        ]);

        if (paneSelect.paneIndex === null) continue;

        const paneIndex = paneSelect.paneIndex;
        const pane = config.panes[paneIndex];

        // Pane 편집 루프
        let editingPane = true;
        while (editingPane) {
          // Pane 0는 command, resize만, 나머지는 split, directory, command, resize
          const fieldChoices = paneIndex === 0
            ? [
                { name: `Command: ${pane.command || '(none)'}`, value: 'command' },
                { name: `Resize: ${pane.resize ? `${pane.resize.type} ${pane.resize.value}` : '(none)'}`, value: 'resize' },
                new inquirer.Separator(),
                { name: '← Done', value: 'done' }
              ]
            : [
                { name: `Split: ${pane.split}`, value: 'split' },
                { name: `Directory: ${pane.directory || '(base)'}`, value: 'directory' },
                { name: `Command: ${pane.command || '(none)'}`, value: 'command' },
                { name: `Resize: ${pane.resize ? `${pane.resize.type} ${pane.resize.value}` : '(none)'}`, value: 'resize' },
                new inquirer.Separator(),
                { name: '← Done', value: 'done' }
              ];

          const editPaneChoice = await inquirer.prompt([
            {
              type: 'list',
              name: 'field',
              message: `Edit Pane ${paneIndex}:`,
              choices: fieldChoices
            }
          ]);

          if (editPaneChoice.field === 'done') {
            editingPane = false;
            break;
          }

          if (editPaneChoice.field === 'command') {
            const answer = await inquirer.prompt([
              {
                type: 'input',
                name: 'command',
                message: 'Command:',
                default: pane.command
              }
            ]);
            pane.command = answer.command;
          }
          else if (editPaneChoice.field === 'split') {
            const answer = await inquirer.prompt([
              {
                type: 'list',
                name: 'split',
                message: 'Split direction:',
                choices: ['horizontal', 'vertical', new inquirer.Separator(), '← Cancel'],
                default: pane.split
              }
            ]);
            if (answer.split !== '← Cancel') {
              pane.split = answer.split;
            }
          }
          else if (editPaneChoice.field === 'directory') {
            const answer = await inquirer.prompt([
              {
                type: 'input',
                name: 'directory',
                message: 'Directory (empty = base):',
                default: pane.directory || ''
              }
            ]);
            pane.directory = answer.directory || null;
          }
          else if (editPaneChoice.field === 'resize') {
            const resizeTypeChoice = await inquirer.prompt([
              {
                type: 'list',
                name: 'type',
                message: 'Resize by:',
                choices: ['width', 'height', new inquirer.Separator(), 'Disable', '← Cancel'],
                default: pane.resize?.type || 'width'
              }
            ]);

            if (resizeTypeChoice.type === '← Cancel') {
              // Do nothing
            } else if (resizeTypeChoice.type === 'Disable') {
              pane.resize = null;
            } else {
              const sizeValue = await inquirer.prompt([
                {
                  type: 'number',
                  name: 'value',
                  message: 'Size (lines or columns):',
                  default: pane.resize?.value || 10
                }
              ]);
              pane.resize = { type: resizeTypeChoice.type, value: sizeValue.value };
            }
          }
        }

        console.log(chalk.green(`\n✅ Pane ${paneIndex} updated`));
      }

      else if (editChoice.action === 'Remove pane') {
        if (config.panes.length === 1) {
          console.log(chalk.red('\n❌ Cannot remove the last pane'));
          continue;
        }

        const paneChoices = config.panes.map((p, i) => ({
          name: `Pane ${i}: ${p.command || '(no command)'}`,
          value: i
        })).filter((_, i) => i > 0); // Pane 0은 삭제 불가

        paneChoices.push(new inquirer.Separator());
        paneChoices.push({ name: '← Cancel', value: null });

        const paneSelect = await inquirer.prompt([
          {
            type: 'list',
            name: 'paneIndex',
            message: 'Which pane to remove?',
            choices: paneChoices
          }
        ]);

        if (paneSelect.paneIndex === null) continue;

        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'sure',
            message: `Remove pane ${paneSelect.paneIndex}?`,
            default: false
          }
        ]);

        if (confirm.sure) {
          config.panes.splice(paneSelect.paneIndex, 1);
          console.log(chalk.green(`\n✅ Pane ${paneSelect.paneIndex} removed`));
        }
      }
    }
  });

// RENAME 명령어
program
  .command('rename [workspace] [newname]')
  .alias('mv')
  .description('Rename a workspace')
  .action(async (workspace, newname) => {
    const workspaces = await getWorkspaces();

    if (workspaces.length === 0) {
      console.log(chalk.yellow('No workspaces found'));
      return;
    }

    // Interactive mode
    if (!workspace) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'workspace',
          message: 'Which workspace to rename?',
          choices: workspaces
        }
      ]);
      workspace = answer.workspace;
    }

    const config = await loadConfig(workspace);

    if (!config) {
      console.error(chalk.red(`❌ Workspace "${workspace}" not found`));
      process.exit(1);
    }

    if (!newname) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'newname',
          message: 'New name:',
          validate: input => {
            if (!input || input.length === 0) return 'Name is required';
            if (workspaces.includes(input)) return `Workspace "${input}" already exists`;
            return true;
          }
        }
      ]);
      newname = answer.newname;
    }

    const newWorkspaceExists = existsSync(path.join(SCRIPT_DIR, `${newname}.sh`));
    if (newWorkspaceExists) {
      console.error(chalk.red(`❌ Workspace "${newname}" already exists`));
      process.exit(1);
    }

    // Confirm
    console.log(chalk.cyan(`\n${workspace} → ${newname}\n`));
    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Confirm rename?',
        default: true
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    try {
      // Update config
      config.name = newname;

      // Rename files
      await rename(
        path.join(SCRIPT_DIR, `${workspace}.sh`),
        path.join(SCRIPT_DIR, `${newname}.sh`)
      );

      await rename(
        path.join(CONFIG_DIR, `${workspace}.json`),
        path.join(CONFIG_DIR, `${newname}.json`)
      ).catch(() => {});

      // Regenerate script with new name
      const script = generateScript(config);
      await writeFile(path.join(SCRIPT_DIR, `${newname}.sh`), script);
      await saveConfig(newname, config);

      console.log(chalk.green.bold(`\n✅ Workspace renamed successfully!\n`));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to rename: ${err.message}`));
    }
  });

// DELETE 명령어
program
  .command('delete <workspace>')
  .alias('rm')
  .description('Delete a workspace')
  .action(async (workspace) => {
    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: chalk.red(`Delete workspace "${workspace}"?`),
        default: false
      }
    ]);

    if (!confirm.confirmed) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    try {
      await unlink(path.join(SCRIPT_DIR, `${workspace}.sh`));
      await unlink(path.join(CONFIG_DIR, `${workspace}.json`)).catch(() => {});
      console.log(chalk.green(`✅ Workspace "${workspace}" deleted`));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to delete: ${err.message}`));
    }
  });

// CONFIG 명령어
program
  .command('config [workspace]')
  .description('Open workspace config in editor')
  .action(async (workspace) => {
    const target = workspace
      ? path.join(SCRIPT_DIR, `${workspace}.sh`)
      : SCRIPT_DIR;

    if (workspace && !existsSync(target)) {
      console.error(chalk.red(`❌ Workspace "${workspace}" not found`));
      process.exit(1);
    }

    try {
      await openEditor(target);
      console.log(chalk.green.bold(`\n✅ 변경이 완료되었어요!\n`));
    } catch (err) {
      console.error(chalk.red(`❌ Failed to open editor: ${err.message}`));
      console.log(chalk.yellow(`\nMake sure EDITOR is set correctly. Current: ${process.env.EDITOR || 'not set'}`));
      console.log(chalk.gray(`Try: export EDITOR=vim  or  export EDITOR=nano`));
    }
  });

program
  .name('tx')
  .description('Interactive tmux workspace manager')
  .version(packageJson.version, '-v, --version', 'Output the current version');

program.parse();
