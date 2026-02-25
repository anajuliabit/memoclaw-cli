export async function cmdCompletions(shell: string) {
  const commands = ['init', 'migrate', 'store', 'recall', 'search', 'list', 'get', 'update', 'delete', 'bulk-delete', 'ingest', 'extract',
    'context', 'consolidate', 'relations', 'suggested', 'status', 'export', 'import', 'stats', 'browse',
    'completions', 'config', 'graph', 'history', 'purge', 'count', 'namespace', 'help'];

  const globalFlags = ['--help', '--version', '--json', '--quiet', '--namespace', '--limit', '--offset',
    '--tags', '--format', '--pretty', '--watch', '--raw', '--force', '--output', '--truncate',
    '--no-truncate', '--columns', '--sort-by', '--reverse', '--wide', '--concurrency', '--yes',
    '--timeout', '--field', '--dry-run'];

  if (shell === 'bash') {
    console.log(`# Add to ~/.bashrc:
# eval "$(memoclaw completions bash)"
_memoclaw() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local cmds="${commands.join(' ')}"
  local flags="${globalFlags.join(' ')}"

  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\$cmds" -- "\$cur") )
  elif [[ "\$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "\$flags" -- "\$cur") )
  elif [[ "\$prev" == "--format" || "\$prev" == "-f" ]]; then
    COMPREPLY=( $(compgen -W "json table csv yaml" -- "\$cur") )
  elif [[ "\${COMP_WORDS[1]}" == "relations" && "\$COMP_CWORD" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "list create delete" -- "\$cur") )
  elif [[ "\${COMP_WORDS[1]}" == "config" && "\$COMP_CWORD" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "show check init path" -- "\$cur") )
  elif [[ "\${COMP_WORDS[1]}" == "namespace" && "\$COMP_CWORD" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "list stats" -- "\$cur") )
  elif [[ "\${COMP_WORDS[1]}" == "completions" && "\$COMP_CWORD" -eq 2 ]]; then
    COMPREPLY=( $(compgen -W "bash zsh fish" -- "\$cur") )
  fi
}
complete -F _memoclaw memoclaw`);
  } else if (shell === 'zsh') {
    console.log(`# Add to ~/.zshrc:
# eval "$(memoclaw completions zsh)"
_memoclaw() {
  local -a commands=(${commands.map(c => `'${c}'`).join(' ')})
  local -a flags=(${globalFlags.map(f => `'${f}'`).join(' ')})

  if (( CURRENT == 2 )); then
    _describe 'command' commands
  else
    case \${words[2]} in
      relations)  _values 'subcommand' list create delete ;;
      config)     _values 'subcommand' show check init path ;;
      namespace)  _values 'subcommand' list stats ;;
      completions) _values 'shell' bash zsh fish ;;
      *)
        if [[ "\$PREFIX" == -* ]]; then
          _describe 'flag' flags
        fi
        ;;
    esac
  fi
}
compdef _memoclaw memoclaw`);
  } else if (shell === 'fish') {
    console.log(`# Add to ~/.config/fish/completions/memoclaw.fish:
${commands.map(cmd => `complete -c memoclaw -n '__fish_use_subcommand' -a '${cmd}'`).join('\n')}

# Subcommands
complete -c memoclaw -n '__fish_seen_subcommand_from relations' -a 'list create delete'
complete -c memoclaw -n '__fish_seen_subcommand_from config' -a 'show check init path'
complete -c memoclaw -n '__fish_seen_subcommand_from namespace' -a 'list stats'
complete -c memoclaw -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish'

# Global flags
${globalFlags.map(f => `complete -c memoclaw -l '${f.replace(/^--/, '')}'`).join('\n')}`);
  } else {
    throw new Error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
  }
}
