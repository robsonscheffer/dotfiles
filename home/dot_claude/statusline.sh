#!/usr/bin/env bash
# Claude Code statusline — Catppuccin Mocha palette
# Reads JSON from stdin, outputs ANSI-colored status segments.
input=$(cat)

# -- Colors (Catppuccin Mocha) --
CLR_RESET='\033[0m'
CLR_PATH='\033[38;2;137;180;250m'      # blue
CLR_BRANCH='\033[38;2;180;190;254m'    # lavender
CLR_DIRTY='\033[38;2;250;179;135m'     # peach
CLR_CTX_OK='\033[38;2;166;227;161m'    # green
CLR_CTX_WARN='\033[38;2;249;226;175m'  # yellow
CLR_CTX_CRIT='\033[38;2;243;139;168m'  # red
CLR_MODEL='\033[38;2;108;112;134m'     # subtext
CLR_COST='\033[38;2;108;112;134m'      # subtext
CLR_WORKTREE='\033[38;2;166;227;161m'  # green
CLR_REPO='\033[38;2;108;112;134m'      # subtext

# -- Thresholds --
CTX_WARN_PCT=40
CTX_CRIT_PCT=60

# -- Cache helper --
cache_is_stale() {
	[ ! -f "$1" ] && return 0
	local age=$(( $(date +%s) - $(stat -f %m "$1" 2>/dev/null || echo 0) ))
	[ "$age" -gt "$2" ]
}

# -- Context window --
ctx_raw=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$ctx_raw" ]; then
	ctx_raw=$(printf '%.0f%%' "$ctx_raw")
fi
ctx_num=$(echo "$ctx_raw" | tr -dc '0-9')

if [ "${ctx_num:-0}" -ge "$CTX_CRIT_PCT" ] 2>/dev/null; then
	ctx_color="$CLR_CTX_CRIT"
elif [ "${ctx_num:-0}" -ge "$CTX_WARN_PCT" ] 2>/dev/null; then
	ctx_color="$CLR_CTX_WARN"
else
	ctx_color="$CLR_CTX_OK"
fi

# -- Git info (cached 5s) --
cwd=$(echo "$input" | jq -r '.cwd // empty')
short_cwd=""
branch=""
branch_segment=""

if [ -n "$cwd" ]; then
	GIT_CACHE="/tmp/statusline-git-cache-$(echo "$cwd" | tr '/' '_')"
	if cache_is_stale "$GIT_CACHE" 5; then
		g_repo_root=""
		g_branch=""
		g_dirty_count=0
		g_ahead=0
		g_behind=0
		g_org_repo=""
		if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
			g_repo_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
			g_branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
			g_dirty_count=$(git -C "$cwd" diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
			counts=$(git -C "$cwd" rev-list --left-right --count HEAD...@{upstream} 2>/dev/null)
			if [ -n "$counts" ]; then
				g_ahead=$(echo "$counts" | awk '{print $1}')
				g_behind=$(echo "$counts" | awk '{print $2}')
			fi
			remote_url=$(git -C "$cwd" remote get-url origin 2>/dev/null)
			if [ -n "$remote_url" ]; then
				g_org_repo=$(echo "$remote_url" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
			fi
		fi
		echo "${g_repo_root}|${g_branch}|${g_dirty_count}|${g_ahead}|${g_behind}|${g_org_repo}" >"$GIT_CACHE"
	fi
	IFS='|' read -r g_repo_root g_branch g_dirty_count g_ahead g_behind g_org_repo <"$GIT_CACHE"
	branch="$g_branch"

	# Abbreviate path
	short_cwd="${cwd/#$HOME/~}"
	if [[ "$short_cwd" == */* ]]; then
		repo_root_short="${g_repo_root/#$HOME/~}"
		if [ -n "$repo_root_short" ] && [ "$short_cwd" != "$repo_root_short" ]; then
			repo_name="${repo_root_short##*/}"
			repo_parent="${repo_root_short%/*}"
			sub_path="${short_cwd#$repo_root_short}"
			abbreviated_parent=$(echo "$repo_parent" | sed 's|/\([^/]\)[^/]*|/\1|g')
			short_cwd="${abbreviated_parent}/${repo_name}${sub_path}"
		else
			parent="${short_cwd%/*}"
			leaf="${short_cwd##*/}"
			abbreviated=$(echo "$parent" | sed 's|/\([^/]\)[^/]*|/\1|g')
			short_cwd="${abbreviated}/${leaf}"
		fi
	fi

	# Build branch segment
	if [ -n "$branch" ]; then
		dirty=""
		if [ "${g_dirty_count:-0}" -gt 0 ]; then
			dirty="${CLR_DIRTY}*${g_dirty_count}${CLR_RESET}"
		fi
		ahead_behind=""
		[ "${g_ahead:-0}" -gt 0 ] && ahead_behind="${ahead_behind}↑${g_ahead}"
		[ "${g_behind:-0}" -gt 0 ] && ahead_behind="${ahead_behind}↓${g_behind}"
		[ -n "$ahead_behind" ] && ahead_behind="${CLR_DIRTY}${ahead_behind}${CLR_RESET}"
		repo_prefix=""
		if [ -n "$g_org_repo" ]; then
			repo_prefix="${CLR_REPO}${g_org_repo}${CLR_RESET}"
		fi
		branch_segment=" ${repo_prefix} ${CLR_BRANCH} ${branch}${dirty}${ahead_behind:+ ${ahead_behind}}${CLR_RESET}"
	fi
fi

# -- Model name --
model_segment=""
model_id=$(echo "$input" | jq -r '.model.id // empty')
if [ -n "$model_id" ]; then
	model_short=$(echo "$model_id" | sed -n 's/.*claude-\([a-z]*\).*/\1/p')
	if [ -n "$model_short" ]; then
		model_segment=" ${CLR_MODEL}${model_short}${CLR_RESET}"
	fi
fi

# -- Background tasks --
task_segment=""
task_count=$(echo "$input" | jq -r '.tasks // [] | map(select(.status == "running" or .status == "pending")) | length')
if [ "${task_count:-0}" -gt 0 ]; then
	task_segment=" ${CLR_CTX_WARN}⚡${task_count}${CLR_RESET}"
fi

# -- PR link (cached 30s) --
pr_segment=""
if [ -n "$branch" ]; then
	PR_CACHE="/tmp/statusline-pr-cache-$(echo "$cwd" | tr '/' '_')"
	if cache_is_stale "$PR_CACHE" 30; then
		pr_json=$(gh pr view --json url,number 2>/dev/null || echo "")
		echo "$pr_json" >"$PR_CACHE"
	else
		pr_json=$(cat "$PR_CACHE")
	fi
	if [ -n "$pr_json" ]; then
		pr_url=$(echo "$pr_json" | jq -r '.url // empty')
		pr_number=$(echo "$pr_json" | jq -r '.number // empty')
		if [ -n "$pr_url" ] && [ -n "$pr_number" ]; then
			pr_segment=" \e]8;;${pr_url}\a${CLR_BRANCH}#${pr_number}${CLR_RESET}\e]8;;\a"
		fi
	fi
fi

# -- Worktree indicator --
worktree_segment=""
worktree_name=$(echo "$input" | jq -r '.worktree.name // empty')
if [ -n "$worktree_name" ]; then
	worktree_segment=" ${CLR_WORKTREE}🌳 ${worktree_name}${CLR_RESET}"
fi

# -- Session cost --
cost_segment=""
cost_usd=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
if [ -n "$cost_usd" ] && [ "$cost_usd" != "0" ]; then
	cost_fmt=$(printf '$%.2f' "$cost_usd")
	cost_segment=" ${CLR_COST}${cost_fmt}${CLR_RESET}"
fi

printf '%b' "${CLR_PATH}${short_cwd}${CLR_RESET}${branch_segment}${pr_segment}${worktree_segment} ${ctx_color}🧠 ${ctx_raw}${CLR_RESET}${model_segment}${cost_segment}${task_segment}\n"
